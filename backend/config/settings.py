"""
Mirra - Configuration Settings
Supports both local (Ollama) and cloud (Groq) AI backends.
"""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class SecuritySettings(BaseSettings):
    SECRET_KEY: str = Field(default="CHANGE-THIS-TO-A-RANDOM-SECRET-KEY-AT-LEAST-64-CHARS")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    ENCRYPTION_KEY_FILE: str = "data/encrypted/.master_key"
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 30
    PASSWORD_MIN_LENGTH: int = 12
    SESSION_TIMEOUT_MINUTES: int = 60


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # Supabase / PostgreSQL (cloud) — set DATABASE_URL to enable
    DATABASE_URL: Optional[str] = Field(default=None)
    SUPABASE_URL: Optional[str] = Field(default=None)
    SUPABASE_ANON_KEY: Optional[str] = Field(default=None)

    # SQLite (local fallback — used when DATABASE_URL is not set)
    SQLITE_DB_PATH: str = "data/mirra.db"

    VECTOR_DB_PATH: str = "data/embeddings/chromadb"
    BACKUP_PATH: str = "data/backups"
    MAX_BACKUP_COUNT: int = 10


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # Groq API (cloud LLM — fast, free tier available)
    GROQ_API_KEY: Optional[str] = Field(default=None)
    GROQ_MODEL: str = "llama-3.1-8b-instant"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

    # Ollama (local LLM fallback)
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"

    # Whisper (local speech-to-text)
    WHISPER_MODEL_SIZE: str = "base"  # tiny, base, small, medium, large
    WHISPER_LANGUAGE: str = "en"

    # Voice cloning
    VOICE_SAMPLES_DIR: str = "data/voice_samples"
    VOICE_MODEL_PATH: str = "models/voice"
    MIN_VOICE_SAMPLES: int = 5  # minimum audio clips for voice cloning

    # Face/Avatar
    FACE_SAMPLES_DIR: str = "data/face_samples"
    FACE_MODEL_PATH: str = "models/face"

    # Emotion detection
    EMOTION_MODEL_PATH: str = "models/emotion"

    # Personality learning
    PERSONALITY_UPDATE_INTERVAL_HOURS: int = 24
    MIN_INTERACTIONS_FOR_LEARNING: int = 50

    # Embedding
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384


class IntentOSSettings(BaseSettings):
    # Calendar
    CALENDAR_SYNC_INTERVAL_MINUTES: int = 15
    CALENDAR_FILES_DIR: str = "data/calendar"

    # Email (local IMAP)
    EMAIL_CHECK_INTERVAL_MINUTES: int = 10
    EMAIL_CACHE_DIR: str = "data/email_cache"

    # Notes
    NOTES_DIR: str = "data/notes"

    # Tasks
    TASK_PRIORITY_LEARNING_ENABLED: bool = True
    DECISION_PATTERN_ANALYSIS_ENABLED: bool = True


class DataCaptureSettings(BaseSettings):
    RECORDINGS_DIR: str = "data/recordings"
    MAX_RECORDING_DURATION_HOURS: int = 8
    AUTO_TRANSCRIBE: bool = True
    CAPTURE_SCREEN: bool = False  # Disabled by default for privacy
    CAPTURE_AUDIO: bool = True
    CAPTURE_VIDEO: bool = False  # Disabled by default
    FRAME_CAPTURE_INTERVAL_SECONDS: int = 5


class ServerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # Override HOST=0.0.0.0 and PORT=$PORT on Railway
    HOST: str = "127.0.0.1"
    PORT: int = 8765
    WORKERS: int = 1

    # Comma-separated list of allowed CORS origins
    # Add your Vercel URL here: e.g. "https://mirra.vercel.app"
    CORS_ORIGINS: list = [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ]
    CORS_EXTRA_ORIGINS: str = ""  # e.g. "https://mirra.vercel.app,https://mirra.com"

    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/mirra.log"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    APP_NAME: str = "Mirra"
    APP_VERSION: str = "1.0.0"
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DEBUG: bool = False

    security: SecuritySettings = SecuritySettings()
    database: DatabaseSettings = DatabaseSettings()
    ai: AISettings = AISettings()
    intent_os: IntentOSSettings = IntentOSSettings()
    data_capture: DataCaptureSettings = DataCaptureSettings()
    server: ServerSettings = ServerSettings()

    def get_abs_path(self, relative_path: str) -> Path:
        return self.BASE_DIR / relative_path

    def ensure_directories(self):
        dirs = [
            self.database.SQLITE_DB_PATH,
            self.database.VECTOR_DB_PATH,
            self.database.BACKUP_PATH,
            self.ai.VOICE_SAMPLES_DIR,
            self.ai.FACE_SAMPLES_DIR,
            self.ai.VOICE_MODEL_PATH,
            self.ai.FACE_MODEL_PATH,
            self.ai.EMOTION_MODEL_PATH,
            self.intent_os.CALENDAR_FILES_DIR,
            self.intent_os.EMAIL_CACHE_DIR,
            self.intent_os.NOTES_DIR,
            self.data_capture.RECORDINGS_DIR,
            self.server.LOG_FILE,
        ]
        for d in dirs:
            path = self.get_abs_path(d)
            if path.suffix:  # It's a file path
                path.parent.mkdir(parents=True, exist_ok=True)
            else:
                path.mkdir(parents=True, exist_ok=True)


settings = Settings()
