"""
Mirra - Encryption Layer
AES-256-GCM encryption for all personal data at rest.
All keys stored locally, never transmitted.
"""

import os
import base64
import json
import hashlib
from pathlib import Path
from typing import Optional, Union

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from loguru import logger

from backend.config import settings


class EncryptionManager:
    """Manages all encryption operations. Everything stays local."""

    def __init__(self):
        self._master_key: Optional[bytes] = None
        self._fernet: Optional[Fernet] = None
        self._key_file = settings.get_abs_path(settings.security.ENCRYPTION_KEY_FILE)

    def initialize(self, master_password: str) -> bool:
        """Initialize encryption with master password. Creates or loads key."""
        try:
            if self._key_file.exists():
                return self._load_key(master_password)
            else:
                return self._create_key(master_password)
        except Exception as e:
            logger.error(f"Encryption initialization failed: {e}")
            return False

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        """Derive encryption key from password using PBKDF2."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600_000,  # High iteration count for security
        )
        return kdf.derive(password.encode())

    def _create_key(self, master_password: str) -> bool:
        """Create new master encryption key."""
        try:
            salt = os.urandom(32)
            derived_key = self._derive_key(master_password, salt)

            # Generate master key
            self._master_key = os.urandom(32)

            # Encrypt master key with derived key
            aesgcm = AESGCM(derived_key)
            nonce = os.urandom(12)
            encrypted_master = aesgcm.encrypt(nonce, self._master_key, None)

            # Store encrypted master key
            key_data = {
                "salt": base64.b64encode(salt).decode(),
                "nonce": base64.b64encode(nonce).decode(),
                "encrypted_key": base64.b64encode(encrypted_master).decode(),
                "verification_hash": hashlib.sha256(self._master_key).hexdigest(),
            }

            self._key_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._key_file, "w") as f:
                json.dump(key_data, f)

            # Set restrictive permissions
            os.chmod(self._key_file, 0o600)

            # Initialize Fernet with derived key
            fernet_key = base64.urlsafe_b64encode(self._master_key)
            self._fernet = Fernet(fernet_key)

            logger.info("Master encryption key created successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to create encryption key: {e}")
            return False

    def _load_key(self, master_password: str) -> bool:
        """Load and decrypt master key."""
        try:
            with open(self._key_file, "r") as f:
                key_data = json.load(f)

            salt = base64.b64decode(key_data["salt"])
            nonce = base64.b64decode(key_data["nonce"])
            encrypted_key = base64.b64decode(key_data["encrypted_key"])

            derived_key = self._derive_key(master_password, salt)
            aesgcm = AESGCM(derived_key)

            self._master_key = aesgcm.decrypt(nonce, encrypted_key, None)

            # Verify key
            if hashlib.sha256(self._master_key).hexdigest() != key_data["verification_hash"]:
                raise ValueError("Key verification failed")

            fernet_key = base64.urlsafe_b64encode(self._master_key)
            self._fernet = Fernet(fernet_key)

            logger.info("Master encryption key loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to load encryption key: {e}")
            return False

    def encrypt(self, data: Union[str, bytes]) -> bytes:
        """Encrypt data using Fernet (AES-128-CBC under the hood)."""
        if not self._fernet:
            raise RuntimeError("Encryption not initialized. Call initialize() first.")
        if isinstance(data, str):
            data = data.encode()
        return self._fernet.encrypt(data)

    def decrypt(self, encrypted_data: bytes) -> bytes:
        """Decrypt data."""
        if not self._fernet:
            raise RuntimeError("Encryption not initialized. Call initialize() first.")
        return self._fernet.decrypt(encrypted_data)

    def encrypt_file(self, file_path: Path, output_path: Optional[Path] = None) -> Path:
        """Encrypt an entire file."""
        if not output_path:
            output_path = file_path.with_suffix(file_path.suffix + ".enc")

        with open(file_path, "rb") as f:
            data = f.read()

        encrypted = self.encrypt(data)

        with open(output_path, "wb") as f:
            f.write(encrypted)

        logger.debug(f"File encrypted: {file_path} -> {output_path}")
        return output_path

    def decrypt_file(self, encrypted_path: Path, output_path: Optional[Path] = None) -> Path:
        """Decrypt an entire file."""
        if not output_path:
            output_path = encrypted_path.with_suffix("")

        with open(encrypted_path, "rb") as f:
            encrypted_data = f.read()

        decrypted = self.decrypt(encrypted_data)

        with open(output_path, "wb") as f:
            f.write(decrypted)

        logger.debug(f"File decrypted: {encrypted_path} -> {output_path}")
        return output_path

    def encrypt_json(self, data: dict) -> str:
        """Encrypt a dictionary as JSON."""
        json_str = json.dumps(data)
        encrypted = self.encrypt(json_str)
        return base64.b64encode(encrypted).decode()

    def decrypt_json(self, encrypted_str: str) -> dict:
        """Decrypt an encrypted JSON string back to dict."""
        encrypted = base64.b64decode(encrypted_str)
        decrypted = self.decrypt(encrypted)
        return json.loads(decrypted.decode())

    @property
    def is_initialized(self) -> bool:
        return self._fernet is not None


# Singleton
encryption_manager = EncryptionManager()
