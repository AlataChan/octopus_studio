from __future__ import annotations

import pytest


def test_safe_canonical_operations_round_trip_as_tagged_dicts():
    from octopus_kb_compound.ckr.models import CanonicalPage, CanonicalRef, SourceSpan, StorageRef
    from octopus_kb_compound.ckr.operations import (
        AddAliasOp,
        AppendLogOp,
        CreatePageOp,
        operation_from_dict,
    )

    page = CanonicalPage(
        ref=CanonicalRef(id="latechunking", kind="concept", title="Late Chunking"),
        title="Late Chunking",
        kind="concept",
        language="en",
        body="# Late Chunking\n",
        storage=StorageRef(adapter="obsidian", locator="wiki/concepts/Late Chunking.md"),
        metadata={"title": "Late Chunking", "type": "concept", "lang": "en", "role": "concept"},
    )
    span = SourceSpan(path="raw/late-chunking.md", start_line=1, end_line=4)

    operations = [
        CreatePageOp(page=page, rationale="new concept", confidence=0.91, source_span=span),
        AddAliasOp(
            target=StorageRef(adapter="obsidian", locator="wiki/concepts/Late Chunking.md"),
            alias="delayed chunking",
            rationale="source term",
            confidence=0.88,
            source_span=span,
        ),
        AppendLogOp(
            target=StorageRef(adapter="obsidian", locator="wiki/LOG.md"),
            entry="- Added Late Chunking.",
            rationale="audit note",
            confidence=1.0,
        ),
    ]

    for operation in operations:
        assert operation_from_dict(operation.to_dict()) == operation


def test_unknown_canonical_operation_is_rejected():
    from octopus_kb_compound.ckr.operations import operation_from_dict

    with pytest.raises(ValueError, match="unsupported canonical operation"):
        operation_from_dict({"op": "delete_page"})

