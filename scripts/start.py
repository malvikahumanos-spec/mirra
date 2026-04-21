"""
Mirra - Quick Start Script
Starts all components: backend + frontend.

Run: python scripts/start.py
"""

import os
import sys
import subprocess
import time
import signal
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

BANNER = """
╔══════════════════════════════════════════════════════╗
║                                                      ║
║              MIRRA - Starting Up                     ║
║                                                      ║
║         100% Local | 100% Private | 100% You         ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
"""

processes = []


def cleanup(signum=None, frame=None):
    """Clean up all processes on exit."""
    print("\n\nShutting down Mirra...")
    for proc in processes:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    print("Goodbye! Your data remains safe and local.")
    sys.exit(0)


def check_ollama():
    """Check if Ollama is running."""
    try:
        import httpx
        response = httpx.get("http://127.0.0.1:11434/api/tags", timeout=3)
        return response.status_code == 200
    except Exception:
        return False


def start_backend():
    """Start the FastAPI backend."""
    print("  Starting backend server...")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app",
         "--host", "127.0.0.1", "--port", "8765",
         "--log-level", "info"],
        cwd=str(PROJECT_ROOT),
    )
    processes.append(proc)
    return proc


def start_frontend():
    """Start the frontend dev server."""
    frontend_dir = PROJECT_ROOT / "frontend"
    node_modules = frontend_dir / "node_modules"

    if not node_modules.exists():
        print("  Installing frontend dependencies first...")
        subprocess.run("npm install", cwd=str(frontend_dir), shell=True)

    print("  Starting frontend server...")
    proc = subprocess.Popen(
        "npm run dev",
        cwd=str(frontend_dir),
        shell=True,
    )
    processes.append(proc)
    return proc


def main():
    print(BANNER)

    # Register cleanup handler
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Check Ollama
    if check_ollama():
        print("  Ollama: Running")
    else:
        print("  Ollama: Not running")
        print("  WARNING: Start Ollama first for AI features:")
        print("           ollama serve")
        print()

    # Start services
    backend_proc = start_backend()
    time.sleep(2)

    frontend_proc = start_frontend()
    time.sleep(2)

    print()
    print("=" * 50)
    print()
    print("  MIRRA is running!")
    print()
    print("  Dashboard:  http://127.0.0.1:3000")
    print("  API Docs:   http://127.0.0.1:8765/api/docs")
    print()
    print("  Press Ctrl+C to stop")
    print()
    print("=" * 50)

    # Wait for processes
    try:
        while True:
            # Check if processes are still alive
            if backend_proc.poll() is not None:
                print("  Backend stopped unexpectedly!")
                break
            if frontend_proc.poll() is not None:
                print("  Frontend stopped unexpectedly!")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
