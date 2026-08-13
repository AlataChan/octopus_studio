from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from . import http_client
from .media import infer_extension, result_download_urls


@dataclass
class SubmitResult:
    provider: str
    task_id: str | None
    raw: dict[str, Any]
    status: str | None = None
    result_urls: list[str] | None = None


class Provider:
    def __init__(
        self,
        provider_id: str,
        provider_config: dict[str, Any],
        api_keys: dict[str, str] | None = None,
    ):
        self.provider_id = provider_id
        self.provider_config = provider_config
        self.api_keys = api_keys or {}

    def api_key(self) -> str:
        env_key = self.provider_config["env_key"]
        value = self.api_keys.get(env_key) or os.environ.get(env_key)
        if not value:
            raise RuntimeError(f"Missing required environment variable: {env_key}")
        return value

    def submit(self, model: dict[str, Any], request: dict[str, Any]) -> SubmitResult:
        raise NotImplementedError

    def poll(self, job: dict[str, Any]) -> SubmitResult:
        raise NotImplementedError

    def download_results(self, urls: list[str], output_dir: Path) -> list[Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        files: list[Path] = []
        for index, url in enumerate(urls, start=1):
            suffix = infer_extension(url)
            output = output_dir / f"result-{index:02d}{suffix}"
            http_client.download_url(url, output)
            files.append(output)
        return files


class VolcengineArkProvider(Provider):
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key()}",
            "Content-Type": "application/json",
        }

    def submit(self, model: dict[str, Any], request: dict[str, Any]) -> SubmitResult:
        payload = build_ark_payload(model, request)
        raw = http_client.request_json(
            "POST",
            self.provider_config["submit_url"],
            headers=self._headers(),
            body=payload,
        )
        task_id = raw.get("id") or raw.get("task_id")
        status = raw.get("status")
        return SubmitResult(self.provider_id, task_id, raw, status, result_download_urls(raw, request))

    def poll(self, job: dict[str, Any]) -> SubmitResult:
        task_id = job.get("task_id")
        if not task_id:
            raise RuntimeError("Job has no task_id")
        url = self.provider_config["poll_url"].format(task_id=task_id)
        raw = http_client.request_json("GET", url, headers=self._headers())
        status = raw.get("status")
        return SubmitResult(
            self.provider_id,
            task_id,
            raw,
            status,
            result_download_urls(raw, job.get("request") or {}),
        )


class AliyunDashScopeProvider(Provider):
    def base_url(self) -> str:
        env_name = self.provider_config.get("base_url_env")
        value = os.environ.get(env_name, "") if env_name else ""
        return (value or self.provider_config["default_base_url"]).rstrip("/")

    def _headers(self, async_task: bool) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key()}",
            "Content-Type": "application/json",
        }
        if async_task:
            headers["X-DashScope-Async"] = "enable"
        return headers

    def submit(self, model: dict[str, Any], request: dict[str, Any]) -> SubmitResult:
        adapter = model["adapter"]
        if adapter == "dashscope_image":
            payload = build_dashscope_image_payload(model, request)
            async_task = True
        elif adapter == "dashscope_video":
            payload = build_dashscope_video_payload(model, request)
            async_task = True
        else:
            raise RuntimeError(f"Unsupported DashScope adapter: {adapter}")

        endpoint = model.get("endpoint")
        if not endpoint:
            raise RuntimeError(f"Model {model['model']} missing endpoint")

        raw = http_client.request_json(
            "POST",
            f"{self.base_url()}{endpoint}",
            headers=self._headers(async_task=async_task),
            body=payload,
        )
        output = raw.get("output") or {}
        task_id = output.get("task_id") or raw.get("task_id")
        status = output.get("task_status") or raw.get("status")
        return SubmitResult(self.provider_id, task_id, raw, status, result_download_urls(raw, request))

    def poll(self, job: dict[str, Any]) -> SubmitResult:
        task_id = job.get("task_id")
        if not task_id:
            raise RuntimeError("Job has no task_id")
        raw = http_client.request_json(
            "GET",
            f"{self.base_url()}/tasks/{task_id}",
            headers=self._headers(async_task=False),
        )
        output = raw.get("output") or {}
        status = output.get("task_status") or raw.get("status")
        return SubmitResult(
            self.provider_id,
            task_id,
            raw,
            status,
            result_download_urls(raw, job.get("request") or {}),
        )


class AgnesProvider(Provider):
    def base_url(self) -> str:
        return self.provider_config["base_url"].rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key()}",
            "Content-Type": "application/json",
        }

    def submit(self, model: dict[str, Any], request: dict[str, Any]) -> SubmitResult:
        adapter = model["adapter"]
        if adapter == "agnes_video":
            payload = build_agnes_video_payload(model, request)
            raw = http_client.request_json(
                "POST",
                f"{self.base_url()}/v1/videos",
                headers=self._headers(),
                body=payload,
            )
            task_id = raw.get("video_id") or raw.get("task_id")
            status = raw.get("status")
            return SubmitResult(self.provider_id, task_id, raw, status, result_download_urls(raw, request))
        if adapter == "agnes_image":
            payload = build_agnes_image_payload(model, request)
            raw = http_client.request_json(
                "POST",
                f"{self.base_url()}/v1/images/generations",
                headers=self._headers(),
                body=payload,
            )
            data = raw.get("data") or []
            url = data[0].get("url") if data and isinstance(data[0], dict) else None
            return SubmitResult(self.provider_id, None, raw, "completed", [url] if url else [])
        raise RuntimeError(f"Unsupported Agnes adapter: {adapter}")

    def poll(self, job: dict[str, Any]) -> SubmitResult:
        adapter = (job.get("choice") or {}).get("adapter", "agnes_video")
        if adapter == "agnes_image":
            return SubmitResult(
                self.provider_id,
                job.get("task_id"),
                {},
                job.get("status"),
                job.get("result_urls") or [],
            )
        if adapter != "agnes_video":
            raise RuntimeError(f"Unsupported Agnes adapter: {adapter}")
        task_id = job.get("task_id")
        if not task_id:
            raise RuntimeError("Job has no task_id")
        model_name = (job.get("choice") or {}).get("model")
        query = urlencode({"video_id": task_id, "model_name": model_name})
        raw = http_client.request_json(
            "GET",
            f"{self.base_url()}/agnesapi?{query}",
            headers=self._headers(),
        )
        status = raw.get("status")
        preferred = [raw["remixed_from_video_id"]] if raw.get("remixed_from_video_id") else []
        urls = result_download_urls(raw, job.get("request") or {}, preferred=preferred)
        return SubmitResult(self.provider_id, task_id, raw, status, urls)


def agnes_ratio_to_wh(ratio: str) -> tuple[int, int]:
    sizes = {
        "16:9": (1152, 768),
        "9:16": (768, 1152),
        "1:1": (1024, 1024),
        "4:3": (1024, 768),
        "3:4": (768, 1024),
    }
    return sizes.get(ratio, (1152, 768))


def agnes_num_frames(duration_s: float, frame_rate: int) -> int:
    frames = round(float(duration_s) * int(frame_rate))
    if frames < 9:
        return 9
    remainder = (frames - 1) % 8
    if remainder:
        frames += 8 - remainder
    return min(frames, 441)


def build_agnes_video_payload(model: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    frame_rate = int(request.get("frame_rate", 24))
    width, height = agnes_ratio_to_wh(request.get("ratio", "16:9"))
    payload: dict[str, Any] = {
        "model": model["model"],
        "prompt": request["prompt"],
        "width": width,
        "height": height,
        "num_frames": agnes_num_frames(request.get("duration", 5), frame_rate),
        "frame_rate": frame_rate,
    }
    if request.get("seed") is not None:
        payload["seed"] = request["seed"]
    if request.get("negative_prompt"):
        payload["negative_prompt"] = request["negative_prompt"]

    image_urls = request.get("image_urls", []) or []
    extra_body: dict[str, Any] = {}
    if len(image_urls) == 1:
        payload["image"] = image_urls[0]
    elif len(image_urls) > 1:
        extra_body["image"] = image_urls
    if request.get("keyframe_mode") or request.get("mode") == "keyframes":
        extra_body["mode"] = "keyframes"
    if extra_body:
        payload["extra_body"] = extra_body
    return payload


def agnes_normalize_size(size: str | None, ratio: str | None) -> str:
    if size:
        return size.replace("*", "x")
    if ratio:
        width, height = agnes_ratio_to_wh(ratio)
        return f"{width}x{height}"
    return "1024x768"


def build_agnes_image_payload(model: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    extra_body: dict[str, Any] = {"response_format": "url"}
    image_urls = request.get("image_urls", []) or []
    if image_urls:
        extra_body["image"] = image_urls
    return {
        "model": model["model"],
        "prompt": request["prompt"],
        "size": agnes_normalize_size(request.get("size"), request.get("ratio")),
        "extra_body": extra_body,
    }


def build_ark_payload(model: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    content: list[dict[str, Any]] = [{"type": "text", "text": request["prompt"]}]
    for url in request.get("image_urls", []):
        content.append({"type": "image_url", "image_url": {"url": url}, "role": "reference_image"})
    for url in request.get("video_urls", []):
        content.append({"type": "video_url", "video_url": {"url": url}, "role": "reference_video"})
    for url in request.get("audio_urls", []):
        content.append({"type": "audio_url", "audio_url": {"url": url}, "role": "reference_audio"})

    payload: dict[str, Any] = {
        "model": model["model"],
        "content": content,
        "watermark": request.get("watermark", False),
    }
    if "ratio" in request:
        payload["ratio"] = request["ratio"]
    if "duration" in request:
        payload["duration"] = request["duration"]
    if "generate_audio" in request:
        payload["generate_audio"] = request["generate_audio"]
    return payload


def build_dashscope_image_payload(model: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    input_payload: dict[str, Any] = {"prompt": request["prompt"]}
    image_urls = request.get("image_urls", [])
    if image_urls:
        input_payload["image_url"] = image_urls[0]

    parameters: dict[str, Any] = {}
    if size := request.get("size"):
        parameters["size"] = size
    if n := request.get("n"):
        parameters["n"] = n
    if seed := request.get("seed"):
        parameters["seed"] = seed

    payload: dict[str, Any] = {"model": model["model"], "input": input_payload}
    if parameters:
        payload["parameters"] = parameters
    return payload


def build_dashscope_video_payload(model: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    input_payload: dict[str, Any] = {"prompt": request["prompt"]}
    image_urls = request.get("image_urls", [])
    video_urls = request.get("video_urls", [])
    if image_urls:
        input_payload["img_url"] = image_urls[0]
    if video_urls:
        input_payload["video_url"] = video_urls[0]

    parameters: dict[str, Any] = {}
    if ratio := request.get("ratio"):
        parameters["ratio"] = ratio
    if duration := request.get("duration"):
        parameters["duration"] = duration
    if size := request.get("size"):
        parameters["size"] = size
    if seed := request.get("seed"):
        parameters["seed"] = seed

    payload: dict[str, Any] = {"model": model["model"], "input": input_payload}
    if parameters:
        payload["parameters"] = parameters
    return payload


def provider_for(
    provider_id: str,
    provider_config: dict[str, Any],
    api_keys: dict[str, str] | None = None,
) -> Provider:
    if provider_id == "volcengine_ark":
        return VolcengineArkProvider(provider_id, provider_config, api_keys)
    if provider_id == "aliyun_dashscope":
        return AliyunDashScopeProvider(provider_id, provider_config, api_keys)
    if provider_id == "agnes":
        return AgnesProvider(provider_id, provider_config, api_keys)
    raise ValueError(f"Unknown provider: {provider_id}")
