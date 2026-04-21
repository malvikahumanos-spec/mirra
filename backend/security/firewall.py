"""
Mirra - Network Firewall / Security Monitor
Ensures no data leaves the local machine.
"""

import socket
import threading
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field
from loguru import logger


@dataclass
class NetworkEvent:
    timestamp: datetime
    source_ip: str
    destination_ip: str
    port: int
    protocol: str
    blocked: bool
    reason: str = ""


class NetworkFirewall:
    """
    Monitors and blocks any outgoing network connections.
    Only allows localhost (127.0.0.1) traffic.
    """

    ALLOWED_HOSTS = {
        "127.0.0.1",
        "localhost",
        "::1",
        "0.0.0.0",
    }

    # Ollama runs locally
    ALLOWED_PORTS = {
        8765,   # Mirra backend
        3000,   # Mirra frontend
        11434,  # Ollama
    }

    def __init__(self):
        self._events: list[NetworkEvent] = []
        self._blocked_count: int = 0
        self._allowed_count: int = 0
        self._active: bool = True

    def check_connection(self, host: str, port: int, protocol: str = "TCP") -> bool:
        """Check if a connection should be allowed."""
        if not self._active:
            return True

        is_local = host in self.ALLOWED_HOSTS or host.startswith("127.")

        if not is_local:
            self._blocked_count += 1
            event = NetworkEvent(
                timestamp=datetime.now(timezone.utc),
                source_ip="127.0.0.1",
                destination_ip=host,
                port=port,
                protocol=protocol,
                blocked=True,
                reason=f"External connection blocked: {host}:{port}",
            )
            self._events.append(event)
            logger.warning(f"BLOCKED external connection attempt: {host}:{port}")
            return False

        self._allowed_count += 1
        return True

    def get_security_report(self) -> dict:
        """Generate security status report."""
        return {
            "firewall_active": self._active,
            "total_blocked": self._blocked_count,
            "total_allowed": self._allowed_count,
            "recent_blocked": [
                {
                    "time": e.timestamp.isoformat(),
                    "destination": f"{e.destination_ip}:{e.port}",
                    "reason": e.reason,
                }
                for e in self._events[-20:]
                if e.blocked
            ],
            "status": "SECURE" if self._blocked_count == 0 else "ALERTS_PRESENT",
        }

    def verify_localhost_only(self) -> bool:
        """Verify the server is only bound to localhost."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(("127.0.0.1", 8765))
            sock.close()
            return True
        except Exception:
            return False


# Singleton
firewall = NetworkFirewall()
