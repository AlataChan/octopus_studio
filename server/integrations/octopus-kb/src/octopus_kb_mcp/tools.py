from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from octopus_kb_compound.apply import validate_proposal_file
from octopus_kb_compound.export import _edges, _nodes
from octopus_kb_compound.frontmatter import parse_document, render_frontmatter
from octopus_kb_compound.ingest import generate_raw_page
from octopus_kb_compound.links import build_alias_index
from octopus_kb_compound.models import PageMeta
from octopus_kb_compound.lookup import lookup_term
from octopus_kb_compound.neighbors import compute_neighbors
from octopus_kb_compound.profile import load_vault_profile
from octopus_kb_compound.propose import propose_from_raw
from octopus_kb_compound.retrieve import build_retrieval_bundle
from octopus_kb_compound.schema import validate_frontmatter
from octopus_kb_compound.vault import scan_markdown_files


DEFAULT_MAX_TEXT_CHARS = 4000


def export_graph(vault: str | Path) -> dict[str, Any]:
    root = Path(vault)
    pages = scan_markdown_files(root, load_vault_profile(root))
    aliases = build_alias_index(pages)
    nodes = _nodes(pages)
    node_ids = {node["id"] for node in nodes}
    return {
        "nodes": nodes,
        "edges": _edges(pages, aliases, node_ids),
    }


def retrieve_bundle(
    vault: str | Path,
    query: str,
    *,
    max_tokens: int = 1500,
    max_text_chars: int = DEFAULT_MAX_TEXT_CHARS,
) -> dict[str, Any]:
    root = Path(vault)
    bundle = build_retrieval_bundle(root, query, max_tokens=max_tokens).to_dict()
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for rel_path in _ordered_paths(bundle) + _fallback_body_match_paths(root, query):
        if rel_path in seen:
            continue
        seen.add(rel_path)
        page = _read_page_payload(root, rel_path, max_text_chars)
        source_item = _bundle_item_for_path(bundle, rel_path)
        items.append(
            {
                "path": rel_path,
                "title": (source_item or {}).get("title") or Path(rel_path).stem,
                "reason": (source_item or {}).get("reason") or "body_match",
                "text": page["text"],
                "kind": page["frontmatter"].get("kind"),
                "created": page["frontmatter"].get("created"),
                "tokenEstimate": _estimate_tokens(page["text"]),
            }
        )

    return {
        "query": bundle.get("query") or query,
        "items": items,
        "warnings": bundle.get("warnings") or [],
        "tokenEstimate": sum(item["tokenEstimate"] for item in items),
        "next": bundle.get("next") or [],
    }


def ingest(
    vault: str | Path,
    markdown: str,
    title: str | None = None,
    tags: list[str] | None = None,
    lang: str = "zh",
) -> dict[str, Any]:
    root = Path(vault)
    written = generate_raw_page(
        markdown,
        {"title": title or "source", "ingest_method": "alata"},
        root / "raw",
        lang=lang,
        tags=tags or [],
    )
    return {"path": written.relative_to(root).as_posix()}


def write_page(vault: str | Path, page: dict[str, Any]) -> dict[str, Any]:
    root = Path(vault).resolve()
    rel_path = str(page.get("path") or "").strip()
    if not rel_path:
        raise ValueError("page.path is required")
    rel = Path(rel_path)
    if rel.is_absolute():
        raise ValueError("page.path must be relative to the vault")

    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise ValueError("page.path must stay inside the vault")

    frontmatter = dict(page.get("frontmatter") or {})
    frontmatter["title"] = str(
        frontmatter.get("title") or page.get("title") or rel.stem
    )
    frontmatter["type"] = str(
        page.get("type") or frontmatter.get("type") or "note"
    )
    frontmatter["role"] = str(
        page.get("role") or frontmatter.get("role") or frontmatter["type"]
    )
    frontmatter["lang"] = str(page.get("lang") or frontmatter.get("lang") or "zh")
    if page.get("layer") or frontmatter.get("layer"):
        frontmatter["layer"] = str(page.get("layer") or frontmatter.get("layer"))
    if "tags" not in frontmatter:
        tags = page.get("tags") if isinstance(page.get("tags"), list) else []
        frontmatter["tags"] = tags

    findings = validate_frontmatter(frontmatter)
    if findings:
        message = "; ".join(f"{item.field}: {item.message}" for item in findings)
        raise ValueError(message)

    meta = _page_meta_from_frontmatter(frontmatter)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = str(page.get("body") or "")
    target.write_text(f"{render_frontmatter(meta)}\n{body}", encoding="utf-8")
    return {"path": target.relative_to(root).as_posix()}


def neighbors(vault: str | Path, page: str) -> dict[str, Any]:
    return compute_neighbors(page, Path(vault)).to_dict()


def lookup(vault: str | Path, term: str) -> dict[str, Any]:
    return lookup_term(term, Path(vault)).to_dict()


def propose(
    vault: str | Path,
    raw_path: str,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with _transient_llm_profile(profile) as profile_name:
        return propose_from_raw(
            Path(vault) / raw_path,
            Path(vault),
            profile_name=profile_name,
        ).to_dict()


def validate(
    vault: str | Path,
    proposal_path: str,
    *,
    apply: bool = False,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with _transient_llm_profile(profile):
        return validate_proposal_file(
            Path(vault) / proposal_path,
            Path(vault),
            apply=apply,
        ).to_dict()


@contextmanager
def _transient_llm_profile(profile: dict[str, Any] | None = None):
    resolved = _resolve_llm_profile(profile)
    if not resolved:
        yield None
        return

    fd, temp_path = tempfile.mkstemp(prefix="alata-octopus-kb-", suffix=".toml")
    path = Path(temp_path)
    previous_config = os.environ.get("OCTOPUS_KB_CONFIG")
    previous_api_key = os.environ.get("KB_LLM_API_KEY")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(_profile_config_toml(resolved))
        if resolved.get("api_key"):
            os.environ["KB_LLM_API_KEY"] = str(resolved["api_key"])
        os.environ["OCTOPUS_KB_CONFIG"] = path.as_posix()
        yield "alata"
    finally:
        if previous_config is None:
            os.environ.pop("OCTOPUS_KB_CONFIG", None)
        else:
            os.environ["OCTOPUS_KB_CONFIG"] = previous_config
        if previous_api_key is None:
            os.environ.pop("KB_LLM_API_KEY", None)
        else:
            os.environ["KB_LLM_API_KEY"] = previous_api_key
        path.unlink(missing_ok=True)


def _resolve_llm_profile(profile: dict[str, Any] | None = None) -> dict[str, Any] | None:
    profile = profile or {}
    base_url = (
        profile.get("baseURL")
        or profile.get("baseUrl")
        or profile.get("base_url")
        or os.environ.get("KB_LLM_BASE_URL")
    )
    model = profile.get("model") or os.environ.get("KB_LLM_MODEL")
    if not base_url or not model:
        return None

    api_key = (
        profile.get("apiKey")
        or profile.get("api_key")
        or os.environ.get("KB_LLM_API_KEY")
    )
    return {
        "base_url": str(base_url),
        "model": str(model),
        "api_key": str(api_key) if api_key else None,
    }


def _profile_config_toml(profile: dict[str, Any]) -> str:
    return "\n".join(
        [
            "version = 1",
            "",
            "[llm]",
            'default_profile = "alata"',
            "",
            "[llm.profiles.alata]",
            f"base_url = {_toml_string(profile['base_url'])}",
            f"model = {_toml_string(profile['model'])}",
            'api_key_env = "KB_LLM_API_KEY"',
            "",
        ]
    )


def _toml_string(value: str) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def _ordered_paths(bundle: dict[str, Any]) -> list[str]:
    payload = bundle.get("bundle") or {}
    paths: list[str] = []
    paths.extend(payload.get("schema") or [])
    paths.extend(payload.get("index") or [])
    for key in ("concepts", "entities", "raw_sources"):
        for item in payload.get(key) or []:
            if isinstance(item, dict) and item.get("path"):
                paths.append(item["path"])
            elif isinstance(item, str):
                paths.append(item)
    return paths


def _bundle_item_for_path(bundle: dict[str, Any], rel_path: str) -> dict[str, Any] | None:
    payload = bundle.get("bundle") or {}
    for key in ("concepts", "entities", "raw_sources"):
        for item in payload.get(key) or []:
            if isinstance(item, dict) and item.get("path") == rel_path:
                return item
    return None


def _fallback_body_match_paths(root: Path, query: str) -> list[str]:
    tokens = _query_tokens(query)
    if not tokens:
        return []
    paths: set[str] = set()
    for page in scan_markdown_files(root, load_vault_profile(root)):
        haystack = f"{page.title}\n{page.body}".casefold()
        if any(token in haystack for token in tokens):
            paths.add(page.path)
    return sorted(paths)


def _query_tokens(query: str) -> list[str]:
    return [
        token
        for token in (part.casefold().strip() for part in str(query or "").split())
        if len(token) >= 3
    ]


def _read_page_payload(root: Path, rel_path: str, cap: int) -> dict[str, Any]:
    try:
        raw = (root / rel_path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {"frontmatter": {}, "text": ""}

    frontmatter, body = parse_document(raw)
    text = (body if frontmatter else raw)[:cap]
    return {"frontmatter": frontmatter, "text": text}


def _page_meta_from_frontmatter(frontmatter: dict[str, Any]) -> PageMeta:
    return PageMeta(
        title=str(frontmatter["title"]),
        page_type=str(frontmatter["type"]),
        lang=str(frontmatter["lang"]),
        tags=_string_list(frontmatter.get("tags")),
        role=_optional_string(frontmatter.get("role")),
        layer=_optional_string(frontmatter.get("layer")),
        workflow=_optional_string_list(frontmatter.get("workflow")),
        summary=_optional_string(frontmatter.get("summary")),
        publisher=_optional_string(frontmatter.get("publisher")),
        published=_optional_string(frontmatter.get("published")),
        authors=_optional_string_list(frontmatter.get("authors")),
        aliases=_optional_string_list(frontmatter.get("aliases")),
        source_url=_optional_string(frontmatter.get("source_url")),
        source_file=_optional_string(frontmatter.get("source_file")),
        original_format=_optional_string(frontmatter.get("original_format")),
        ingest_method=_optional_string(frontmatter.get("ingest_method")),
        fetched_at=_optional_string(frontmatter.get("fetched_at")),
        converted_at=_optional_string(frontmatter.get("converted_at")),
        canonical_name=_optional_string(frontmatter.get("canonical_name")),
        status=_optional_string(frontmatter.get("status")),
        source_of_truth=_optional_string(frontmatter.get("source_of_truth")),
        kind=_optional_string(frontmatter.get("kind")),
        created=_optional_string(frontmatter.get("created")),
        supersedes=_optional_string(frontmatter.get("supersedes")),
        refines=_optional_string(frontmatter.get("refines")),
        related_entities=_string_list(frontmatter.get("related_entities")),
        changelog=_string_list(frontmatter.get("changelog")),
    )


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value is None or value == "":
        return []
    return [str(value)]


def _optional_string_list(value: Any) -> list[str] | None:
    items = _string_list(value)
    return items or None


def _optional_string(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value)


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)
