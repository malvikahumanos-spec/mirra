"""
Mirra - Vector Database (ChromaDB)
Local semantic memory for Mirra.
Stores embeddings of conversations, memories, personality traits.
"""

from typing import Optional
from pathlib import Path

from loguru import logger

from backend.config import settings


class VectorStore:
    """
    Local vector database using ChromaDB.
    Stores semantic embeddings for memory retrieval.
    """

    def __init__(self):
        self._client = None
        self._collections: dict = {}

    def initialize(self):
        """Initialize ChromaDB with local persistent storage."""
        try:
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            db_path = str(settings.get_abs_path(settings.database.VECTOR_DB_PATH))
            Path(db_path).mkdir(parents=True, exist_ok=True)

            self._client = chromadb.PersistentClient(
                path=db_path,
                settings=ChromaSettings(
                    anonymized_telemetry=False,  # No telemetry - privacy first
                    allow_reset=False,
                ),
            )

            # Create collections for different memory types
            self._collections["memories"] = self._client.get_or_create_collection(
                name="memories",
                metadata={"description": "Long-term memories and experiences"},
            )
            self._collections["conversations"] = self._client.get_or_create_collection(
                name="conversations",
                metadata={"description": "Conversation history for context"},
            )
            self._collections["personality"] = self._client.get_or_create_collection(
                name="personality",
                metadata={"description": "Personality patterns and behavioral data"},
            )
            self._collections["decisions"] = self._client.get_or_create_collection(
                name="decisions",
                metadata={"description": "Decision patterns and reasoning"},
            )
            self._collections["notes"] = self._client.get_or_create_collection(
                name="notes",
                metadata={"description": "User notes and knowledge"},
            )

            logger.info(f"Vector store initialized at {db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize vector store: {e}")
            return False

    def add_memory(
        self,
        collection_name: str,
        text: str,
        metadata: dict,
        doc_id: str,
    ):
        """Add a memory/document to the vector store."""
        if collection_name not in self._collections:
            logger.error(f"Unknown collection: {collection_name}")
            return

        try:
            self._collections[collection_name].add(
                documents=[text],
                metadatas=[metadata],
                ids=[doc_id],
            )
            logger.debug(f"Added to {collection_name}: {doc_id}")
        except Exception as e:
            # If ID already exists, update instead
            try:
                self._collections[collection_name].update(
                    documents=[text],
                    metadatas=[metadata],
                    ids=[doc_id],
                )
            except Exception as e2:
                logger.error(f"Failed to add/update in {collection_name}: {e2}")

    def search(
        self,
        collection_name: str,
        query: str,
        n_results: int = 5,
        where: Optional[dict] = None,
    ) -> list[dict]:
        """Search for similar memories/documents."""
        if collection_name not in self._collections:
            return []

        try:
            # Clamp n_results to collection size to avoid ChromaDB error
            collection_count = self._collections[collection_name].count()
            if collection_count == 0:
                return []
            effective_n = min(n_results, 20, collection_count)

            kwargs = {
                "query_texts": [query],
                "n_results": effective_n,
            }
            if where:
                kwargs["where"] = where

            results = self._collections[collection_name].query(**kwargs)

            memories = []
            if results and results["documents"]:
                for i, doc in enumerate(results["documents"][0]):
                    memory = {
                        "content": doc,
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                        "id": results["ids"][0][i] if results["ids"] else "",
                        "distance": results["distances"][0][i] if results["distances"] else 0,
                    }
                    memories.append(memory)

            return memories
        except Exception as e:
            logger.error(f"Search failed in {collection_name}: {e}")
            return []

    def list_all(self, collection_name: str, limit: int = 50) -> list[dict]:
        """List all documents in a collection (no query needed)."""
        if collection_name not in self._collections:
            return []

        try:
            collection = self._collections[collection_name]
            count = collection.count()
            if count == 0:
                return []

            results = collection.get(
                limit=min(limit, count),
                include=["documents", "metadatas"],
            )

            memories = []
            if results and results["documents"]:
                for i, doc in enumerate(results["documents"]):
                    memories.append({
                        "content": doc,
                        "metadata": results["metadatas"][i] if results["metadatas"] else {},
                        "id": results["ids"][i] if results["ids"] else "",
                    })
            return memories
        except Exception as e:
            logger.error(f"List all failed in {collection_name}: {e}")
            return []

    def delete_memory(self, collection_name: str, doc_id: str):
        """Delete a specific memory."""
        if collection_name in self._collections:
            try:
                self._collections[collection_name].delete(ids=[doc_id])
                logger.debug(f"Deleted from {collection_name}: {doc_id}")
            except Exception as e:
                logger.error(f"Delete failed: {e}")

    def get_collection_count(self, collection_name: str) -> int:
        """Get the number of items in a collection."""
        if collection_name in self._collections:
            return self._collections[collection_name].count()
        return 0

    def get_stats(self) -> dict:
        """Get vector store statistics."""
        stats = {}
        for name, collection in self._collections.items():
            stats[name] = collection.count()
        return stats


# Singleton
vector_store = VectorStore()
