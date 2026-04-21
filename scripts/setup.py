"""
Mirra - Setup Script
Handles first-time setup: installs dependencies, initializes database,
downloads models, and configures the system.

Run: python scripts/setup.py
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

BANNER = """
╔══════════════════════════════════════════════════════╗
║                                                      ║
║                MIRRA - Setup Wizard                  ║
║            Your Mirra. 100% Local.                   ║
║                                                      ║
║  This script will:                                   ║
║  1. Install Python dependencies                      ║
║  2. Install frontend dependencies                    ║
║  3. Initialize the local database                    ║
║  4. Check for Ollama (local LLM)                     ║
║  5. Set up encryption keys                           ║
║                                                      ║
║  PRIVACY: Everything stays on YOUR machine.          ║
║  No cloud. No external services. No telemetry.       ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
"""


def print_step(step_num, total, message):
    print(f"\n{'='*50}")
    print(f"  Step {step_num}/{total}: {message}")
    print(f"{'='*50}")


def run_command(cmd, cwd=None, check=True):
    """Run a command and return success status."""
    try:
        result = subprocess.run(
            cmd, cwd=cwd, check=check,
            capture_output=True, text=True, shell=True
        )
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr
    except FileNotFoundError:
        return False, f"Command not found: {cmd}"


def check_python():
    """Check Python version."""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 10):
        print(f"  ERROR: Python 3.10+ required. Found: {sys.version}")
        return False
    print(f"  Python {sys.version.split()[0]} - OK")
    return True


def install_python_deps():
    """Install Python dependencies."""
    print_step(1, 5, "Installing Python Dependencies")

    req_file = PROJECT_ROOT / "backend" / "requirements.txt"
    if not req_file.exists():
        print("  ERROR: requirements.txt not found!")
        return False

    print("  Installing packages (this may take several minutes)...")
    success, output = run_command(
        f'"{sys.executable}" -m pip install -r "{req_file}"',
        cwd=str(PROJECT_ROOT),
        check=False
    )

    if not success:
        print(f"  WARNING: Some packages may have failed: {output[:200]}")
        print("  You can install them manually later.")
    else:
        print("  Python dependencies installed successfully!")
    return True


def install_frontend_deps():
    """Install frontend (Node.js) dependencies."""
    print_step(2, 5, "Installing Frontend Dependencies")

    # Check if Node.js is available
    success, output = run_command("node --version", check=False)
    if not success:
        print("  WARNING: Node.js not found!")
        print("  Please install Node.js from: https://nodejs.org/")
        print("  Then run: cd frontend && npm install")
        return False

    print(f"  Node.js found: {output.strip()}")

    frontend_dir = PROJECT_ROOT / "frontend"
    print("  Installing npm packages...")
    success, output = run_command("npm install", cwd=str(frontend_dir), check=False)

    if success:
        print("  Frontend dependencies installed!")
    else:
        print(f"  WARNING: npm install had issues: {output[:200]}")
    return True


def initialize_database():
    """Initialize SQLite database and vector store."""
    print_step(3, 5, "Initializing Local Database")

    try:
        # Create data directories
        data_dirs = [
            "data", "data/recordings", "data/voice_samples",
            "data/face_samples", "data/embeddings", "data/encrypted",
            "data/backups", "data/email_cache", "data/notes",
            "data/calendar", "logs", "models/llm", "models/voice",
            "models/face", "models/emotion", "models/whisper"
        ]
        for d in data_dirs:
            (PROJECT_ROOT / d).mkdir(parents=True, exist_ok=True)

        print("  Data directories created")

        # Initialize SQLite
        try:
            from backend.database.models import create_database
            create_database()
            print("  SQLite database initialized")
        except Exception as e:
            print(f"  WARNING: Database init deferred: {e}")

        # Initialize vector store
        try:
            from backend.database.vector_store import vector_store
            vector_store.initialize()
            print("  Vector store (ChromaDB) initialized")
        except Exception as e:
            print(f"  WARNING: Vector store init deferred: {e}")

        return True
    except Exception as e:
        print(f"  WARNING: {e}")
        return True  # Non-critical


def check_ollama():
    """Check if Ollama is installed and running."""
    print_step(4, 5, "Checking Ollama (Local LLM)")

    success, output = run_command("ollama --version", check=False)
    if not success:
        print("  Ollama not found!")
        print("")
        print("  To install Ollama (required for the AI brain):")
        print("  1. Download from: https://ollama.com/download")
        print("  2. Install and run: ollama serve")
        print("  3. Pull the model: ollama pull llama3.1:8b")
        print("  4. Also pull embeddings: ollama pull nomic-embed-text")
        print("")
        return False

    print(f"  Ollama found: {output.strip()}")

    # Check if model is available
    success, output = run_command("ollama list", check=False)
    if success and "llama" in output.lower():
        print("  LLM model detected!")
    else:
        print("  No model loaded yet. Run these commands:")
        print("    ollama pull llama3.1:8b")
        print("    ollama pull nomic-embed-text")

    return True


def setup_security():
    """Initial security configuration."""
    print_step(5, 5, "Security Configuration")

    import secrets
    env_file = PROJECT_ROOT / ".env"

    if not env_file.exists():
        secret_key = secrets.token_hex(64)
        with open(env_file, "w") as f:
            f.write(f"# Mirra - Local Configuration\n")
            f.write(f"# NEVER share this file!\n\n")
            f.write(f"SECRET_KEY={secret_key}\n")
            f.write(f"DEBUG=false\n")
            f.write(f"HOST=127.0.0.1\n")
            f.write(f"PORT=8765\n")

        # Restrict permissions
        try:
            os.chmod(env_file, 0o600)
        except Exception:
            pass

        print("  Secret key generated")
        print(f"  Environment file created: {env_file}")
    else:
        print("  Environment file already exists")

    # Create .gitignore
    gitignore_file = PROJECT_ROOT / ".gitignore"
    gitignore_content = """# Mirra - Git Ignore
# IMPORTANT: Never commit personal data!

# Personal data
data/
models/
logs/
*.db
*.sqlite

# Environment and secrets
.env
*.key
*.pem
data/encrypted/

# Voice and face samples
data/voice_samples/
data/face_samples/
data/recordings/

# Python
__pycache__/
*.pyc
*.pyo
.venv/
venv/
env/

# Node
node_modules/
frontend/dist/
.next/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
"""
    with open(gitignore_file, "w") as f:
        f.write(gitignore_content)
    print("  .gitignore created (protects your personal data)")

    print("  Security configured!")
    return True


def main():
    print(BANNER)

    if not check_python():
        sys.exit(1)

    print(f"\n  Project directory: {PROJECT_ROOT}")
    print(f"  All data will be stored locally in: {PROJECT_ROOT / 'data'}")
    print()

    input("  Press Enter to begin setup...")

    install_python_deps()
    install_frontend_deps()
    initialize_database()
    check_ollama()
    setup_security()

    print("\n" + "=" * 50)
    print("""
  SETUP COMPLETE!

  To start Mirra:
  -----------------------------------------
  1. Start Ollama (in a separate terminal):
     ollama serve

  2. Start the backend:
     python -m backend.main

  3. Start the frontend (in another terminal):
     cd frontend && npm run dev

  4. Open in browser:
     http://127.0.0.1:3000
  -----------------------------------------

  Or use the quick start script:
     python scripts/start.py

  First time? Create an account at the login page.
  Then start training Mirra at the Training page!
""")


if __name__ == "__main__":
    main()
