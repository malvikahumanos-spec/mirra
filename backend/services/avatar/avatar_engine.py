"""
Mirra - Avatar Engine
Manages the digital twin's face rendering state.
Supports three progressive tiers:
  1. SVG placeholder  — works immediately, no data needed
  2. Photo mode       — user uploads a photo, shown with live overlays
  3. Trained model    — face model trained on emotion recordings
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from loguru import logger

from backend.config import settings


# Emotions the avatar can express
VALID_EMOTIONS = {
    "neutral", "happy", "sad", "angry", "surprised",
    "excited", "loving", "thoughtful", "fearful", "disgusted",
}

# Default avatar config — warm Indian skin tones for Malvika
DEFAULT_CONFIG = {
    "display_name": "Mirra",
    "skin_tone": "#C68642",          # warm medium-brown (Indian)
    "skin_tone_light": "#E8A870",    # highlight
    "hair_color": "#1A0800",         # very dark brown/black
    "hair_highlight": "#3D1F0A",     # subtle highlight
    "eye_color": "#2C1A0E",          # dark brown
    "lip_color": "#A0524A",          # natural Indian lip tone
    "blush_color": "#C97050",        # warm blush
    "model_status": "placeholder",   # placeholder | photo | trained
    "photo_path": None,
    "model_path": None,
    "updated_at": None,
}


class AvatarEngine:
    """
    Central state manager for the digital twin's face.

    Tracks emotion, speaking, thinking states in real-time.
    Persists avatar config (appearance + model paths) to disk.
    Exposes get_state() for WebSocket broadcasting.
    """

    def __init__(self):
        self._emotion: str = "neutral"
        self._is_speaking: bool = False
        self._is_thinking: bool = False
        self._config: dict = dict(DEFAULT_CONFIG)
        self._config_path: Optional[Path] = None
        self._initialized: bool = False

        # Connected WebSocket clients get pushed state changes
        self._ws_clients: list = []

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def initialize(self):
        """Load persisted config from disk."""
        try:
            self._config_path = settings.get_abs_path("data/avatar/config.json")
            self._config_path.parent.mkdir(parents=True, exist_ok=True)

            if self._config_path.exists():
                with open(self._config_path) as f:
                    saved = json.load(f)
                # Merge saved over defaults (so new fields still appear)
                self._config = {**DEFAULT_CONFIG, **saved}
                logger.info(f"Avatar config loaded — mode: {self._config['model_status']}")
            else:
                self._save_config()
                logger.info("Avatar config created (defaults)")

            self._initialized = True
        except Exception as e:
            logger.error(f"Avatar engine init failed: {e}")

    def _save_config(self):
        try:
            self._config["updated_at"] = datetime.now(timezone.utc).isoformat()
            with open(self._config_path, "w") as f:
                json.dump(self._config, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save avatar config: {e}")

    # ── Real-time state ────────────────────────────────────────────────────────

    def set_emotion(self, emotion: str):
        if emotion not in VALID_EMOTIONS:
            emotion = "neutral"
        self._emotion = emotion

    def set_speaking(self, speaking: bool):
        self._is_speaking = speaking

    def set_thinking(self, thinking: bool):
        self._is_thinking = thinking

    def get_state(self) -> dict:
        """Full state snapshot — sent to frontend over WebSocket."""
        return {
            "emotion": self._emotion,
            "is_speaking": self._is_speaking,
            "is_thinking": self._is_thinking,
            "model_status": self._config["model_status"],
            "has_photo": self._config["photo_path"] is not None,
            "display_name": self._config["display_name"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # ── Config ─────────────────────────────────────────────────────────────────

    def get_config(self) -> dict:
        """Return full config (hide absolute paths for frontend)."""
        safe = dict(self._config)
        if safe.get("photo_path"):
            safe["photo_path"] = "/api/avatar/photo"   # serve via API, not raw path
        if safe.get("model_path"):
            safe["model_path"] = "/api/avatar/model"
        return safe

    def update_config(self, updates: dict) -> dict:
        """Update appearance settings."""
        allowed = {
            "display_name", "skin_tone", "skin_tone_light",
            "hair_color", "hair_highlight", "eye_color",
            "lip_color", "blush_color",
        }
        for k, v in updates.items():
            if k in allowed:
                self._config[k] = v
        self._save_config()
        return self.get_config()

    # ── Photo upload ────────────────────────────────────────────────────────────

    def save_photo(self, file_bytes: bytes, filename: str) -> dict:
        """
        Save uploaded face photo.
        Switches model_status → 'photo' so the frontend renders the real face.
        """
        try:
            photo_dir = settings.get_abs_path("data/avatar")
            photo_dir.mkdir(parents=True, exist_ok=True)

            # Keep only the latest photo (delete old one)
            for old in photo_dir.glob("photo.*"):
                old.unlink(missing_ok=True)

            ext = Path(filename).suffix.lower() or ".jpg"
            dest = photo_dir / f"photo{ext}"
            dest.write_bytes(file_bytes)

            self._config["photo_path"] = str(dest)
            self._config["model_status"] = "photo"
            self._save_config()

            logger.info(f"Avatar photo saved: {dest} ({len(file_bytes)//1024} KB)")
            return {"status": "ok", "photo_path": "/api/avatar/photo", "model_status": "photo"}
        except Exception as e:
            logger.error(f"Failed to save avatar photo: {e}")
            raise

    def get_photo_path(self) -> Optional[Path]:
        if self._config.get("photo_path"):
            p = Path(self._config["photo_path"])
            return p if p.exists() else None
        return None

    # ── Trained model ───────────────────────────────────────────────────────────

    def register_trained_model(self, model_path: str) -> dict:
        """
        Called after Colab training completes and model is uploaded.
        Switches model_status → 'trained'.
        """
        p = Path(model_path)
        if not p.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        self._config["model_path"] = str(p)
        self._config["model_status"] = "trained"
        self._save_config()
        logger.info(f"Trained face model registered: {p}")
        return self.get_config()

    # ── WebSocket clients ───────────────────────────────────────────────────────

    def add_ws_client(self, ws):
        self._ws_clients.append(ws)

    def remove_ws_client(self, ws):
        self._ws_clients = [c for c in self._ws_clients if c is not ws]

    async def broadcast_state(self):
        """Push current state to all connected WebSocket clients."""
        import asyncio, json as _json
        state = self.get_state()
        dead = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(_json.dumps(state))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.remove_ws_client(ws)


# Singleton
avatar_engine = AvatarEngine()
