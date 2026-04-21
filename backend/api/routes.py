"""
Mirra - API Routes
All endpoints are localhost-only. No external access.
"""

import os
import json
import shutil
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path

from fastapi import (
    APIRouter, HTTPException, Depends, UploadFile, File,
    Header, Query, WebSocket, WebSocketDisconnect
)
from pydantic import BaseModel, Field
from loguru import logger

from backend.security.auth import auth_manager, Token
from backend.security.firewall import firewall
from backend.services.twin.twin_engine import twin_engine
from backend.services.twin.personality import personality_learner
from backend.services.intent_os.intent_engine import intent_engine
from backend.services.data_capture.capture_engine import (
    audio_capture, video_capture, interaction_tracker
)
from backend.database.vector_store import vector_store
from backend.database.models import get_session_factory
from backend.config import settings


# --- Auth dependency ---
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    username = auth_manager.validate_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return username


# --- Request/Response Models ---

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=12)

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    contact_name: Optional[str] = None
    include_voice: bool = False

class MemoryRequest(BaseModel):
    content: str
    category: str = "personal"
    importance: float = 0.5

class ContactRequest(BaseModel):
    name: str
    relationship_type: str = "other"
    label: str = ""
    language: str = "en"
    tone: str = "warm"
    topics: list[str] = []
    notes: str = ""

class NoteRequest(BaseModel):
    title: str
    content: str
    category: str = "general"
    tags: list[str] = []

class TaskRequest(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    category: str = ""
    due_date: Optional[str] = None
    tags: list[str] = []

class TaskUpdateRequest(BaseModel):
    status: str

class CalendarEventRequest(BaseModel):
    title: str
    start_time: str
    end_time: Optional[str] = None
    description: str = ""
    location: str = ""
    category: str = ""
    priority: str = "medium"


# --- Routers ---

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])
twin_router = APIRouter(prefix="/api/twin", tags=["Mirra"])
intent_router = APIRouter(prefix="/api/intent", tags=["Intent OS"])
capture_router = APIRouter(prefix="/api/capture", tags=["Data Capture"])
system_router = APIRouter(prefix="/api/system", tags=["System"])


# ==================== AUTH ====================

@auth_router.post("/register")
async def register(req: RegisterRequest):
    success = auth_manager.create_user(req.username, req.password)
    if not success:
        raise HTTPException(status_code=400, detail="Registration failed. User may already exist or password too short.")
    return {"message": "User registered successfully", "username": req.username}


@auth_router.post("/login", response_model=Token)
async def login(req: LoginRequest):
    token = auth_manager.authenticate(req.username, req.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials or account locked")
    return token


@auth_router.post("/logout")
async def logout(user: str = Depends(get_current_user), authorization: str = Header(None)):
    token = authorization.split(" ")[1]
    auth_manager.logout(token)
    return {"message": "Logged out"}


# ==================== MIRRA ====================

@twin_router.post("/chat")
async def chat(req: ChatRequest, user: str = Depends(get_current_user)):
    """Chat with Mirra."""
    result = await twin_engine.chat(
        message=req.message,
        conversation_id=req.conversation_id,
        contact_name=req.contact_name,
        include_voice=req.include_voice,
    )
    return result


@twin_router.websocket("/chat/stream")
async def chat_stream_ws(websocket: WebSocket):
    """WebSocket endpoint for streaming twin responses."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            conversation_id = data.get("conversation_id")
            contact_name = data.get("contact_name")

            async for chunk in twin_engine.chat_stream(
                message=message,
                conversation_id=conversation_id,
                contact_name=contact_name,
            ):
                await websocket.send_json({"type": "chunk", "content": chunk})

            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


@twin_router.post("/memory")
async def add_memory(req: MemoryRequest, user: str = Depends(get_current_user)):
    """Add a memory to the twin's knowledge."""
    twin_engine.add_memory(req.content, req.category, req.importance)
    return {"message": "Memory added", "category": req.category}


@twin_router.get("/memory/search")
async def search_memory(
    q: str = Query(..., min_length=1),
    collection: str = "memories",
    limit: int = 10,
    user: str = Depends(get_current_user),
):
    """Search the twin's memories."""
    results = vector_store.search(collection, q, n_results=limit)
    return {"results": results, "count": len(results)}


@twin_router.get("/memory/list")
async def list_memories(
    collection: str = "memories",
    limit: int = 50,
    user: str = Depends(get_current_user),
):
    """List all memories from vector store."""
    results = vector_store.list_all(collection, limit=limit)
    return {"results": results, "count": len(results), "collection": collection}


@twin_router.get("/conversations")
async def list_conversations(
    limit: int = 20,
    user: str = Depends(get_current_user),
):
    """List recent conversations with their messages."""
    from backend.database.models import Message as MsgModel
    session = get_session_factory()()
    try:
        messages = session.query(MsgModel).order_by(
            MsgModel.id.desc()
        ).limit(limit * 2).all()

        # Group by conversation_id
        convos = {}
        for msg in reversed(messages):
            cid = msg.conversation_id
            if cid not in convos:
                convos[cid] = []
            convos[cid].append({
                "role": msg.role,
                "content": msg.content,
                "emotion": msg.emotion.value if msg.emotion else "neutral",
                "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            })

        return {
            "conversations": convos,
            "count": len(convos),
        }
    finally:
        session.close()


@twin_router.post("/contact")
async def add_contact(req: ContactRequest, user: str = Depends(get_current_user)):
    """Add a contact/relationship."""
    success = personality_learner.add_contact(
        name=req.name,
        relationship_type=req.relationship_type,
        label=req.label,
        language=req.language,
        tone=req.tone,
        topics=req.topics,
        notes=req.notes,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add contact")
    return {"message": f"Contact '{req.name}' added", "name": req.name}


@twin_router.get("/personality")
async def get_personality(user: str = Depends(get_current_user)):
    """Get the learned personality profile."""
    profile = personality_learner.profile
    return {
        "traits": profile.traits,
        "communication_patterns": profile.communication_patterns,
        "values": profile.values,
        "interests": profile.interests,
        "quirks": profile.quirks,
        "relationship_styles": profile.relationship_styles,
        "emotional_tendencies": profile.emotional_tendencies,
    }


@twin_router.get("/stats")
async def get_twin_stats(user: str = Depends(get_current_user)):
    """Get twin engine statistics."""
    return twin_engine.get_stats()


@twin_router.get("/conversation/{conversation_id}")
async def get_conversation(conversation_id: str, user: str = Depends(get_current_user)):
    """Get conversation history."""
    history = twin_engine.get_conversation_history(conversation_id)
    return {"conversation_id": conversation_id, "messages": history}


@twin_router.get("/twinning-rate")
async def get_twinning_rate(user: str = Depends(get_current_user)):
    """Calculate how well the twin knows you (twinning accuracy %)."""
    stats = twin_engine.get_stats()
    mem_stats = stats.get("memory_stats", {})
    profile = personality_learner.profile

    # Scoring factors (each contributes to the total)
    scores = {}

    # 1. Conversations (max 25 pts) — more conversations = better understanding
    conv_count = mem_stats.get("conversations", 0)
    scores["conversations"] = {"value": conv_count, "max": 25,
        "score": min(25, conv_count * 2.5),
        "label": "Conversations Had"}

    # 2. Memories (max 20 pts) — explicit memories you've taught it
    mem_count = mem_stats.get("memories", 0)
    scores["memories"] = {"value": mem_count, "max": 20,
        "score": min(20, mem_count * 2),
        "label": "Memories Taught"}

    # 3. Personality traits learned (max 20 pts)
    trait_count = len(profile.traits)
    scores["personality"] = {"value": trait_count, "max": 20,
        "score": min(20, trait_count * 4),
        "label": "Personality Traits"}

    # 4. Contacts/relationships (max 15 pts)
    contact_count = len(profile.relationship_styles)
    scores["contacts"] = {"value": contact_count, "max": 15,
        "score": min(15, contact_count * 5),
        "label": "Relationships Known"}

    # 5. Communication patterns (max 10 pts)
    pattern_count = len(profile.communication_patterns)
    interest_count = len(profile.interests)
    quirk_count = len(profile.quirks)
    style_score = min(10, (pattern_count + interest_count + quirk_count) * 2)
    scores["style"] = {"value": pattern_count + interest_count + quirk_count, "max": 10,
        "score": style_score,
        "label": "Communication Style"}

    # 6. Voice data (max 10 pts)
    voice_available = False
    try:
        from backend.ml.voice_engine import tts_engine
        voice_available = tts_engine.is_available
    except Exception:
        pass
    scores["voice"] = {"value": 1 if voice_available else 0, "max": 10,
        "score": 10 if voice_available else 0,
        "label": "Voice Cloned"}

    total_score = sum(s["score"] for s in scores.values())
    max_score = sum(s["max"] for s in scores.values())
    rate = round((total_score / max_score) * 100, 1) if max_score > 0 else 0

    # Tips to improve
    tips = []
    if conv_count < 10:
        tips.append("Chat more with your twin — it learns from every conversation")
    if mem_count < 5:
        tips.append("Add personal memories in the Memory tab")
    if contact_count == 0:
        tips.append("Add family/friends in Training tab so your twin knows how to talk to them")
    if trait_count < 3:
        tips.append("Keep chatting — personality traits are learned automatically")
    if not voice_available:
        tips.append("Upload voice samples in Training tab to enable voice cloning")

    return {
        "twinning_rate": rate,
        "total_score": round(total_score, 1),
        "max_score": max_score,
        "breakdown": scores,
        "tips": tips,
    }


# ==================== INTENT OS ====================

@intent_router.get("/dashboard")
async def get_dashboard(user: str = Depends(get_current_user)):
    """Get Intent OS dashboard summary."""
    return intent_engine.get_dashboard_summary()


@intent_router.post("/tasks")
async def create_task(req: TaskRequest, user: str = Depends(get_current_user)):
    """Create a new task."""
    due = datetime.fromisoformat(req.due_date) if req.due_date else None
    task_id = intent_engine.create_task(
        title=req.title,
        description=req.description,
        priority=req.priority,
        category=req.category,
        due_date=due,
        tags=req.tags,
    )
    if not task_id:
        raise HTTPException(status_code=400, detail="Failed to create task")
    return {"id": task_id, "message": "Task created"}


@intent_router.get("/tasks")
async def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user: str = Depends(get_current_user),
):
    """Get tasks with optional filters."""
    return intent_engine.get_tasks(status=status, priority=priority)


@intent_router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    req: TaskUpdateRequest,
    user: str = Depends(get_current_user),
):
    """Update task status."""
    success = intent_engine.update_task_status(task_id, req.status)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task updated"}


@intent_router.post("/notes")
async def create_note(req: NoteRequest, user: str = Depends(get_current_user)):
    """Create a new note."""
    note_id = intent_engine.create_note(
        title=req.title, content=req.content,
        category=req.category, tags=req.tags,
    )
    if not note_id:
        raise HTTPException(status_code=400, detail="Failed to create note")
    return {"id": note_id, "message": "Note created"}


@intent_router.get("/notes")
async def get_notes(
    category: Optional[str] = None,
    user: str = Depends(get_current_user),
):
    """Get notes."""
    return intent_engine.get_notes(category=category)


@intent_router.get("/notes/search")
async def search_notes(q: str, user: str = Depends(get_current_user)):
    """Search notes semantically."""
    return intent_engine.search_notes(q)


@intent_router.post("/calendar")
async def create_event(req: CalendarEventRequest, user: str = Depends(get_current_user)):
    """Create a calendar event."""
    start = datetime.fromisoformat(req.start_time)
    end = datetime.fromisoformat(req.end_time) if req.end_time else None
    event_id = intent_engine.add_calendar_event(
        title=req.title, start_time=start, end_time=end,
        description=req.description, location=req.location,
        category=req.category, priority=req.priority,
    )
    if not event_id:
        raise HTTPException(status_code=400, detail="Failed to create event")
    return {"id": event_id, "message": "Event created"}


@intent_router.get("/calendar")
async def get_events(days: int = 7, user: str = Depends(get_current_user)):
    """Get upcoming events."""
    return intent_engine.get_upcoming_events(days=days)


@intent_router.post("/calendar/import")
async def import_calendar(
    file: UploadFile = File(...),
    user: str = Depends(get_current_user),
):
    """Import .ics calendar file."""
    cal_dir = settings.get_abs_path(settings.intent_os.CALENDAR_FILES_DIR)
    cal_dir.mkdir(parents=True, exist_ok=True)
    filepath = cal_dir / file.filename

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    count = intent_engine.import_ics_calendar(str(filepath))
    return {"message": f"Imported {count} events", "count": count}


@intent_router.get("/suggestions")
async def get_suggestions(user: str = Depends(get_current_user)):
    """Get AI-powered suggestions."""
    return await intent_engine.get_ai_suggestions()


@intent_router.get("/prioritize")
async def smart_prioritize(user: str = Depends(get_current_user)):
    """AI-powered task prioritization."""
    return await intent_engine.smart_prioritize()


# ==================== DATA CAPTURE ====================

@capture_router.post("/audio/start")
async def start_recording(
    duration: Optional[int] = None,
    user: str = Depends(get_current_user),
):
    """Start audio recording."""
    result = audio_capture.start_recording(duration)
    return {"recording_id": result, "status": "recording"}


@capture_router.post("/audio/stop")
async def stop_recording(user: str = Depends(get_current_user)):
    """Stop audio recording and save."""
    filepath = audio_capture.stop_recording()
    if not filepath:
        raise HTTPException(status_code=400, detail="No active recording")
    return {"file_path": filepath, "status": "saved"}


@capture_router.post("/audio/upload")
async def upload_audio(
    file: UploadFile = File(...),
    user: str = Depends(get_current_user),
):
    """Upload audio for voice training."""
    voice_dir = settings.get_abs_path(settings.ai.VOICE_SAMPLES_DIR)
    voice_dir.mkdir(parents=True, exist_ok=True)
    filepath = voice_dir / file.filename

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Transcribe the audio
    from backend.ml.voice_engine import stt_engine
    transcription = stt_engine.transcribe(str(filepath)) if stt_engine.is_available else {}

    return {
        "file_path": str(filepath),
        "transcription": transcription.get("text", ""),
        "status": "uploaded",
    }


@capture_router.post("/face/capture")
async def capture_face(
    num_samples: int = 10,
    user: str = Depends(get_current_user),
):
    """Capture face samples from webcam."""
    paths = video_capture.capture_face_samples(num_samples=num_samples)
    return {"captured": len(paths), "paths": paths}


@capture_router.post("/video/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: str = Depends(get_current_user),
):
    """Upload video for face/voice extraction."""
    recordings_dir = settings.get_abs_path(settings.data_capture.RECORDINGS_DIR)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    filepath = recordings_dir / file.filename

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Extract face samples
    face_paths = video_capture.extract_frames_from_video(str(filepath))

    return {
        "file_path": str(filepath),
        "face_samples_extracted": len(face_paths),
        "status": "processed",
    }


@capture_router.get("/stats")
async def capture_stats(user: str = Depends(get_current_user)):
    """Get capture statistics."""
    return interaction_tracker.get_interaction_stats()


# ==================== SYSTEM ====================

@system_router.get("/health")
async def health_check():
    """Health check - no auth required."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@system_router.get("/security")
async def security_report(user: str = Depends(get_current_user)):
    """Get security status report."""
    return firewall.get_security_report()


@system_router.get("/status")
async def system_status(user: str = Depends(get_current_user)):
    """Get full system status."""
    from backend.ml.llm_engine import llm_engine
    from backend.ml.voice_engine import stt_engine, tts_engine

    return {
        "llm": {"available": llm_engine.is_available, "model": llm_engine.current_model},
        "stt": {"available": stt_engine.is_available},
        "tts": {"available": tts_engine.is_available, "voice_cloned": tts_engine.is_voice_cloned},
        "vector_store": vector_store.get_stats(),
        "security": firewall.get_security_report(),
        "twin_stats": twin_engine.get_stats(),
    }
