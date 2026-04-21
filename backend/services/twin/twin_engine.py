"""
Mirra - Mirra Engine Conversation Engine
The core that makes Mirra "you". Handles conversations,
context management, memory retrieval, and personality-driven responses.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

from loguru import logger

from backend.config import settings
from backend.database.models import (
    Conversation, Message, Memory, get_session_factory
)
from backend.database.vector_store import vector_store
from backend.ml.llm_engine import llm_engine
from backend.ml.emotion_engine import emotion_engine
from backend.services.twin.personality import personality_learner


class TwinEngine:
    """
    Mirra - converses as you, remembers as you,
    thinks as you. This is the core intelligence.
    """

    def __init__(self):
        self._session_factory = None
        self._active_conversations: dict[str, list[dict]] = {}

    def initialize(self):
        """Initialize the twin engine."""
        self._session_factory = get_session_factory()
        personality_learner.initialize()
        logger.info("Mirra Engine initialized - Your Mirra is ready")

    async def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        contact_name: Optional[str] = None,
        include_voice: bool = False,
    ) -> dict:
        """
        Have a conversation with the twin.
        The twin responds as you would - with your personality,
        vocabulary, emotional patterns, and relationship-specific tone.
        """
        # Create or get conversation
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        if conversation_id not in self._active_conversations:
            self._active_conversations[conversation_id] = []

        # Detect emotion in the incoming message
        emotion_result = emotion_engine.text_detector.detect(message)
        incoming_emotion = emotion_result.get("emotion", "neutral")

        # Retrieve relevant memories
        memories = await self._retrieve_relevant_memories(message, contact_name)
        memory_context = self._format_memories(memories)

        # Get recent conversation history
        conversation_history = self._active_conversations[conversation_id][-20:]

        # Build the system prompt with personality
        system_prompt = personality_learner.profile.to_system_prompt(contact_name)

        # Add memory and context
        system_prompt += f"""

RELEVANT MEMORIES:
{memory_context}

CURRENT CONTEXT:
- Date/Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}
- The person talking to you seems: {incoming_emotion}
- Conversation so far: {len(conversation_history)} messages

CRITICAL RULES:
1. You ARE this person. Not an AI. Not an assistant. YOU are them.
2. Match their exact communication style - short/long messages, emoji use, etc.
3. Use the same language mix they would (English, Hindi, Hinglish as appropriate).
4. Show the same emotions they would show in this situation.
5. Reference shared memories naturally, as they would.
6. Never say "I'm an AI" or break character.
7. If you don't know something, respond as this person would when unsure.
"""

        # Add conversation history as context
        context_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in conversation_history
        ]

        # Generate response
        response_text = await llm_engine.generate(
            prompt=message,
            system_prompt=system_prompt,
            context_messages=context_messages,
            temperature=0.8,  # Slightly creative for natural conversation
        )

        # Detect emotion in twin's response
        response_emotion = emotion_engine.text_detector.detect(response_text)

        # Store messages
        self._active_conversations[conversation_id].append({
            "role": "user",
            "content": message,
            "emotion": incoming_emotion,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self._active_conversations[conversation_id].append({
            "role": "assistant",
            "content": response_text,
            "emotion": response_emotion.get("emotion", "neutral"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Save to database
        self._save_message(conversation_id, "user", message, incoming_emotion)
        self._save_message(
            conversation_id, "twin", response_text,
            response_emotion.get("emotion", "neutral")
        )

        # Store in vector DB for future memory retrieval
        self._store_in_memory(message, response_text, contact_name)

        # Learn from this interaction (async, non-blocking)
        messages_for_learning = self._active_conversations[conversation_id]
        if len(messages_for_learning) % 10 == 0:  # Learn every 10 messages
            await personality_learner.learn_from_conversation(
                messages_for_learning, contact_name
            )

        result = {
            "conversation_id": conversation_id,
            "response": response_text,
            "emotion": response_emotion.get("emotion", "neutral"),
            "confidence": response_emotion.get("confidence", 0.5),
            "memories_used": len(memories),
        }

        # Generate voice if requested
        if include_voice:
            result["voice_available"] = False
            try:
                from backend.ml.voice_engine import tts_engine
                if tts_engine.is_available:
                    audio_bytes = tts_engine.synthesize_to_bytes(response_text)
                    if audio_bytes:
                        import base64
                        result["voice_audio"] = base64.b64encode(audio_bytes).decode()
                        result["voice_available"] = True
            except Exception as e:
                logger.debug(f"Voice synthesis skipped: {e}")

        return result

    async def chat_stream(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        contact_name: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream the twin's response token by token."""
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        if conversation_id not in self._active_conversations:
            self._active_conversations[conversation_id] = []

        memories = await self._retrieve_relevant_memories(message, contact_name)
        memory_context = self._format_memories(memories)

        system_prompt = personality_learner.profile.to_system_prompt(contact_name)
        system_prompt += f"\n\nRELEVANT MEMORIES:\n{memory_context}"

        context_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in self._active_conversations[conversation_id][-20:]
        ]

        full_response = ""
        async for chunk in llm_engine.generate_stream(
            prompt=message,
            system_prompt=system_prompt,
            context_messages=context_messages,
            temperature=0.8,
        ):
            full_response += chunk
            yield chunk

        # Save after streaming is complete
        self._active_conversations[conversation_id].append({
            "role": "user", "content": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self._active_conversations[conversation_id].append({
            "role": "assistant", "content": full_response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self._save_message(conversation_id, "user", message, "neutral")
        self._save_message(conversation_id, "twin", full_response, "neutral")
        self._store_in_memory(message, full_response, contact_name)

    async def _retrieve_relevant_memories(
        self, query: str, contact_name: Optional[str] = None
    ) -> list[dict]:
        """Retrieve memories relevant to the current conversation."""
        memories = []

        # Search conversation history
        conv_memories = vector_store.search("conversations", query, n_results=3)
        memories.extend(conv_memories)

        # Search long-term memories
        lt_memories = vector_store.search("memories", query, n_results=3)
        memories.extend(lt_memories)

        # Search personality-related memories
        if contact_name:
            personality_memories = vector_store.search(
                "personality", f"relationship with {contact_name}", n_results=2
            )
            memories.extend(personality_memories)

        # Search decision patterns
        decision_memories = vector_store.search("decisions", query, n_results=2)
        memories.extend(decision_memories)

        # Sort by relevance (lower distance = more relevant)
        memories.sort(key=lambda m: m.get("distance", float("inf")))

        return memories[:8]  # Top 8 most relevant

    def _format_memories(self, memories: list[dict]) -> str:
        """Format memories into a context string."""
        if not memories:
            return "No specific memories retrieved for this context."

        lines = []
        for i, mem in enumerate(memories, 1):
            content = mem.get("content", "")[:300]
            metadata = mem.get("metadata", {})
            source = metadata.get("source", "unknown")
            lines.append(f"{i}. [{source}] {content}")

        return "\n".join(lines)

    def _save_message(
        self, conversation_id: str, role: str, content: str, emotion: str
    ):
        """Save a message to the database."""
        if not self._session_factory:
            return

        session = self._session_factory()
        try:
            from backend.database.models import EmotionType
            try:
                emotion_enum = EmotionType(emotion.lower())
            except (ValueError, KeyError):
                emotion_enum = EmotionType.NEUTRAL

            msg = Message(
                conversation_id=hash(conversation_id) % 2147483647,
                role=role,
                content=content,
                emotion=emotion_enum,
            )
            session.add(msg)
            session.commit()
        except Exception as e:
            session.rollback()
            logger.debug(f"Message save skipped: {e}")
        finally:
            session.close()

    def _store_in_memory(
        self, user_msg: str, twin_msg: str, contact_name: Optional[str] = None
    ):
        """Store conversation exchange in vector memory."""
        doc_id = f"conv_{uuid.uuid4().hex[:12]}"
        combined = f"User: {user_msg}\nTwin: {twin_msg}"
        metadata = {
            "source": "conversation",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if contact_name:
            metadata["contact"] = contact_name

        vector_store.add_memory("conversations", combined, metadata, doc_id)

    def add_memory(self, content: str, category: str = "personal", importance: float = 0.5):
        """Manually add a memory to the twin's knowledge."""
        doc_id = f"mem_{uuid.uuid4().hex[:12]}"
        metadata = {
            "source": "manual",
            "category": category,
            "importance": importance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        vector_store.add_memory("memories", content, metadata, doc_id)

        if self._session_factory:
            session = self._session_factory()
            try:
                mem = Memory(
                    category=category,
                    content=content,
                    importance=importance,
                    source="manual",
                    embedding_id=doc_id,
                )
                session.add(mem)
                session.commit()
            except Exception:
                session.rollback()
            finally:
                session.close()

        logger.info(f"Memory added: [{category}] {content[:50]}...")

    def get_conversation_history(self, conversation_id: str) -> list[dict]:
        """Get conversation history."""
        return self._active_conversations.get(conversation_id, [])

    def get_stats(self) -> dict:
        """Get twin engine statistics."""
        return {
            "active_conversations": len(self._active_conversations),
            "total_messages": sum(
                len(msgs) for msgs in self._active_conversations.values()
            ),
            "personality_traits": len(personality_learner.profile.traits),
            "known_contacts": len(personality_learner.profile.relationship_styles),
            "memory_stats": vector_store.get_stats(),
            "llm_available": llm_engine.is_available,
        }


# Singleton
twin_engine = TwinEngine()
