"""
Mirra - Authentication System
Local-only authentication with session management.
Users are persisted to disk so they survive server restarts.
"""

import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from loguru import logger

from backend.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Where users are stored on disk — resolve to absolute path from this file's location
USERS_FILE = (Path(__file__).parent.parent.parent / "data" / "users.json").resolve()


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class AuthManager:
    """Handles local authentication. Users persisted to disk."""

    def __init__(self):
        self._users: dict = {}          # username -> {hashed_password, created_at, ...}
        self._session_tokens: dict = {} # token -> username
        self._active_sessions: dict = {}# username -> expires_at
        self._load_users()

    def _load_users(self):
        """Load users from disk."""
        try:
            USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
            if USERS_FILE.exists():
                with open(USERS_FILE, "r") as f:
                    self._users = json.load(f)
                logger.info(f"Loaded {len(self._users)} user(s) from disk")
        except Exception as e:
            logger.error(f"Failed to load users: {e}")
            self._users = {}

    def _save_users(self):
        """Persist users to disk."""
        try:
            USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(USERS_FILE, "w") as f:
                json.dump(self._users, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save users: {e}")

    def create_user(self, username: str, password: str) -> bool:
        """Create a new local user."""
        if username in self._users:
            logger.warning(f"User already exists: {username}")
            return False

        if len(password) < settings.security.PASSWORD_MIN_LENGTH:
            logger.warning("Password too short")
            return False

        hashed = pwd_context.hash(password)
        self._users[username] = {
            "username": username,
            "hashed_password": hashed,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": None,
            "failed_attempts": 0,
            "locked_until": None,
        }
        self._save_users()
        logger.info(f"User created: {username}")
        return True

    def authenticate(self, username: str, password: str) -> Optional[Token]:
        """Authenticate user and return JWT token."""
        user = self._users.get(username)
        if not user:
            logger.warning(f"Authentication failed: unknown user {username}")
            return None

        # Check lockout
        if user.get("locked_until"):
            locked_until = datetime.fromisoformat(user["locked_until"])
            if datetime.now(timezone.utc) < locked_until:
                remaining = (locked_until - datetime.now(timezone.utc)).seconds // 60
                logger.warning(f"Account locked for {remaining} more minutes: {username}")
                return None

        if not pwd_context.verify(password, user["hashed_password"]):
            user["failed_attempts"] = user.get("failed_attempts", 0) + 1
            if user["failed_attempts"] >= settings.security.MAX_LOGIN_ATTEMPTS:
                user["locked_until"] = (
                    datetime.now(timezone.utc) +
                    timedelta(minutes=settings.security.LOCKOUT_DURATION_MINUTES)
                ).isoformat()
                logger.warning(f"Account locked due to failed attempts: {username}")
            self._save_users()
            return None

        # Reset failed attempts on success
        user["failed_attempts"] = 0
        user["locked_until"] = None
        user["last_login"] = datetime.now(timezone.utc).isoformat()
        self._save_users()

        # Generate token
        expires = datetime.now(timezone.utc) + timedelta(
            minutes=settings.security.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        token_data = {
            "sub": username,
            "exp": expires,
            "iat": datetime.now(timezone.utc),
            "jti": secrets.token_hex(16),
        }
        access_token = jwt.encode(
            token_data, settings.security.SECRET_KEY, algorithm=settings.security.ALGORITHM
        )

        self._session_tokens[access_token] = username
        self._active_sessions[username] = expires

        logger.info(f"User authenticated: {username}")
        return Token(access_token=access_token, expires_at=expires)

    def validate_token(self, token: str) -> Optional[str]:
        """Validate JWT token and return username."""
        try:
            payload = jwt.decode(
                token, settings.security.SECRET_KEY, algorithms=[settings.security.ALGORITHM]
            )
            username = payload.get("sub")
            if not username:
                return None

            # Accept token if user exists (even after restart, sessions are re-validated via JWT)
            if username not in self._users:
                return None

            return username
        except JWTError:
            return None

    def logout(self, token: str) -> bool:
        """Invalidate a session."""
        username = self._session_tokens.pop(token, None)
        if username:
            self._active_sessions.pop(username, None)
            logger.info(f"User logged out: {username}")
            return True
        return False

    def change_password(self, username: str, old_password: str, new_password: str) -> bool:
        """Change user password."""
        user = self._users.get(username)
        if not user:
            return False

        if not pwd_context.verify(old_password, user["hashed_password"]):
            return False

        if len(new_password) < settings.security.PASSWORD_MIN_LENGTH:
            return False

        user["hashed_password"] = pwd_context.hash(new_password)
        self._save_users()

        # Invalidate all sessions for this user
        tokens_to_remove = [t for t, u in self._session_tokens.items() if u == username]
        for t in tokens_to_remove:
            del self._session_tokens[t]
        self._active_sessions.pop(username, None)

        logger.info(f"Password changed for user: {username}")
        return True

    def get_active_sessions_count(self) -> int:
        """Get count of active sessions."""
        now = datetime.now(timezone.utc)
        expired = [u for u, exp in self._active_sessions.items() if exp < now]
        for u in expired:
            del self._active_sessions[u]
        return len(self._active_sessions)


# Singleton
auth_manager = AuthManager()
