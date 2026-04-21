# Mirra - Your Mirra

**Tumhari Mirra. Ekdum tumhare jaisa. 100% Local. 100% Private.**

A complete AI-powered Mirra system that learns your personality, voice, expressions,
decision patterns, and communication style. It can talk to your family, attend meetings,
and be you — even when you're not there.

---

## What This System Does

### Mirra (Conversational AI Clone)
- **Personality Learning**: Learns your communication style, vocabulary, emotions, quirks
- **Relationship-Aware**: Talks differently to Mummy vs Papa vs colleagues — just like you do
- **Voice Cloning**: Speaks in YOUR voice using local voice synthesis
- **Emotion Detection**: Understands and expresses emotions through text, voice, and face
- **Memory System**: Remembers everything you teach it — stories, preferences, opinions
- **Multilingual**: Supports English, Hindi, Hinglish — whatever you use

### Human Intent OS
- **Smart Calendar**: Integrates your schedule, import .ics files
- **Task Management**: AI-powered prioritization that learns your patterns
- **Notes**: Semantically searchable knowledge base
- **Email Processing**: Local email analysis (no cloud)
- **Decision Learning**: Learns how you make decisions over time
- **AI Suggestions**: Proactive recommendations based on your patterns

### Data Capture & Training
- **Voice Recording**: Record from mic or upload audio files
- **Video Processing**: Extract face samples from videos automatically
- **Face Capture**: Webcam-based face/expression capture
- **Behavioral Learning**: Tracks interaction patterns

---

## Privacy & Security

| Feature | Implementation |
|---------|---------------|
| **Network** | Server binds to 127.0.0.1 ONLY — impossible to access from network |
| **AI Processing** | All AI runs via Ollama locally on YOUR hardware |
| **Speech** | Whisper runs offline — no API calls |
| **Encryption** | AES-256 encryption for all sensitive data at rest |
| **Auth** | Bcrypt password hashing, JWT tokens, account lockout |
| **Firewall** | Built-in network monitor blocks any external connections |
| **Telemetry** | ZERO telemetry, analytics, or cloud sync |
| **Data** | Everything in local /data directory — delete to erase all |

---

## Quick Start

### Prerequisites
- **Python 3.10+** — [Download](https://www.python.org/downloads/)
- **Node.js 18+** — [Download](https://nodejs.org/)
- **Ollama** — [Download](https://ollama.com/download)

### Setup (First Time)

```bash
# 1. Double-click setup.bat OR run:
python scripts/setup.py

# 2. Install Ollama and pull models:
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# 3. Start Ollama:
ollama serve
```

### Run

```bash
# Double-click start.bat OR run:
python scripts/start.py

# Or manually:
# Terminal 1 - Backend:
python -m backend.main

# Terminal 2 - Frontend:
cd frontend && npm run dev

# Open: http://127.0.0.1:3000
```

---

## Architecture

```
Mirra/
├── backend/                 # Python FastAPI Backend
│   ├── api/routes.py        # REST API endpoints
│   ├── config/settings.py   # All configuration
│   ├── database/
│   │   ├── models.py        # SQLite models (SQLAlchemy)
│   │   └── vector_store.py  # ChromaDB vector database
│   ├── ml/
│   │   ├── llm_engine.py    # Ollama LLM integration
│   │   ├── voice_engine.py  # Whisper STT + Coqui TTS
│   │   └── emotion_engine.py# Multi-modal emotion detection
│   ├── security/
│   │   ├── auth.py          # Authentication system
│   │   ├── encryption.py    # AES-256 encryption
│   │   └── firewall.py      # Network security monitor
│   ├── services/
│   │   ├── twin/
│   │   │   ├── twin_engine.py    # Core twin conversation engine
│   │   │   └── personality.py    # Personality learning system
│   │   ├── intent_os/
│   │   │   └── intent_engine.py  # Calendar, tasks, notes, email
│   │   └── data_capture/
│   │       └── capture_engine.py # Audio, video, face capture
│   └── main.py              # FastAPI application
├── frontend/                # React + Vite + Tailwind
│   └── src/
│       ├── pages/           # Dashboard, Chat, Tasks, Notes, etc.
│       ├── components/      # Reusable UI components
│       └── services/        # API client & state management
├── data/                    # All personal data (local only)
├── models/                  # AI model files (local only)
├── scripts/
│   ├── setup.py             # First-time setup
│   └── start.py             # Quick start
├── setup.bat                # Windows setup shortcut
└── start.bat                # Windows start shortcut
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **LLM** | Ollama (llama3.1) | Fully local, no API keys needed |
| **Backend** | FastAPI | Fast, async, modern Python |
| **Database** | SQLite | Zero-config, file-based, portable |
| **Vector DB** | ChromaDB | Local semantic search for memories |
| **Speech-to-Text** | OpenAI Whisper | Best accuracy, runs fully offline |
| **Text-to-Speech** | Coqui TTS (XTTS v2) | Voice cloning capability |
| **Emotion** | DistilRoBERTa + FER | Multi-modal emotion detection |
| **Frontend** | React + Vite + Tailwind | Fast, modern, beautiful UI |
| **State** | Zustand | Lightweight state management |
| **Encryption** | Fernet (AES) + PBKDF2 | Industry-standard encryption |

---

## How to Train Mirra

1. **Chat regularly** — Every conversation teaches Mirra your style
2. **Add contacts** — Tell it about Mummy, Papa, Bhai, friends, colleagues
3. **Upload voice** — Record yourself or upload calls/voice notes (5+ clips)
4. **Upload videos** — Share video calls, vlogs for face expression learning
5. **Teach memories** — Share your stories, preferences, opinions, habits
6. **Use the Intent OS** — Tasks, notes, calendar all feed into learning

The more you interact, the more "you" Mirra becomes.

---

*Built with love. Your data is yours alone.*
