"""
Mirra - Voice Engine
Local speech-to-text (Whisper) and text-to-speech (Coqui TTS).
Voice cloning from user's audio samples.
"""

import io
import os
import wave
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
from loguru import logger

from backend.config import settings


class SpeechToText:
    """Local speech-to-text using OpenAI Whisper (runs locally)."""

    def __init__(self):
        self._model = None
        self._model_size = settings.ai.WHISPER_MODEL_SIZE

    def initialize(self):
        """Load Whisper model locally."""
        try:
            import whisper
            self._model = whisper.load_model(self._model_size)
            logger.info(f"Whisper STT loaded: {self._model_size}")
            return True
        except Exception as e:
            logger.warning(f"Whisper not available: {e}. Install with: pip install openai-whisper")
            return False

    def transcribe(self, audio_path: str, language: str = None) -> dict:
        """Transcribe audio file to text."""
        if not self._model:
            return {"text": "", "error": "Whisper not initialized"}

        try:
            result = self._model.transcribe(
                audio_path,
                language=language or settings.ai.WHISPER_LANGUAGE,
                fp16=False,
            )
            return {
                "text": result["text"].strip(),
                "language": result.get("language", "unknown"),
                "segments": [
                    {
                        "start": s["start"],
                        "end": s["end"],
                        "text": s["text"].strip(),
                    }
                    for s in result.get("segments", [])
                ],
            }
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return {"text": "", "error": str(e)}

    def transcribe_audio_bytes(self, audio_bytes: bytes, sample_rate: int = 16000) -> dict:
        """Transcribe audio from bytes."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            # Write WAV header and data
            with wave.open(f, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sample_rate)
                wav.writeframes(audio_bytes)
            temp_path = f.name

        try:
            result = self.transcribe(temp_path)
            return result
        finally:
            os.unlink(temp_path)

    @property
    def is_available(self) -> bool:
        return self._model is not None


class TextToSpeech:
    """Local text-to-speech with voice cloning capability using Coqui TTS."""

    def __init__(self):
        self._tts = None
        self._voice_cloned = False
        self._speaker_wav: Optional[str] = None

    def initialize(self, speaker_wav: Optional[str] = None):
        """Initialize TTS engine. Optionally with voice cloning."""
        try:
            from TTS.api import TTS

            # Use XTTS v2 for voice cloning
            self._tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

            if speaker_wav and Path(speaker_wav).exists():
                self._speaker_wav = speaker_wav
                self._voice_cloned = True
                logger.info(f"Voice cloning initialized with: {speaker_wav}")
            else:
                logger.info("TTS initialized (no voice clone - provide voice samples)")

            return True
        except Exception as e:
            logger.warning(f"TTS not available: {e}. Install with: pip install TTS")
            return False

    def synthesize(
        self,
        text: str,
        output_path: str,
        language: str = "en",
        emotion: str = "neutral",
    ) -> Optional[str]:
        """Convert text to speech, optionally using cloned voice."""
        if not self._tts:
            logger.warning("TTS not initialized")
            return None

        try:
            if self._voice_cloned and self._speaker_wav:
                self._tts.tts_to_file(
                    text=text,
                    file_path=output_path,
                    speaker_wav=self._speaker_wav,
                    language=language,
                )
            else:
                self._tts.tts_to_file(
                    text=text,
                    file_path=output_path,
                )

            logger.debug(f"Speech synthesized: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"Speech synthesis failed: {e}")
            return None

    def synthesize_to_bytes(self, text: str, language: str = "en") -> Optional[bytes]:
        """Convert text to speech and return audio bytes."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name

        try:
            result = self.synthesize(text, temp_path, language)
            if result:
                with open(temp_path, "rb") as f:
                    return f.read()
            return None
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def set_voice_sample(self, wav_path: str) -> bool:
        """Set/update the voice sample for cloning."""
        if Path(wav_path).exists():
            self._speaker_wav = wav_path
            self._voice_cloned = True
            logger.info(f"Voice sample updated: {wav_path}")
            return True
        return False

    @property
    def is_voice_cloned(self) -> bool:
        return self._voice_cloned

    @property
    def is_available(self) -> bool:
        return self._tts is not None


class VoiceAnalyzer:
    """Analyzes voice characteristics for twin personality."""

    def analyze_audio(self, audio_path: str) -> dict:
        """Extract voice characteristics from audio."""
        try:
            import librosa

            y, sr = librosa.load(audio_path, sr=None)

            # Extract features
            pitch = librosa.yin(y, fmin=50, fmax=500, sr=sr)
            energy = np.mean(librosa.feature.rms(y=y))
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))

            return {
                "avg_pitch": float(np.nanmean(pitch)),
                "pitch_range": float(np.nanmax(pitch) - np.nanmin(pitch)),
                "energy": float(energy),
                "speaking_rate": float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0]) if len(tempo) > 0 else 0.0,
                "spectral_centroid": float(spectral_centroid),
                "duration": float(len(y) / sr),
            }
        except Exception as e:
            logger.error(f"Voice analysis failed: {e}")
            return {}


# Singletons
stt_engine = SpeechToText()
tts_engine = TextToSpeech()
voice_analyzer = VoiceAnalyzer()
