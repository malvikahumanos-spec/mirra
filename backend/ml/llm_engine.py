"""
Mirra - LLM Engine
Supports Groq API (cloud, fast) with Ollama fallback (local).
Set GROQ_API_KEY in .env to use Groq. Otherwise falls back to Ollama.
"""

import json
from typing import AsyncGenerator, Optional
from datetime import datetime, timezone

import httpx
from loguru import logger

from backend.config import settings


class LLMEngine:
    """
    LLM engine supporting Groq (cloud) and Ollama (local) backends.
    Groq is used when GROQ_API_KEY is configured; otherwise falls back to Ollama.
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._available = False
        self._backend = "none"  # "groq" | "ollama" | "none"

    async def initialize(self):
        """Connect to Groq if API key is set, otherwise try Ollama."""
        if settings.ai.GROQ_API_KEY:
            await self._init_groq()
        else:
            await self._init_ollama()

    async def _init_groq(self):
        """Initialize Groq API client."""
        self._client = httpx.AsyncClient(
            base_url=settings.ai.GROQ_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.ai.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        try:
            # Quick test call to verify key works
            response = await self._client.get("/models")
            if response.status_code == 200:
                self._available = True
                self._backend = "groq"
                logger.info(f"LLM engine ready: Groq ({settings.ai.GROQ_MODEL})")
            else:
                logger.warning(f"Groq API returned {response.status_code}. Check your API key.")
                await self._init_ollama()
        except Exception as e:
            logger.warning(f"Cannot connect to Groq: {e}. Trying Ollama fallback.")
            await self._init_ollama()

    async def _init_ollama(self):
        """Initialize Ollama local client as fallback."""
        if self._client:
            await self._client.aclose()
        self._client = httpx.AsyncClient(
            base_url=settings.ai.OLLAMA_BASE_URL,
            timeout=httpx.Timeout(120.0, connect=10.0),
        )
        try:
            response = await self._client.get("/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m["name"] for m in models]
                if any(settings.ai.OLLAMA_MODEL in name for name in model_names):
                    self._available = True
                    self._backend = "ollama"
                    logger.info(f"LLM engine ready: Ollama ({settings.ai.OLLAMA_MODEL})")
                else:
                    logger.warning(
                        f"Ollama model {settings.ai.OLLAMA_MODEL} not found. "
                        f"Available: {model_names}. Run: ollama pull {settings.ai.OLLAMA_MODEL}"
                    )
            else:
                logger.warning("Ollama is not responding.")
        except Exception as e:
            logger.warning(f"Cannot connect to Ollama: {e}. Add GROQ_API_KEY to .env for cloud AI.")

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        context_messages: Optional[list[dict]] = None,
    ) -> str:
        """Generate a response from the LLM."""
        if not self._available:
            return (
                "[AI not available. Add GROQ_API_KEY=your_key to .env file, "
                "or start Ollama locally.]"
            )

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if context_messages:
            messages.extend(context_messages)
        messages.append({"role": "user", "content": prompt})

        if self._backend == "groq":
            return await self._groq_generate(messages, temperature, max_tokens)
        else:
            return await self._ollama_generate(messages, temperature, max_tokens)

    async def _groq_generate(self, messages: list, temperature: float, max_tokens: int) -> str:
        """Call Groq chat completions API."""
        try:
            response = await self._client.post(
                "/chat/completions",
                json={
                    "model": settings.ai.GROQ_MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": False,
                },
            )
            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]
            else:
                logger.error(f"Groq error: {response.status_code} - {response.text}")
                return "[Error generating response from Groq]"
        except Exception as e:
            logger.error(f"Groq generation failed: {e}")
            return "[Error: Could not reach Groq API]"

    async def _ollama_generate(self, messages: list, temperature: float, max_tokens: int) -> str:
        """Call Ollama local API."""
        try:
            response = await self._client.post(
                "/api/chat",
                json={
                    "model": settings.ai.OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
            )
            if response.status_code == 200:
                return response.json()["message"]["content"]
            else:
                logger.error(f"Ollama error: {response.status_code} - {response.text}")
                return "[Error generating response]"
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            return "[Error: Could not reach local LLM]"

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        context_messages: Optional[list[dict]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream responses from the LLM."""
        if not self._available:
            yield "[AI not available. Add GROQ_API_KEY to .env or start Ollama.]"
            return

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if context_messages:
            messages.extend(context_messages)
        messages.append({"role": "user", "content": prompt})

        if self._backend == "groq":
            async for chunk in self._groq_stream(messages, temperature, max_tokens):
                yield chunk
        else:
            async for chunk in self._ollama_stream(messages, temperature, max_tokens):
                yield chunk

    async def _groq_stream(
        self, messages: list, temperature: float, max_tokens: int
    ) -> AsyncGenerator[str, None]:
        """Stream from Groq API (SSE format)."""
        try:
            async with self._client.stream(
                "POST",
                "/chat/completions",
                json={
                    "model": settings.ai.GROQ_MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            logger.error(f"Groq streaming failed: {e}")
            yield "[Error streaming response]"

    async def _ollama_stream(
        self, messages: list, temperature: float, max_tokens: int
    ) -> AsyncGenerator[str, None]:
        """Stream from Ollama local API."""
        try:
            async with self._client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": settings.ai.OLLAMA_MODEL,
                    "messages": messages,
                    "stream": True,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                        if data.get("done", False):
                            break
        except Exception as e:
            logger.error(f"Ollama streaming failed: {e}")
            yield "[Error streaming response]"

    async def get_embedding(self, text: str) -> Optional[list[float]]:
        """
        Get text embedding.
        Note: ChromaDB handles its own embeddings via sentence-transformers.
        This method is only used for explicit embedding needs.
        Falls back to Ollama (Groq has no embedding API).
        """
        if self._backend == "ollama" and self._available:
            try:
                response = await self._client.post(
                    "/api/embed",
                    json={
                        "model": settings.ai.OLLAMA_EMBEDDING_MODEL,
                        "input": text,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    embeddings = data.get("embeddings")
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0]
                    return data.get("embedding")
            except Exception as e:
                logger.error(f"Ollama embedding failed: {e}")
        # Groq mode: use sentence-transformers directly
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer(settings.ai.EMBEDDING_MODEL)
            embedding = model.encode(text)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Sentence transformer embedding failed: {e}")
        return None

    async def analyze_sentiment(self, text: str) -> dict:
        """Analyze sentiment/emotion of text."""
        prompt = (
            "Analyze the emotion and sentiment of this text. "
            "Respond ONLY with a JSON object: "
            '{"emotion": "one of: happy/sad/angry/neutral/excited/loving/thoughtful", '
            '"sentiment": "positive/negative/neutral", '
            '"confidence": 0.0-1.0}\n\n'
            f"Text: {text}"
        )
        response = await self.generate(prompt, temperature=0.1, max_tokens=100)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(response[start:end])
        except json.JSONDecodeError:
            pass
        return {"emotion": "neutral", "sentiment": "neutral", "confidence": 0.5}

    async def summarize(self, text: str, max_length: int = 200) -> str:
        """Summarize text."""
        prompt = (
            f"Summarize the following in {max_length} characters or less. "
            f"Be concise and capture the key points:\n\n{text}"
        )
        return await self.generate(prompt, temperature=0.3, max_tokens=max_length)

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def current_model(self) -> str:
        if self._backend == "groq":
            return f"Groq/{settings.ai.GROQ_MODEL}"
        elif self._backend == "ollama":
            return f"Ollama/{settings.ai.OLLAMA_MODEL}"
        return "unavailable"

    async def close(self):
        if self._client:
            await self._client.aclose()


# Singleton
llm_engine = LLMEngine()
