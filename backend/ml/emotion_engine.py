"""
Mirra - Emotion Detection Engine
Detects emotions from text, voice, and facial expressions.
All processing happens locally.
"""

import os
from typing import Optional
from pathlib import Path

import numpy as np
from loguru import logger


class TextEmotionDetector:
    """Detect emotions from text using local transformer model."""

    def __init__(self):
        self._pipeline = None

    def initialize(self):
        """Load emotion detection model."""
        try:
            from transformers import pipeline

            self._pipeline = pipeline(
                "text-classification",
                model="j-hartmann/emotion-english-distilroberta-base",
                top_k=None,
                device=-1,  # CPU only - local
            )
            logger.info("Text emotion detector loaded")
            return True
        except Exception as e:
            logger.warning(f"Text emotion model not available: {e}")
            return False

    def detect(self, text: str) -> dict:
        """Detect emotion from text."""
        if not self._pipeline:
            return {"emotion": "neutral", "confidence": 0.5, "all_scores": {}}

        try:
            results = self._pipeline(text[:512])  # Limit input length
            if results and isinstance(results[0], list):
                scores = {r["label"]: r["score"] for r in results[0]}
                top = max(results[0], key=lambda x: x["score"])
                return {
                    "emotion": top["label"],
                    "confidence": top["score"],
                    "all_scores": scores,
                }
        except Exception as e:
            logger.error(f"Text emotion detection failed: {e}")

        return {"emotion": "neutral", "confidence": 0.5, "all_scores": {}}


class FaceEmotionDetector:
    """Detect emotions from facial expressions using local models."""

    def __init__(self):
        self._detector = None

    def initialize(self):
        """Load face emotion detection model."""
        try:
            from fer import FER
            self._detector = FER(mtcnn=True)
            logger.info("Face emotion detector loaded")
            return True
        except Exception as e:
            logger.warning(f"Face emotion model not available: {e}")
            return False

    def detect_from_image(self, image_path: str) -> dict:
        """Detect emotion from a face image."""
        if not self._detector:
            return {"emotion": "neutral", "confidence": 0.5}

        try:
            import cv2
            img = cv2.imread(image_path)
            if img is None:
                return {"emotion": "neutral", "confidence": 0.5}

            results = self._detector.detect_emotions(img)
            if results:
                top_emotion = self._detector.top_emotion(img)
                emotions = results[0]["emotions"]
                return {
                    "emotion": top_emotion[0] if top_emotion else "neutral",
                    "confidence": top_emotion[1] if top_emotion else 0.5,
                    "all_scores": emotions,
                    "face_box": results[0].get("box", []),
                }
        except Exception as e:
            logger.error(f"Face emotion detection failed: {e}")

        return {"emotion": "neutral", "confidence": 0.5}

    def detect_from_frame(self, frame: np.ndarray) -> dict:
        """Detect emotion from a video frame (numpy array)."""
        if not self._detector:
            return {"emotion": "neutral", "confidence": 0.5}

        try:
            results = self._detector.detect_emotions(frame)
            if results:
                emotions = results[0]["emotions"]
                top = max(emotions, key=emotions.get)
                return {
                    "emotion": top,
                    "confidence": emotions[top],
                    "all_scores": emotions,
                }
        except Exception as e:
            logger.error(f"Frame emotion detection failed: {e}")

        return {"emotion": "neutral", "confidence": 0.5}


class VoiceEmotionDetector:
    """Detect emotions from voice audio using local models."""

    def __init__(self):
        self._model = None

    def initialize(self):
        """Load voice emotion model."""
        try:
            from transformers import pipeline

            self._model = pipeline(
                "audio-classification",
                model="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
                device=-1,  # CPU only
            )
            logger.info("Voice emotion detector loaded")
            return True
        except Exception as e:
            logger.warning(f"Voice emotion model not available: {e}")
            return False

    def detect(self, audio_path: str) -> dict:
        """Detect emotion from audio file."""
        if not self._model:
            return {"emotion": "neutral", "confidence": 0.5}

        try:
            results = self._model(audio_path)
            if results:
                top = results[0]
                return {
                    "emotion": top["label"],
                    "confidence": top["score"],
                    "all_scores": {r["label"]: r["score"] for r in results},
                }
        except Exception as e:
            logger.error(f"Voice emotion detection failed: {e}")

        return {"emotion": "neutral", "confidence": 0.5}


class EmotionEngine:
    """Unified emotion detection across all modalities."""

    def __init__(self):
        self.text_detector = TextEmotionDetector()
        self.face_detector = FaceEmotionDetector()
        self.voice_detector = VoiceEmotionDetector()

    def initialize(self, load_face: bool = True, load_voice: bool = True):
        """Initialize available emotion detectors."""
        self.text_detector.initialize()
        if load_face:
            self.face_detector.initialize()
        if load_voice:
            self.voice_detector.initialize()

    def detect_multimodal(
        self,
        text: Optional[str] = None,
        image_path: Optional[str] = None,
        audio_path: Optional[str] = None,
    ) -> dict:
        """Detect emotion using all available modalities and fuse results."""
        results = {}
        weights = {}

        if text:
            text_result = self.text_detector.detect(text)
            results["text"] = text_result
            weights["text"] = 0.4

        if image_path:
            face_result = self.face_detector.detect_from_image(image_path)
            results["face"] = face_result
            weights["face"] = 0.35

        if audio_path:
            voice_result = self.voice_detector.detect(audio_path)
            results["voice"] = voice_result
            weights["voice"] = 0.25

        # Fuse results
        if not results:
            return {"emotion": "neutral", "confidence": 0.5, "modalities": {}}

        # Simple weighted voting
        emotion_scores = {}
        total_weight = sum(weights.values())

        for modality, result in results.items():
            emotion = result.get("emotion", "neutral")
            confidence = result.get("confidence", 0.5)
            weight = weights.get(modality, 0.33)
            normalized_weight = weight / total_weight

            if emotion not in emotion_scores:
                emotion_scores[emotion] = 0
            emotion_scores[emotion] += confidence * normalized_weight

        top_emotion = max(emotion_scores, key=emotion_scores.get)

        return {
            "emotion": top_emotion,
            "confidence": emotion_scores[top_emotion],
            "all_emotions": emotion_scores,
            "modalities": results,
        }


# Singleton
emotion_engine = EmotionEngine()
