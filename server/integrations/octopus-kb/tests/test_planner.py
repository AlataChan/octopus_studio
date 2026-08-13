from pathlib import Path

from octopus_kb_compound.planner import plan_maintenance


def test_plan_maintenance_for_new_raw_source_returns_follow_up_actions(tmp_path: Path):
    raw = tmp_path / "raw" / "source.md"
    index = tmp_path / "wiki" / "INDEX.md"
    log = tmp_path / "wiki" / "LOG.md"
    concept = tmp_path / "wiki" / "concepts" / "RAG.md"
    for path in (raw, index, log, concept):
        path.parent.mkdir(parents=True, exist_ok=True)

    raw.write_text("---\ntitle: Source\nrole: raw_source\nlayer: source\n---\nRAG evidence.\n", encoding="utf-8")
    index.write_text("---\ntitle: INDEX\nrole: index\nlayer: wiki\nsummary: Index\n---\n[[RAG]]\n", encoding="utf-8")
    log.write_text("---\ntitle: LOG\nrole: log\nlayer: wiki\nsummary: Log\n---\n", encoding="utf-8")
    concept.write_text("---\ntitle: RAG\nrole: concept\nlayer: wiki\nsummary: RAG\n---\n", encoding="utf-8")

    plan = plan_maintenance(raw, tmp_path)

    assert "raw/source.md" in plan.changed_pages
    assert "wiki/INDEX.md" in plan.changed_pages
    assert "wiki/LOG.md" in plan.changed_pages
    assert "update" in plan.suggested_actions
    assert "review_aliases" in plan.suggested_actions
