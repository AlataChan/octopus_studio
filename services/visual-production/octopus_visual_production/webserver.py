from __future__ import annotations

import json
import mimetypes
import os
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from . import service
from .config import get_budget, provider_has_key, select_model


WEB_DIR = Path(__file__).parent / "web"
RUNS_DIR = service.job_store.RUNS_DIR


class ClosingThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def shutdown(self) -> None:
        super().shutdown()
        self.server_close()


def safe_subpath(base: Path, *parts: str) -> Path | None:
    try:
        base_resolved = base.resolve()
        candidate = base_resolved
        for part in parts:
            if not part or part == "..":
                return None
            part_path = Path(part)
            if part_path.is_absolute() or ".." in part_path.parts:
                return None
            candidate = candidate / part_path
        resolved = candidate.resolve()
        if not resolved.is_relative_to(base_resolved):
            return None
        return resolved
    except (OSError, RuntimeError, ValueError):
        return None


def api_keys_from_headers(headers) -> dict[str, str]:
    mapping = {
        "X-Ark-Key": "ARK_API_KEY",
        "X-Dashscope-Key": "DASHSCOPE_API_KEY",
        "X-Agnes-Key": "AGNES_API_KEY",
    }
    keys: dict[str, str] = {}
    for header, env_key in mapping.items():
        value = headers.get(header)
        if value:
            keys[env_key] = value
    return keys


class Handler(BaseHTTPRequestHandler):
    config: dict[str, Any] = {}

    def log_message(self, format, *args):  # noqa: A002
        return

    def _send_json(self, status: int, obj: Any) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_error(self, status: int, msg: str) -> None:
        self._send_json(status, {"error": msg})

    def _serve_static(self, rel: str) -> None:
        path = safe_subpath(WEB_DIR, rel)
        if path is None or not path.is_file():
            self._send_error(404, "not found")
            return
        data = path.read_bytes()
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _require_json(self) -> bool:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("application/json"):
            self._send_error(415, "Content-Type must be application/json")
            return False
        return True

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/":
            self._serve_static("index.html")
            return
        if path in {"/app.js", "/styles.css"}:
            self._serve_static(path.lstrip("/"))
            return
        if path == "/api/config":
            self._send_json(200, api_config(self.config))
            return
        if path == "/api/jobs":
            self._send_json(200, service.list_jobs())
            return
        if path.startswith("/api/jobs/"):
            job_id = path[len("/api/jobs/"):]
            if safe_subpath(RUNS_DIR, job_id, "job.json") is None:
                self._send_error(404, "not found")
                return
            try:
                self._send_json(200, service.get_job(job_id))
            except (FileNotFoundError, KeyError):
                self._send_error(404, "not found")
            return
        if path.startswith("/api/results/"):
            rest = path[len("/api/results/"):]
            parts = rest.split("/", 1)
            if len(parts) != 2:
                self._send_error(404, "not found")
                return
            job_id, filename = parts
            result_path = safe_subpath(RUNS_DIR, job_id, "results", filename)
            if result_path is None or not result_path.is_file():
                self._send_error(404, "not found")
                return
            data = result_path.read_bytes()
            content_type = mimetypes.guess_type(str(result_path))[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._send_error(404, "not found")

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/estimate":
            if not self._require_json():
                return
            try:
                body = self._read_json()
                body.setdefault("prompt", "")
                api_keys = api_keys_from_headers(self.headers)
                request = generation_request_from_body(body)
                choice = select_model(
                    self.config,
                    body["task"],
                    body.get("provider") or None,
                    body.get("model_id") or None,
                    api_keys,
                    request,
                )
                estimate = service.estimate_cost(choice.model, request, get_budget(self.config))
                self._send_json(200, {"model_id": choice.model_id, **estimate})
            except (KeyError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
                self._send_error(400, str(exc))
            return
        if path == "/api/jobs":
            if not self._require_json():
                return
            try:
                body = self._read_json()
                api_keys = api_keys_from_headers(self.headers)
                request = generation_request_from_body(body)
                job = service.submit_job(
                    self.config,
                    body["task"],
                    request,
                    provider=body.get("provider"),
                    model_id=body.get("model_id"),
                    prefix=body.get("prefix") or "visual",
                    api_keys=api_keys,
                )
                thread = threading.Thread(
                    target=service.run_job_background,
                    args=(self.config, Path(job["job_path"])),
                    kwargs={"api_keys": api_keys},
                    daemon=True,
                )
                thread.start()
                self._send_json(200, {"job_id": Path(job["run_dir"]).name, "status": job.get("status")})
            except (KeyError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
                self._send_error(400, str(exc))
            return
        if path == "/api/stitch":
            if not self._require_json():
                return
            try:
                body = self._read_json()
                inputs = stitch_inputs_from_body(body)
                out_name = stitch_output_name(body.get("out_name") or "stitched.mp4")
                out_dir = service.job_store.make_run_dir("stitch")
                out_path = out_dir / "results" / out_name
                service.stitch_videos(inputs, out_path)
                self._send_json(
                    200,
                    {
                        "job_id": out_dir.name,
                        "file": f"{out_dir.name}/results/{out_name}",
                    },
                )
            except RuntimeError as exc:
                msg = str(exc)
                if "ffmpeg" in msg.lower():
                    msg = "ffmpeg not found; install ffmpeg to use stitching"
                self._send_error(400, msg)
            except (KeyError, ValueError, json.JSONDecodeError) as exc:
                self._send_error(400, str(exc))
            return
        if path == "/api/compose":
            if not self._require_json():
                return
            try:
                body = self._read_json()
                title = str(body.get("title") or "")
                if not title.strip():
                    raise ValueError("title is required")
                video = str(body.get("video"))
                src = safe_subpath(RUNS_DIR, *video.split("/"))
                if src is None or not src.is_file():
                    raise ValueError("Invalid video input")
                out_name = stitch_output_name(body.get("out_name") or "titled.mp4")
                out_dir = service.job_store.make_run_dir("title")
                out_path = out_dir / "results" / out_name
                service.add_title_card(
                    src,
                    out_path,
                    title,
                    subtitle=body.get("subtitle"),
                    duration=float(body.get("duration", 2.5)),
                    bg=body.get("bg", "blur"),
                )
                self._send_json(
                    200,
                    {
                        "job_id": out_dir.name,
                        "file": f"{out_dir.name}/results/{out_name}",
                    },
                )
            except (KeyError, RuntimeError, ValueError, json.JSONDecodeError) as exc:
                self._send_error(400, str(exc))
            return
        self._send_error(404, "not found")


def make_server(host: str, port: int, config: dict[str, Any]) -> ThreadingHTTPServer:
    class ConfiguredHandler(Handler):
        pass

    ConfiguredHandler.config = config
    return ClosingThreadingHTTPServer((host, port), ConfiguredHandler)


def api_config(config: dict[str, Any]) -> dict[str, Any]:
    env_keys = sorted({provider["env_key"] for provider in config.get("providers", {}).values()})
    return {
        "tasks": sorted(config.get("routes", {}).keys()),
        "providers": [
            {
                "id": provider_id,
                "display_name": provider.get("display_name", provider_id),
                "env_key": provider.get("env_key"),
                "has_key": provider_has_key(provider, None),
            }
            for provider_id, provider in config.get("providers", {}).items()
        ],
        "models": [
            {
                "id": model_id,
                "provider": model.get("provider"),
                "adapter": model.get("adapter"),
                "quality": model.get("quality"),
                "capabilities": model.get("capabilities", []),
                "pricing": model.get("pricing"),
            }
            for model_id, model in sorted(config.get("models", {}).items())
        ],
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "title_card": service.has_cjk_font() and service.has_pillow(),
        "budget": get_budget(config),
        "server_keys": {env_key: bool(os.environ.get(env_key)) for env_key in env_keys},
    }


def generation_request_from_body(body: dict[str, Any]) -> dict[str, Any]:
    request: dict[str, Any] = {
        "prompt": body["prompt"],
        "ratio": body.get("ratio", "16:9"),
        "image_urls": body.get("image_urls", []) or [],
        "video_urls": body.get("video_urls", []) or [],
        "audio_urls": body.get("audio_urls", []) or [],
        "watermark": body.get("watermark", False),
    }
    for key in ("duration", "size", "seed", "n", "frame_rate", "negative_prompt"):
        if key in body and body[key] is not None:
            request[key] = body[key]
    if body.get("generate_audio") is not None:
        request["generate_audio"] = body["generate_audio"]
    return request


def stitch_output_name(name: str) -> str:
    path = Path(name)
    if (
        not name
        or "/" in name
        or "\\" in name
        or ".." in name
        or path.is_absolute()
        or path.name != name
    ):
        raise ValueError("Invalid output name")
    if not path.suffix:
        name = f"{name}.mp4"
    return name


def stitch_inputs_from_body(body: dict[str, Any]) -> list[Path]:
    inputs = body.get("inputs")
    if not isinstance(inputs, list):
        raise ValueError("inputs must be a list")
    paths: list[Path] = []
    for item in inputs:
        if not isinstance(item, str):
            raise ValueError("inputs must contain paths")
        parts = item.split("/")
        path = safe_subpath(RUNS_DIR, *parts)
        if path is None or not path.is_file():
            raise ValueError("Invalid stitch input")
        paths.append(path)
    return paths
