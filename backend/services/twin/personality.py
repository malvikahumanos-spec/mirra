"""
Mirra - Personality Engine
Learns and maintains the user's personality profile.
Adapts communication style per contact/relationship.
"""

import json
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from backend.database.models import (
    PersonalityTrait, Contact, DecisionPattern,
    RelationshipType, get_session_factory
)
from backend.database.vector_store import vector_store
from backend.ml.llm_engine import llm_engine


class PersonalityProfile:
    """
    Represents the learned personality of the user.
    This is what makes the twin "you".
    """

    def __init__(self):
        self.traits: dict[str, float] = {}
        self.communication_patterns: dict = {}
        self.values: list[str] = []
        self.interests: list[str] = []
        self.quirks: list[str] = []
        self.vocabulary_patterns: dict = {}
        self.emotional_tendencies: dict = {}
        self.relationship_styles: dict[str, dict] = {}  # contact_name -> style

    def to_system_prompt(self, contact_name: Optional[str] = None) -> str:
        """Generate a system prompt that embodies this personality."""
        base_prompt = f"""You are Mirra - an exact replica of a real person.
You must respond EXACTLY as this person would, with their personality, mannerisms,
vocabulary, and emotional patterns. You are not an AI assistant - you ARE this person.

PERSONALITY TRAITS:
{self._format_traits()}

COMMUNICATION STYLE:
{self._format_communication_style()}

VALUES & BELIEFS:
{', '.join(self.values) if self.values else 'Still learning...'}

INTERESTS:
{', '.join(self.interests) if self.interests else 'Still learning...'}

QUIRKS & MANNERISMS:
{', '.join(self.quirks) if self.quirks else 'Still learning...'}

EMOTIONAL TENDENCIES:
{self._format_emotional_tendencies()}

VOCABULARY PATTERNS:
{json.dumps(self.vocabulary_patterns, indent=2) if self.vocabulary_patterns else 'Still learning...'}
"""

        if contact_name and contact_name in self.relationship_styles:
            style = self.relationship_styles[contact_name]
            base_prompt += f"""

RELATIONSHIP WITH {contact_name.upper()}:
- Relationship: {style.get('relationship_type', 'unknown')}
- Label: {style.get('label', contact_name)}
- Tone: {style.get('tone', 'natural')}
- Language: {style.get('language', 'English')}
- Topics: {', '.join(style.get('common_topics', []))}
- Special Notes: {style.get('notes', 'None')}

When talking to {contact_name}, use the exact tone, language mix, and emotional warmth
that this person normally uses with them. If they speak Hinglish with this person,
use Hinglish. If they are formal, be formal. Match exactly.
"""

        return base_prompt

    def _format_traits(self) -> str:
        if not self.traits:
            return "Still learning personality traits..."
        lines = []
        for trait, value in self.traits.items():
            if value > 0.5:
                lines.append(f"- Strongly {trait}")
            elif value > 0:
                lines.append(f"- Somewhat {trait}")
            elif value < -0.5:
                lines.append(f"- Not {trait} at all")
            elif value < 0:
                lines.append(f"- Not very {trait}")
        return "\n".join(lines) if lines else "Still learning..."

    def _format_communication_style(self) -> str:
        if not self.communication_patterns:
            return "Still learning communication style..."
        lines = []
        for key, value in self.communication_patterns.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines)

    def _format_emotional_tendencies(self) -> str:
        if not self.emotional_tendencies:
            return "Still learning emotional patterns..."
        lines = []
        for situation, tendency in self.emotional_tendencies.items():
            lines.append(f"- In {situation}: tends to be {tendency}")
        return "\n".join(lines)


class PersonalityLearner:
    """
    Learns personality traits from interactions, conversations,
    emails, notes, and behavioral data.
    """

    def __init__(self):
        self.profile = PersonalityProfile()
        self._session_factory = None

    def initialize(self):
        """Initialize the personality learner."""
        self._session_factory = get_session_factory()
        self._load_existing_profile()
        logger.info("Personality learner initialized")

    def _load_existing_profile(self):
        """Load previously learned personality from database."""
        if not self._session_factory:
            return

        session = self._session_factory()
        try:
            traits = session.query(PersonalityTrait).all()
            for trait in traits:
                self.profile.traits[trait.trait_name] = trait.trait_value

            contacts = session.query(Contact).all()
            for contact in contacts:
                style = {
                    "relationship_type": contact.relationship_type.value if contact.relationship_type else "other",
                    "label": contact.relationship_label or contact.name,
                    "tone": "warm",
                    "language": contact.language_preference or "en",
                    "common_topics": json.loads(contact.topics_discussed) if contact.topics_discussed else [],
                    "notes": contact.notes or "",
                }
                if contact.communication_tone:
                    try:
                        tone_data = json.loads(contact.communication_tone)
                        style.update(tone_data)
                    except json.JSONDecodeError:
                        style["tone"] = contact.communication_tone
                self.profile.relationship_styles[contact.name] = style

        except Exception as e:
            logger.error(f"Failed to load personality: {e}")
        finally:
            session.close()

    async def learn_from_conversation(self, messages: list[dict], contact_name: Optional[str] = None):
        """Extract personality insights from a conversation."""
        if not messages:
            return

        # Get user messages only
        user_messages = [m["content"] for m in messages if m.get("role") == "user"]
        if not user_messages:
            return

        conversation_text = "\n".join(user_messages[-20:])  # Last 20 messages

        analysis_prompt = f"""Analyze this person's messages and extract personality traits.
Return ONLY a JSON object with these fields:
{{
    "traits": {{"trait_name": value_from_-1_to_1}},
    "communication_patterns": {{"pattern": "description"}},
    "vocabulary_quirks": ["list of unique phrases or words they use"],
    "emotional_tendency": "overall emotional tone",
    "interests_mentioned": ["topics they seem interested in"]
}}

Messages:
{conversation_text}"""

        try:
            response = await llm_engine.generate(analysis_prompt, temperature=0.2)
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                analysis = json.loads(response[start:end])
                self._update_profile(analysis, contact_name)
        except Exception as e:
            logger.error(f"Personality learning failed: {e}")

    def _update_profile(self, analysis: dict, contact_name: Optional[str] = None):
        """Update the personality profile with new insights."""
        # Update traits (running average)
        for trait, value in analysis.get("traits", {}).items():
            if trait in self.profile.traits:
                # Weighted average - existing knowledge matters more
                old = self.profile.traits[trait]
                self.profile.traits[trait] = old * 0.7 + float(value) * 0.3
            else:
                self.profile.traits[trait] = float(value)

        # Update communication patterns
        for pattern, desc in analysis.get("communication_patterns", {}).items():
            self.profile.communication_patterns[pattern] = desc

        # Update quirks
        for quirk in analysis.get("vocabulary_quirks", []):
            if quirk not in self.profile.quirks:
                self.profile.quirks.append(quirk)

        # Update interests
        for interest in analysis.get("interests_mentioned", []):
            if interest not in self.profile.interests:
                self.profile.interests.append(interest)

        # Save to database
        self._persist_profile()

    def _persist_profile(self):
        """Save personality profile to database."""
        if not self._session_factory:
            return

        session = self._session_factory()
        try:
            for trait_name, trait_value in self.profile.traits.items():
                existing = session.query(PersonalityTrait).filter_by(
                    trait_name=trait_name
                ).first()
                if existing:
                    existing.trait_value = trait_value
                    existing.evidence_count += 1
                    existing.updated_at = datetime.now(timezone.utc)
                else:
                    session.add(PersonalityTrait(
                        trait_name=trait_name,
                        trait_value=trait_value,
                        confidence=0.5,
                        evidence_count=1,
                    ))
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to persist personality: {e}")
        finally:
            session.close()

    def add_contact(
        self,
        name: str,
        relationship_type: str = "other",
        label: str = "",
        language: str = "en",
        tone: str = "warm",
        topics: list[str] = None,
        notes: str = "",
    ) -> bool:
        """Add a contact with relationship details."""
        if not self._session_factory:
            return False

        session = self._session_factory()
        try:
            rel_type = RelationshipType(relationship_type)
            contact = Contact(
                name=name,
                relationship_type=rel_type,
                relationship_label=label or name,
                communication_tone=json.dumps({"tone": tone}),
                topics_discussed=json.dumps(topics or []),
                language_preference=language,
                notes=notes,
            )
            session.add(contact)
            session.commit()

            self.profile.relationship_styles[name] = {
                "relationship_type": relationship_type,
                "label": label or name,
                "tone": tone,
                "language": language,
                "common_topics": topics or [],
                "notes": notes,
            }

            logger.info(f"Contact added: {name} ({relationship_type})")
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to add contact: {e}")
            return False
        finally:
            session.close()


# Singleton
personality_learner = PersonalityLearner()
