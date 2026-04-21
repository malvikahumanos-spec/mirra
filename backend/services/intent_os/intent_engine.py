"""
Mirra - Human Intent OS Engine
Integrates calendar, email, notes, tasks to learn decision patterns
and reduce cognitive load. Your personal intelligent operating system.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from loguru import logger

from backend.config import settings
from backend.database.models import (
    CalendarEvent, EmailRecord, Note, Task,
    DecisionPattern, TaskPriority, TaskStatus,
    get_session_factory
)
from backend.database.vector_store import vector_store
from backend.ml.llm_engine import llm_engine


class IntentEngine:
    """
    The Human Intent OS - learns your patterns, prioritizes your life,
    reduces decision fatigue, and ensures life continuity.
    """

    def __init__(self):
        self._session_factory = None

    def initialize(self):
        """Initialize the Intent Engine."""
        self._session_factory = get_session_factory()
        logger.info("Intent Engine initialized")

    # --- Calendar Management ---

    def add_calendar_event(
        self,
        title: str,
        start_time: datetime,
        end_time: Optional[datetime] = None,
        description: str = "",
        location: str = "",
        category: str = "",
        priority: str = "medium",
    ) -> Optional[int]:
        """Add a calendar event."""
        session = self._session_factory()
        try:
            event = CalendarEvent(
                title=title,
                start_time=start_time,
                end_time=end_time or start_time + timedelta(hours=1),
                description=description,
                location=location,
                category=category,
                priority=TaskPriority(priority),
            )
            session.add(event)
            session.commit()

            # Store in vector DB for semantic search
            vector_store.add_memory(
                "memories",
                f"Calendar event: {title} on {start_time.strftime('%Y-%m-%d %H:%M')}. {description}",
                {"source": "calendar", "category": category},
                f"cal_{event.id}",
            )

            return event.id
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to add calendar event: {e}")
            return None
        finally:
            session.close()

    def get_upcoming_events(self, days: int = 7) -> list[dict]:
        """Get upcoming calendar events."""
        session = self._session_factory()
        try:
            now = datetime.now(timezone.utc)
            future = now + timedelta(days=days)
            events = session.query(CalendarEvent).filter(
                CalendarEvent.start_time >= now,
                CalendarEvent.start_time <= future,
            ).order_by(CalendarEvent.start_time).all()

            return [
                {
                    "id": e.id,
                    "title": e.title,
                    "start_time": e.start_time.isoformat(),
                    "end_time": e.end_time.isoformat() if e.end_time else None,
                    "description": e.description,
                    "location": e.location,
                    "category": e.category,
                    "priority": e.priority.value if e.priority else "medium",
                }
                for e in events
            ]
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []
        finally:
            session.close()

    def import_ics_calendar(self, ics_file_path: str) -> int:
        """Import events from an .ics calendar file."""
        try:
            from icalendar import Calendar
            from pathlib import Path

            with open(ics_file_path, "rb") as f:
                cal = Calendar.from_ical(f.read())

            count = 0
            for component in cal.walk():
                if component.name == "VEVENT":
                    title = str(component.get("SUMMARY", ""))
                    start = component.get("DTSTART")
                    end = component.get("DTEND")
                    description = str(component.get("DESCRIPTION", ""))
                    location = str(component.get("LOCATION", ""))

                    if start:
                        start_dt = start.dt if hasattr(start, "dt") else start
                        end_dt = end.dt if end and hasattr(end, "dt") else None

                        if not isinstance(start_dt, datetime):
                            start_dt = datetime.combine(start_dt, datetime.min.time())
                        if end_dt and not isinstance(end_dt, datetime):
                            end_dt = datetime.combine(end_dt, datetime.min.time())

                        self.add_calendar_event(
                            title=title,
                            start_time=start_dt,
                            end_time=end_dt,
                            description=description,
                            location=location,
                        )
                        count += 1

            logger.info(f"Imported {count} calendar events from {ics_file_path}")
            return count
        except Exception as e:
            logger.error(f"Calendar import failed: {e}")
            return 0

    # --- Notes Management ---

    def create_note(
        self,
        title: str,
        content: str,
        category: str = "general",
        tags: list[str] = None,
    ) -> Optional[int]:
        """Create a note."""
        session = self._session_factory()
        try:
            doc_id = f"note_{uuid.uuid4().hex[:12]}"
            note = Note(
                title=title,
                content=content,
                category=category,
                tags=json.dumps(tags or []),
                embedding_id=doc_id,
            )
            session.add(note)
            session.commit()

            vector_store.add_memory(
                "notes",
                f"{title}\n{content}",
                {"source": "notes", "category": category, "tags": json.dumps(tags or [])},
                doc_id,
            )

            return note.id
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create note: {e}")
            return None
        finally:
            session.close()

    def search_notes(self, query: str, limit: int = 10) -> list[dict]:
        """Search notes semantically."""
        results = vector_store.search("notes", query, n_results=limit)
        return [
            {
                "content": r["content"],
                "category": r["metadata"].get("category", ""),
                "relevance": 1.0 - r.get("distance", 0),
            }
            for r in results
        ]

    def get_notes(self, category: Optional[str] = None, limit: int = 50) -> list[dict]:
        """Get notes, optionally filtered by category."""
        session = self._session_factory()
        try:
            query = session.query(Note).order_by(Note.created_at.desc())
            if category:
                query = query.filter(Note.category == category)
            notes = query.limit(limit).all()

            return [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content,
                    "category": n.category,
                    "tags": json.loads(n.tags) if n.tags else [],
                    "is_pinned": n.is_pinned,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                }
                for n in notes
            ]
        except Exception as e:
            logger.error(f"Failed to get notes: {e}")
            return []
        finally:
            session.close()

    # --- Task Management ---

    def create_task(
        self,
        title: str,
        description: str = "",
        priority: str = "medium",
        category: str = "",
        due_date: Optional[datetime] = None,
        tags: list[str] = None,
    ) -> Optional[int]:
        """Create a task with AI-powered priority scoring."""
        session = self._session_factory()
        try:
            task = Task(
                title=title,
                description=description,
                priority=TaskPriority(priority),
                category=category,
                due_date=due_date,
                tags=json.dumps(tags or []),
            )
            session.add(task)
            session.commit()

            vector_store.add_memory(
                "decisions",
                f"Task created: {title}. Priority: {priority}. {description}",
                {"source": "task", "category": category},
                f"task_{task.id}",
            )

            return task.id
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create task: {e}")
            return None
        finally:
            session.close()

    def get_tasks(
        self,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get tasks with optional filtering."""
        session = self._session_factory()
        try:
            query = session.query(Task).order_by(Task.created_at.desc())
            if status:
                query = query.filter(Task.status == TaskStatus(status))
            if priority:
                query = query.filter(Task.priority == TaskPriority(priority))
            tasks = query.limit(limit).all()

            return [
                {
                    "id": t.id,
                    "title": t.title,
                    "description": t.description,
                    "priority": t.priority.value if t.priority else "medium",
                    "status": t.status.value if t.status else "todo",
                    "category": t.category,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "tags": json.loads(t.tags) if t.tags else [],
                    "ai_priority_score": t.ai_priority_score,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tasks
            ]
        except Exception as e:
            logger.error(f"Failed to get tasks: {e}")
            return []
        finally:
            session.close()

    def update_task_status(self, task_id: int, status: str) -> bool:
        """Update task status and learn from the pattern."""
        session = self._session_factory()
        try:
            task = session.get(Task, task_id)
            if not task:
                return False

            old_status = task.status.value if task.status else "todo"
            task.status = TaskStatus(status)

            if status == "done":
                task.completed_at = datetime.now(timezone.utc)
                # Record decision pattern
                self._record_decision(
                    context=f"Completed task: {task.title}",
                    decision=f"Marked as done (was {old_status})",
                    category=task.category or "general",
                    session=session,
                )

            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to update task: {e}")
            return False
        finally:
            session.close()

    # --- Decision Pattern Learning ---

    def _record_decision(
        self, context: str, decision: str,
        category: str = "general", reasoning: str = "",
        session=None,
    ):
        """Record a decision pattern for learning."""
        own_session = session is None
        if own_session:
            session = self._session_factory()

        try:
            pattern = DecisionPattern(
                context=context,
                decision=decision,
                reasoning=reasoning,
                category=category,
            )
            session.add(pattern)
            if own_session:
                session.commit()

            vector_store.add_memory(
                "decisions",
                f"Decision: {context} -> {decision}. Reason: {reasoning}",
                {"source": "decision_pattern", "category": category},
                f"dec_{uuid.uuid4().hex[:12]}",
            )
        except Exception as e:
            if own_session:
                session.rollback()
            logger.error(f"Failed to record decision: {e}")
        finally:
            if own_session:
                session.close()

    async def get_ai_suggestions(self) -> dict:
        """Get AI-powered suggestions based on learned patterns."""
        tasks = self.get_tasks(status="todo", limit=20)
        events = self.get_upcoming_events(days=3)

        # Get recent decision patterns
        decisions = vector_store.search(
            "decisions", "priority important urgent", n_results=10
        )

        prompt = f"""Based on this person's tasks and schedule, suggest:
1. Top 3 tasks to focus on today and why
2. Any scheduling conflicts or concerns
3. Decision patterns you notice

TASKS:
{json.dumps(tasks[:10], indent=2)}

UPCOMING EVENTS (next 3 days):
{json.dumps(events[:10], indent=2)}

RECENT DECISIONS:
{json.dumps([d['content'] for d in decisions[:5]], indent=2)}

Respond as a JSON object with keys: "focus_tasks", "concerns", "patterns"
"""

        response = await llm_engine.generate(prompt, temperature=0.3)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(response[start:end])
        except json.JSONDecodeError:
            pass

        return {
            "focus_tasks": ["Review your task list"],
            "concerns": [],
            "patterns": ["Not enough data yet to detect patterns"],
        }

    async def smart_prioritize(self) -> list[dict]:
        """AI-powered task prioritization based on learned patterns."""
        tasks = self.get_tasks(status="todo")
        if not tasks:
            return []

        prompt = f"""You are a personal productivity AI that has learned this person's
prioritization patterns. Rank these tasks by importance.

Consider:
- Urgency (due dates)
- Impact (what happens if delayed)
- Dependencies (what blocks other work)
- This person's typical patterns

TASKS:
{json.dumps(tasks, indent=2)}

Return a JSON array of objects: [{{"task_id": id, "score": 0-100, "reason": "why"}}]
Highest score = most important.
"""

        response = await llm_engine.generate(prompt, temperature=0.2)
        try:
            start = response.find("[")
            end = response.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(response[start:end])
        except json.JSONDecodeError:
            pass

        return tasks

    # --- Email Processing ---

    def process_email(
        self,
        message_id: str,
        subject: str,
        sender: str,
        body: str,
        received_at: Optional[datetime] = None,
    ) -> Optional[int]:
        """Process and store an email locally."""
        session = self._session_factory()
        try:
            record = EmailRecord(
                message_id=message_id,
                subject=subject,
                sender=sender,
                body_preview=body[:500],
                received_at=received_at or datetime.now(timezone.utc),
            )
            session.add(record)
            session.commit()

            vector_store.add_memory(
                "memories",
                f"Email from {sender}: {subject}\n{body[:300]}",
                {"source": "email", "sender": sender},
                f"email_{record.id}",
            )

            return record.id
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to process email: {e}")
            return None
        finally:
            session.close()

    def get_dashboard_summary(self) -> dict:
        """Get a summary for the dashboard."""
        session = self._session_factory()
        try:
            total_tasks = session.query(Task).count()
            pending_tasks = session.query(Task).filter(
                Task.status == TaskStatus.TODO
            ).count()
            in_progress_tasks = session.query(Task).filter(
                Task.status == TaskStatus.IN_PROGRESS
            ).count()
            completed_tasks = session.query(Task).filter(
                Task.status == TaskStatus.DONE
            ).count()

            upcoming_events = self.get_upcoming_events(days=3)
            total_notes = session.query(Note).count()
            total_emails = session.query(EmailRecord).count()

            return {
                "tasks": {
                    "total": total_tasks,
                    "pending": pending_tasks,
                    "in_progress": in_progress_tasks,
                    "completed": completed_tasks,
                },
                "upcoming_events": len(upcoming_events),
                "events_preview": upcoming_events[:5],
                "notes_count": total_notes,
                "emails_count": total_emails,
                "memory_stats": vector_store.get_stats(),
            }
        except Exception as e:
            logger.error(f"Dashboard summary failed: {e}")
            return {}
        finally:
            session.close()


# Singleton
intent_engine = IntentEngine()
