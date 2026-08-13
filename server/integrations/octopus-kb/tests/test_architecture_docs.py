from __future__ import annotations

from pathlib import Path


def test_architecture_documents_ckr_and_knowledge_store_contract():
    docs = (Path(__file__).resolve().parents[1] / "docs" / "architecture.md").read_text(encoding="utf-8")

    assert "Canonical Knowledge Representation" in docs
    assert "KnowledgeStore" in docs
    assert "StorageRef" in docs
    assert "CanonicalRef" in docs

