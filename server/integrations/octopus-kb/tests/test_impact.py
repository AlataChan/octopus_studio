from pathlib import Path

from octopus_kb_compound.impact import find_impacted_pages


def test_impacted_pages_includes_index_and_related_pages(tmp_path: Path):
    concept = tmp_path / "wiki" / "concepts" / "RAG.md"
    entity = tmp_path / "wiki" / "entities" / "Vector Store.md"
    index = tmp_path / "wiki" / "INDEX.md"
    log = tmp_path / "wiki" / "LOG.md"
    raw = tmp_path / "raw" / "source.md"
    for path in (concept, entity, index, log, raw):
        path.parent.mkdir(parents=True, exist_ok=True)

    concept.write_text(
        "---\n"
        "title: RAG\n"
        "type: concept\n"
        "role: concept\n"
        "layer: wiki\n"
        "summary: RAG\n"
        "related_entities:\n"
        "  - Vector Store\n"
        "---\n"
        "See [[Vector Store]].\n",
        encoding="utf-8",
    )
    entity.write_text("---\ntitle: Vector Store\ntype: entity\nrole: entity\nlayer: wiki\nsummary: Vector\n---\n", encoding="utf-8")
    index.write_text("---\ntitle: INDEX\nrole: index\nlayer: wiki\nsummary: Index\n---\n[[RAG]]\n", encoding="utf-8")
    log.write_text("---\ntitle: LOG\nrole: log\nlayer: wiki\nsummary: Log\n---\n", encoding="utf-8")
    raw.write_text("---\ntitle: Source\nrole: raw_source\nlayer: source\n---\nRAG source.\n", encoding="utf-8")

    impacted = find_impacted_pages(concept, tmp_path)

    assert impacted == [
        "wiki/concepts/RAG.md",
        "wiki/INDEX.md",
        "wiki/LOG.md",
        "wiki/entities/Vector Store.md",
    ]
