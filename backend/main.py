"""
Mirra - Main Application
Your personal Mirra. Completely local. Privacy first.
"""

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from backend.config import settings
from backend.api.routes import (
    auth_router, twin_router, intent_router,
    capture_router, system_router, training_router
)
from backend.database.models import create_database
from backend.database.vector_store import vector_store
from backend.ml.llm_engine import llm_engine
from backend.ml.voice_engine import stt_engine, tts_engine
from backend.ml.emotion_engine import emotion_engine
from backend.services.twin.twin_engine import twin_engine
from backend.services.intent_os.intent_engine import intent_engine
from backend.services.data_capture.capture_engine import (
    audio_capture, video_capture, interaction_tracker
)
from backend.security.firewall import firewall


# Detect cloud environment (Railway sets RAILWAY_ENVIRONMENT automatically)
IS_CLOUD = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("VERCEL"))


def setup_logging():
    """Configure logging."""
    try:
        log_file = settings.get_abs_path(settings.server.LOG_FILE)
        log_file.parent.mkdir(parents=True, exist_ok=True)
        logger.add(
            str(log_file),
            rotation="10 MB",
            retention="30 days",
            level=settings.server.LOG_LEVEL,
        )
    except Exception as e:
        logger.warning(f"File logging unavailable: {e}")


async def _full_startup():
    """
    All heavy init runs as a background task so the lifespan yields
    immediately and Railway's healthcheck passes on the first attempt.
    """
    logger.info("=" * 50)
    logger.info("  MIRRA - Background Init Starting")
    logger.info(f"  Mode: {'Cloud' if IS_CLOUD else 'Local'}")
    logger.info("=" * 50)

    setup_logging()

    try:
        settings.ensure_directories()
    except Exception as e:
        logger.warning(f"Directory setup failed (non-fatal): {e}")

    # Database (PostgreSQL → SQLite fallback handled inside create_database)
    try:
        create_database()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database init failed: {e}")

    # Vector store (skipped in cloud — no ONNX download hanging startup)
    try:
        vector_store.initialize()
        logger.info("Vector store initialized")
    except Exception as e:
        logger.error(f"Vector store init failed (non-fatal): {e}")

    # LLM engine — network call to Groq (or Ollama fallback); has its own timeouts
    try:
        await asyncio.wait_for(llm_engine.initialize(), timeout=30.0)
        logger.info("LLM engine initialized")
    except asyncio.TimeoutError:
        logger.error("LLM engine init timed out after 30s — continuing without LLM")
    except Exception as e:
        logger.error(f"LLM engine init failed (non-fatal): {e}")

    # Business logic engines
    for name, fn in [
        ("twin_engine",          lambda: twin_engine.initialize()),
        ("intent_engine",        lambda: intent_engine.initialize()),
        ("interaction_tracker",  lambda: interaction_tracker.initialize()),
    ]:
        try:
            fn()
            logger.info(f"{name} initialized")
        except Exception as e:
            logger.error(f"{name} init failed (non-fatal): {e}")

    # Heavy local-only models (skipped in cloud)
    if not IS_CLOUD:
        try:
            emotion_engine.initialize(load_face=False, load_voice=False)
        except Exception as e:
            logger.warning(f"Emotion engine init failed: {e}")
        try:
            stt_engine.initialize()
        except Exception as e:
            logger.warning(f"STT engine init failed: {e}")
        try:
            audio_capture.initialize()
            video_capture.initialize()
        except Exception as e:
            logger.warning(f"Capture engines init failed: {e}")

    logger.info("=" * 50)
    logger.info("  MIRRA - Background Init Complete")
    logger.info("=" * 50)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Yield immediately so uvicorn starts serving (and Railway healthcheck passes).
    All real initialization happens in _full_startup() background task.
    """
    logger.info("MIRRA starting — spawning background init...")
    asyncio.create_task(_full_startup())
    yield
    logger.info("MIRRA shutting down...")
    try:
        await llm_engine.close()
    except Exception:
        pass


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Mirra",
    description="Your Personal Mirra - 100% Local, 100% Private",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — combine base origins + any extra ones from env
_cors_origins = list(settings.server.CORS_ORIGINS)
if settings.server.CORS_EXTRA_ORIGINS:
    _cors_origins += [o.strip() for o in settings.server.CORS_EXTRA_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(twin_router)
app.include_router(intent_router)
app.include_router(capture_router)
app.include_router(system_router)
app.include_router(training_router)

# Frontend static files (only present when built locally)
from pathlib import Path
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


@app.get("/health")
async def health():
    """Health check — always responds immediately."""
    return {"status": "ok", "app": "Mirra", "version": settings.APP_VERSION}


@app.get("/")
async def root():
    return {
        "app": "Mirra",
        "version": settings.APP_VERSION,
        "status": "running",
        "message": "Your Mirra is ready.",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.server.HOST,
        port=settings.server.PORT,
        reload=False,
        log_level="info",
    )
