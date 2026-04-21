"""
Mirra - Data Capture Engine
Captures voice, video, screen data for training Mirra.
All data stays local. Privacy-first design.
"""

import json
import os
import uuid
import wave
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from loguru import logger

from backend.config import settings
from backend.database.models import VoiceSample, FaceSample, InteractionLog, get_session_factory


class AudioCapture:
    """Captures audio for voice cloning and interaction learning."""

    def __init__(self):
        self._recording = False
        self._thread: Optional[threading.Thread] = None
        self._audio_data: list = []
        self._sample_rate = 16000
        self._channels = 1
        self._session_factory = None

    def initialize(self):
        self._session_factory = get_session_factory()
        logger.info("Audio capture initialized")

    def start_recording(self, duration_seconds: Optional[int] = None) -> str:
        """Start recording audio from microphone."""
        if self._recording:
            return "Already recording"

        try:
            import sounddevice as sd

            self._recording = True
            self._audio_data = []
            recording_id = uuid.uuid4().hex[:12]

            def record():
                try:
                    if duration_seconds:
                        audio = sd.rec(
                            int(duration_seconds * self._sample_rate),
                            samplerate=self._sample_rate,
                            channels=self._channels,
                            dtype="int16",
                        )
                        sd.wait()
                        self._audio_data = [audio]
                    else:
                        # Record until stopped
                        while self._recording:
                            chunk = sd.rec(
                                int(self._sample_rate),  # 1 second chunks
                                samplerate=self._sample_rate,
                                channels=self._channels,
                                dtype="int16",
                            )
                            sd.wait()
                            self._audio_data.append(chunk)
                except Exception as e:
                    logger.error(f"Recording error: {e}")
                finally:
                    self._recording = False

            self._thread = threading.Thread(target=record, daemon=True)
            self._thread.start()

            return recording_id
        except ImportError:
            return "sounddevice not installed"
        except Exception as e:
            return f"Error: {e}"

    def stop_recording(self) -> Optional[str]:
        """Stop recording and save the audio file."""
        if self._recording:
            self._recording = False

        if self._thread:
            self._thread.join(timeout=5)

        if not self._audio_data:
            return None

        # Concatenate all chunks
        audio = np.concatenate(self._audio_data, axis=0)

        # Save to file
        recordings_dir = settings.get_abs_path(settings.data_capture.RECORDINGS_DIR)
        recordings_dir.mkdir(parents=True, exist_ok=True)

        filename = f"recording_{datetime.now().strftime('%Y%m%d_%H%M%S')}.wav"
        filepath = recordings_dir / filename

        with wave.open(str(filepath), "wb") as wf:
            wf.setnchannels(self._channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(self._sample_rate)
            wf.writeframes(audio.tobytes())

        # Save to database
        if self._session_factory:
            session = self._session_factory()
            try:
                sample = VoiceSample(
                    file_path=str(filepath),
                    duration_seconds=len(audio) / self._sample_rate,
                )
                session.add(sample)
                session.commit()
            except Exception:
                session.rollback()
            finally:
                session.close()

        logger.info(f"Recording saved: {filepath}")
        return str(filepath)

    @property
    def is_recording(self) -> bool:
        return self._recording


class VideoCapture:
    """Captures video/face for expression learning and avatar training."""

    def __init__(self):
        self._capturing = False
        self._thread: Optional[threading.Thread] = None
        self._session_factory = None

    def initialize(self):
        self._session_factory = get_session_factory()
        logger.info("Video capture initialized")

    def capture_face_samples(self, num_samples: int = 10, interval_seconds: float = 2.0) -> list[str]:
        """Capture face samples from webcam for avatar training."""
        saved_paths = []

        try:
            import cv2

            face_dir = settings.get_abs_path(settings.ai.FACE_SAMPLES_DIR)
            face_dir.mkdir(parents=True, exist_ok=True)

            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                logger.error("Cannot open webcam")
                return []

            # Load face detector
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )

            captured = 0
            while captured < num_samples:
                ret, frame = cap.read()
                if not ret:
                    break

                # Detect faces
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.3, 5)

                if len(faces) > 0:
                    # Save the frame with face
                    filename = f"face_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{captured}.jpg"
                    filepath = face_dir / filename
                    cv2.imwrite(str(filepath), frame)
                    saved_paths.append(str(filepath))

                    # Save to database
                    if self._session_factory:
                        session = self._session_factory()
                        try:
                            sample = FaceSample(
                                file_path=str(filepath),
                                quality_score=0.8,
                            )
                            session.add(sample)
                            session.commit()
                        except Exception:
                            session.rollback()
                        finally:
                            session.close()

                    captured += 1
                    logger.info(f"Face sample {captured}/{num_samples} captured")

                time.sleep(interval_seconds)

            cap.release()
            return saved_paths

        except ImportError:
            logger.warning("OpenCV not available for video capture")
            return []
        except Exception as e:
            logger.error(f"Face capture failed: {e}")
            return []

    def extract_frames_from_video(self, video_path: str, interval_seconds: float = 5.0) -> list[str]:
        """Extract face frames from a video file."""
        saved_paths = []

        try:
            import cv2

            face_dir = settings.get_abs_path(settings.ai.FACE_SAMPLES_DIR)
            face_dir.mkdir(parents=True, exist_ok=True)

            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            frame_interval = int(fps * interval_seconds)

            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )

            frame_count = 0
            saved_count = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_count % frame_interval == 0:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

                    if len(faces) > 0:
                        filename = f"face_video_{saved_count}.jpg"
                        filepath = face_dir / filename
                        cv2.imwrite(str(filepath), frame)
                        saved_paths.append(str(filepath))
                        saved_count += 1

                frame_count += 1

            cap.release()
            logger.info(f"Extracted {saved_count} face samples from video")
            return saved_paths

        except Exception as e:
            logger.error(f"Video frame extraction failed: {e}")
            return []


class InteractionTracker:
    """Tracks user interactions and behavioral patterns."""

    def __init__(self):
        self._session_factory = None

    def initialize(self):
        self._session_factory = get_session_factory()

    def log_interaction(
        self,
        interaction_type: str,
        context: str,
        duration_seconds: float = 0,
        patterns: dict = None,
    ):
        """Log a user interaction for behavioral learning."""
        if not self._session_factory:
            return

        session = self._session_factory()
        try:
            log = InteractionLog(
                interaction_type=interaction_type,
                context=context,
                duration_seconds=duration_seconds,
                patterns_extracted=json.dumps(patterns or {}),
            )
            session.add(log)
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Interaction logging failed: {e}")
        finally:
            session.close()

    def get_interaction_stats(self, days: int = 7) -> dict:
        """Get interaction statistics."""
        if not self._session_factory:
            return {}

        session = self._session_factory()
        try:
            since = datetime.now(timezone.utc) - timedelta(days=days)
            logs = session.query(InteractionLog).filter(
                InteractionLog.timestamp >= since
            ).all()

            stats = {
                "total_interactions": len(logs),
                "by_type": {},
                "total_duration_hours": 0,
            }

            for log in logs:
                itype = log.interaction_type
                if itype not in stats["by_type"]:
                    stats["by_type"][itype] = 0
                stats["by_type"][itype] += 1
                stats["total_duration_hours"] += (log.duration_seconds or 0) / 3600

            return stats
        except Exception as e:
            logger.error(f"Stats calculation failed: {e}")
            return {}
        finally:
            session.close()


# Singletons
audio_capture = AudioCapture()
video_capture = VideoCapture()
interaction_tracker = InteractionTracker()
