"""
Mirra - Main Application
Your personal Mirra. Completely local. Privacy first.

        ╔══════════════════════════════════╗
        ║           MIRRA v1.0             ║
        ║        Your Mirra System         ║
        ║    100% Local. 100% Private.     ║
        ╚══════════════════════════════════╝
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


def setup_logging():
    """Configure logging."""
    log_file = settings.get_abs_path(settings.server.LOG_FILE)
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger.add(
        str(log_file),
        rotation="10 MB",
        retention="30 days",
        level=settings.server.LOG_LEVEL,
    )


# Detect cloud environment (Railway sets this automatically)
IS_CLOUD = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("VERCEL"))


async def _background_init():
    """Heavy model downloads run after app is ready to serve requests."""
    # Small delay so health check passes first
    await asyncio.sleep(2)
    logger.info("Background init: loading heavy models...")

    # Emotion model (~270MB HuggingFace download — skip in cloud)
    if not IS_CLOUD:
        emotion_engine.initialize(load_face=False, load_voice=False)

    # Whisper STT (local only)
    if not IS_CLOUD:
        stt_engine.initialize()

    # Data capture engines (local only)
    if not IS_CLOUD:
        audio_capture.initialize()
        video_capture.initialize()

    logger.info("Background init complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup — fast path for cloud, full init for local."""
    logger.info("=" * 50)
    logger.info("  MIRRA - Starting Up")
    logger.info(f"  Mode: {'Cloud ☁️' if IS_CLOUD else 'Local 🏠'}")
    logger.info("=" * 50)

    setup_logging()
    settings.ensure_directories()

    # Fast startup: DB + vector store + LLM (always needed)
    create_database()
    logger.info("Database initialized")

    vector_store.initialize()
    logger.info("Vector store initialized")

    await llm_engine.initialize()

    # Always-needed services
    twin_engine.initialize()
    intent_engine.initialize()
    interaction_tracker.initialize()

    logger.info(f"Server binding: {settings.server.HOST}:{settings.server.PORT}")
    logger.info(f"Firewall status: {firewall.get_security_report()['status']}")

    logger.info("=" * 50)
    logger.info("  MIRRA - Ready!")
    logger.info("=" * 50)

    # Heavy models load in background (doesn't block healthcheck)
    asyncio.create_task(_background_init())

    yield

    # Shutdown
    logger.info("MIRRA shutting down...")
    await llm_engine.close()


# Create FastAPI app
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

# Register routers
app.include_router(auth_router)
app.include_router(twin_router)
app.include_router(intent_router)
app.include_router(capture_router)
app.include_router(system_router)
app.include_router(training_router)

# Serve frontend static files
from pathlib import Path
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


@app.get("/health")
async def health():
    """Health check endpoint — used by Railway and uptime monitors."""
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
