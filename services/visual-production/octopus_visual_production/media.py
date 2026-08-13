from __future__ import annotations

import mimetypes
import re
from pathlib import Path
from typing import Any


MEDIA_URL_RE = re.compile(
    r"https?://[^\s\"'<>]+?\.(?:mp4|mov|webm|m4v|png|jpg|jpeg|webp|gif|mp3|wav|m4a)(?:\?[^\s\"'<>]+)?",
    re.IGNORECASE,
)


def infer_extension(url: str, default: str = ".bin") -> str:
    clean = url.split("?", 1)[0]
    suffix = Path(clean).suffix
    if suffix:
        return suffix
    return default


def guess_media_kind(url: str) -> str:
    content_type, _ = mimetypes.guess_type(url.split("?", 1)[0])
    if content_type:
        return content_type.split("/", 1)[0]
    suffix = infer_extension(url).lower()
    if suffix in {".mp4", ".mov", ".webm", ".m4v"}:
        return "video"
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"
    if suffix in {".mp3", ".wav", ".m4a", ".aac"}:
        return "audio"
    return "file"


def extract_urls(obj: Any) -> list[str]:
    urls: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, str):
            if value.startswith("http://") or value.startswith("https://"):
                urls.append(value)
            for match in MEDIA_URL_RE.findall(value):
                urls.append(match)

    walk(obj)
    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if url not in seen:
            deduped.append(url)
            seen.add(url)
    return deduped



def result_download_urls(
    raw: Any,
    request: dict[str, Any] | None,
    preferred: list[str] | None = None,
) -> list[str]:
    request = request or {}
    echoed = set()
    for key in ("image_urls", "video_urls", "audio_urls"):
        echoed.update(request.get(key, []) or [])

    urls: list[str] = []
    if preferred:
        urls.extend(url for url in preferred if isinstance(url, str))
    urls.extend(extract_urls(raw))

    result: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        if url in echoed or url in seen:
            continue
        result.append(url)
        seen.add(url)
    return result
