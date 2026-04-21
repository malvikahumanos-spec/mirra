"""
Mirra - Database Models
Dual-mode: SQLite (local) or Supabase PostgreSQL (cloud).
Set DATABASE_URL in .env to switch to Supabase.
All user-data tables include user_id for multi-tenancy.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float,
    ForeignKey, JSON, Enum as SQLEnum, Index, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.pool import StaticPool, NullPool
import enum

from backend.config import settings

Base = declarative_base()


# --- Enums ---

class RelationshipType(enum.Enum):
    FAMILY = "family"
    FRIEND = "friend"
    COLLEAGUE = "colleague"
    ACQUAINTANCE = "acquaintance"
    PROFESSIONAL = "professional"
    OTHER = "other"


class EmotionType(enum.Enum):
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    SURPRISED = "surprised"
    FEARFUL = "fearful"
    DISGUSTED = "disgusted"
    NEUTRAL = "neutral"
    LOVING = "loving"
    EXCITED = "excited"
    THOUGHTFUL = "thoughtful"


class TaskPriority(enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


# --- Core Models ---

class UserProfile(Base):
    """The user's core profile - the identity being twinned."""
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)  # auth username
    username = Column(String(100), nullable=False)
    full_name = Column(String(200))
    preferred_language = Column(String(10), default="en")
    personality_summary = Column(Text)
    communication_style = Column(Text)  # JSON of learned style patterns
    values_and_beliefs = Column(Text)   # What matters to the user
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))


class Contact(Base):
    """People the user interacts with - twin adapts behavior per contact."""
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    relationship_type = Column(
        SQLEnum(RelationshipType, native_enum=False),
        default=RelationshipType.OTHER
    )
    relationship_label = Column(String(100))  # "mummy", "papa", "bhai", etc.
    communication_tone = Column(Text)  # How user talks to this person
    topics_discussed = Column(Text)    # Common topics (JSON array)
    language_preference = Column(String(10), default="en")  # "hi", "en", "hinglish"
    emotional_closeness = Column(Float, default=0.5)  # 0.0 to 1.0
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))

    conversations = relationship("Conversation", back_populates="contact")


# --- Conversation & Memory ---

class Conversation(Base):
    """Every conversation the twin has, for learning and continuity."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    title = Column(String(300))
    context = Column(Text)  # What prompted this conversation
    mood = Column(SQLEnum(EmotionType, native_enum=False), default=EmotionType.NEUTRAL)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    summary = Column(Text)  # AI-generated summary

    contact = relationship("Contact", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.timestamp")


class Message(Base):
    """Individual messages in conversations."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String(20), nullable=False)  # "user", "twin", "system"
    content = Column(Text, nullable=False)
    emotion = Column(SQLEnum(EmotionType, native_enum=False), default=EmotionType.NEUTRAL)
    confidence = Column(Float, default=1.0)  # How confident the twin is
    voice_used = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation = relationship("Conversation", back_populates="messages")

    __table_args__ = (
        Index("idx_messages_conversation", "conversation_id"),
        Index("idx_messages_timestamp", "timestamp"),
        Index("idx_messages_user", "user_id"),
    )


class Memory(Base):
    """Long-term memory storage for the twin."""
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    category = Column(String(50), nullable=False)  # "personal", "work", "family", etc.
    content = Column(Text, nullable=False)
    importance = Column(Float, default=0.5)  # 0.0 to 1.0
    emotional_weight = Column(Float, default=0.0)
    source = Column(String(100))  # "conversation", "email", "calendar", "manual"
    embedding_id = Column(String(100))  # Reference to vector DB
    last_accessed = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    access_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_memories_category", "category"),
        Index("idx_memories_importance", "importance"),
        Index("idx_memories_user", "user_id"),
    )


class PersonalityTrait(Base):
    """Learned personality traits of the user."""
    __tablename__ = "personality_traits"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    trait_name = Column(String(100), nullable=False)
    trait_value = Column(Float, nullable=False)  # -1.0 to 1.0 scale
    confidence = Column(Float, default=0.0)
    evidence_count = Column(Integer, default=0)
    description = Column(Text)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DecisionPattern(Base):
    """Learned decision-making patterns."""
    __tablename__ = "decision_patterns"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    context = Column(Text, nullable=False)  # What situation triggered the decision
    decision = Column(Text, nullable=False)  # What was decided
    reasoning = Column(Text)  # Why (if stated/inferred)
    category = Column(String(50))  # "work", "personal", "financial", etc.
    outcome = Column(Text)  # What happened after
    confidence = Column(Float, default=0.5)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# --- Intent OS Models ---

class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    location = Column(String(300))
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime)
    all_day = Column(Boolean, default=False)
    recurrence = Column(String(200))
    attendees = Column(Text)  # JSON array
    category = Column(String(50))
    priority = Column(SQLEnum(TaskPriority, native_enum=False), default=TaskPriority.MEDIUM)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EmailRecord(Base):
    __tablename__ = "email_records"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    message_id = Column(String(200))
    subject = Column(String(500))
    sender = Column(String(200))
    recipients = Column(Text)  # JSON array
    body_preview = Column(Text)  # First 500 chars
    body_encrypted = Column(Text)  # Full body encrypted
    sentiment = Column(String(20))
    importance = Column(SQLEnum(TaskPriority, native_enum=False), default=TaskPriority.MEDIUM)
    is_read = Column(Boolean, default=False)
    is_actionable = Column(Boolean, default=False)
    action_required = Column(Text)
    received_at = Column(DateTime)
    processed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    content_encrypted = Column(Text)
    tags = Column(Text)  # JSON array
    category = Column(String(50))
    is_pinned = Column(Boolean, default=False)
    embedding_id = Column(String(100))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    priority = Column(SQLEnum(TaskPriority, native_enum=False), default=TaskPriority.MEDIUM)
    status = Column(SQLEnum(TaskStatus, native_enum=False), default=TaskStatus.TODO)
    due_date = Column(DateTime, nullable=True)
    category = Column(String(50))
    estimated_effort_hours = Column(Float)
    actual_effort_hours = Column(Float)
    tags = Column(Text)  # JSON array
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    ai_priority_score = Column(Float)  # ML-predicted priority
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    subtasks = relationship("Task", backref="parent_task", remote_side=[id])


# --- Data Capture Models ---

class VoiceSample(Base):
    __tablename__ = "voice_samples"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    duration_seconds = Column(Float)
    transcription = Column(Text)
    emotion = Column(SQLEnum(EmotionType, native_enum=False))
    quality_score = Column(Float)
    used_for_training = Column(Boolean, default=False)
    captured_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FaceSample(Base):
    __tablename__ = "face_samples"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    expression = Column(SQLEnum(EmotionType, native_enum=False))
    quality_score = Column(Float)
    lighting_condition = Column(String(50))
    angle = Column(String(50))
    used_for_training = Column(Boolean, default=False)
    captured_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class InteractionLog(Base):
    """Logs all user interactions for behavior learning."""
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    interaction_type = Column(String(50))  # "typing", "speaking", "browsing", etc.
    context = Column(Text)
    duration_seconds = Column(Float)
    patterns_extracted = Column(Text)  # JSON of behavioral patterns
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_interactions_type", "interaction_type"),
        Index("idx_interactions_timestamp", "timestamp"),
        Index("idx_interactions_user", "user_id"),
    )


class AuditLog(Base):
    """Security audit log - tracks all system access."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    event_type = Column(String(50), nullable=False)
    username = Column(String(100))
    details = Column(Text)
    ip_address = Column(String(50))
    success = Column(Boolean, default=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_audit_timestamp", "timestamp"),
    )


# --- Database Engine Setup ---

def _build_engine():
    """
    Build SQLAlchemy engine.
    Uses Supabase PostgreSQL if DATABASE_URL is set, otherwise SQLite.
    """
    db_url = settings.database.DATABASE_URL

    if db_url:
        # PostgreSQL / Supabase
        # psycopg2 connection pooling — NullPool works well with serverless
        from loguru import logger
        logger.info("Database: Supabase PostgreSQL")
        return create_engine(
            db_url,
            poolclass=NullPool,
            echo=settings.DEBUG,
        )
    else:
        # SQLite (local fallback)
        from loguru import logger
        db_path = settings.get_abs_path(settings.database.SQLITE_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info(f"Database: SQLite at {db_path}")
        return create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.DEBUG,
        )


# Module-level engine and session factory (created once at startup)
_engine = None
_SessionFactory = None


def create_database():
    """Create the database engine and all tables."""
    global _engine, _SessionFactory
    _engine = _build_engine()
    Base.metadata.create_all(_engine)
    _SessionFactory = sessionmaker(bind=_engine)
    return _engine


def get_session_factory():
    """Get the session factory. Call create_database() first."""
    global _SessionFactory
    if _SessionFactory is None:
        create_database()
    return _SessionFactory
