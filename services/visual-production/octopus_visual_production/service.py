from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from . import job_store
from .config import get_budget, select_model
from .providers import provider_for


CJK_FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]

DONE_STATUSES = {
    "succeeded",
    "success",
    "completed",
    "SUCCEEDED",
    "SUCCESS",
    "COMPLETED",
}

FAILED_STATUSES = {
    "failed",
    "cancelled",
    "canceled",
    "FAILED",
    "CANCELLED",
    "CANCELED",
}

SECRET_KEYS = {"ark_api_key", "dashscope_api_key", "agnes_api_key", "authorization", "api_key"}
BEARER_RE = re.compile(r"Bearer\s+\S+")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-]{40,}$")


def estimate_cost(model: dict[str, Any], request: dict[str, Any], budget: dict[str, Any]) -> dict[str, Any]:
    pricing = model.get("pricing") or {}
    price = pricing.get("price")
    if price is None:
        return {
            "cny": None,
            "native": None,
            "currency": None,
            "unit": None,
            "quantity": 0,
            "price": None,
        }

    unit = pricing.get("unit")
    currency = pricing.get("currency")
    if unit == "second":
        quantity = float(request.get("duration", 5))
    elif unit == "image":
        quantity = float(request.get("n", 1))
    else:
        quantity = 1.0
    price_value = float(price)
    native = price_value * quantity
    rate = float(budget.get("usd_cny_rate", 7.2))
    cny = native * rate if currency == "USD" else native
    return {
        "cny": cny,
        "native": native,
        "currency": currency,
        "unit": unit,
        "quantity": quantity,
        "price": price_value,
    }


def resolve_cjk_font(font_path: str | None = None) -> str | None:
    candidates = [font_path, os.environ.get("FONT_PATH"), *CJK_FONT_CANDIDATES]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def has_cjk_font() -> bool:
    return resolve_cjk_font() is not None


def _fps_float(fps_str: str) -> float:
    if "/" in fps_str:
        numerator, denominator = fps_str.split("/", 1)
        denom = float(denominator)
        return float(numerator) / denom if denom else 0.0
    return float(fps_str)


def probe_video(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams") or []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video_stream:
        raise RuntimeError(f"No video stream found: {path}")
    fps_str = video_stream.get("r_frame_rate") or "0/1"
    return {
        "width": int(video_stream["width"]),
        "height": int(video_stream["height"]),
        "fps": _fps_float(fps_str),
        "fps_str": fps_str,
        "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
    }


def has_pillow() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return True


def _text_bbox(draw, xy, text: str, font, stroke_width: int):
    return draw.textbbox(xy, text, font=font, stroke_width=stroke_width)


def _centered_x(draw, text: str, font, width: int, stroke_width: int) -> int:
    left, _, right, _ = _text_bbox(draw, (0, 0), text, font, stroke_width)
    return int((width - (right - left)) / 2 - left)


def _fit_font(font_path: str, text: str, start_size: int, max_width: int):
    from PIL import Image, ImageDraw, ImageFont

    probe = Image.new("RGBA", (max_width, max(start_size * 2, 64)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    size = max(12, start_size)
    while size > 12:
        font = ImageFont.truetype(font_path, size, index=0)
        left, _, right, _ = draw.textbbox((0, 0), text, font=font, stroke_width=max(1, size // 18))
        if right - left <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(font_path, size, index=0)


def render_title_png(
    title: str,
    subtitle: str | None,
    width: int,
    height: int,
    font_path: str,
    out_png: Path,
) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGBA", (int(width), int(height)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    title_size = max(20, int(height) // 12)
    subtitle_size = max(14, int(height) // 22)
    max_text_width = int(width * 0.86)
    title_font = _fit_font(font_path, title, title_size, max_text_width)
    subtitle_font = (
        _fit_font(font_path, subtitle, subtitle_size, max_text_width)
        if subtitle
        else ImageFont.truetype(font_path, subtitle_size, index=0)
    )
    title_stroke = max(2, int(height) // 180)
    sub_stroke = max(1, int(height) // 240)
    title_box = _text_bbox(draw, (0, 0), title, title_font, title_stroke)
    title_h = title_box[3] - title_box[1]
    subtitle_h = 0
    if subtitle:
        sub_box = _text_bbox(draw, (0, 0), subtitle, subtitle_font, sub_stroke)
        subtitle_h = sub_box[3] - sub_box[1]
    gap = max(12, int(height) // 36) if subtitle else 0
    total_h = title_h + gap + subtitle_h
    y = int((height - total_h) / 2 - height * 0.04)
    x = _centered_x(draw, title, title_font, width, title_stroke)
    draw.text(
        (x, y),
        title,
        font=title_font,
        fill=(255, 255, 255, 255),
        stroke_width=title_stroke,
        stroke_fill=(0, 0, 0, 165),
    )
    if subtitle:
        sub_y = y + title_h + gap
        sub_x = _centered_x(draw, subtitle, subtitle_font, width, sub_stroke)
        draw.text(
            (sub_x, sub_y),
            subtitle,
            font=subtitle_font,
            fill=(255, 255, 255, 235),
            stroke_width=sub_stroke,
            stroke_fill=(0, 0, 0, 145),
        )
    out_png.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_png)
    return out_png


def build_title_card_commands(
    input_path: Path,
    out_path: Path,
    title_png: Path,
    firstframe_png: Path,
    duration: float,
    bg: str,
    info: dict[str, Any],
    workdir: Path,
) -> list[list[str]]:
    width = int(info["width"])
    height = int(info["height"])
    fps_str = str(info.get("fps_str") or info.get("fps") or "24/1")
    has_audio = bool(info.get("has_audio"))
    size = f"{width}x{height}"

    def common_output(audio: bool) -> list[str]:
        args = [
            "-r",
            fps_str,
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "medium",
            "-pix_fmt",
            "yuv420p",
        ]
        if audio:
            args.extend(["-c:a", "aac", "-b:a", "192k"])
        args.extend(["-movflags", "+faststart", str(out_path)])
        return args

    title_input = ["-loop", "1", "-framerate", fps_str, "-t", str(duration), "-i", str(title_png)]
    input_video = (
        f"[0:v]scale={size},setsar=1,fps={fps_str},format=yuv420p,setpts=PTS-STARTPTS[inputv]"
    )
    if bg == "solid":
        title_label = "[1:v]scale={size},setsar=1,fps={fps},format=rgba,setpts=PTS-STARTPTS[title]".format(
            size=size,
            fps=fps_str,
        )
        card_chain = (
            f"color=c=0x101317:s={size}:r={fps_str}:d={duration},setsar=1,"
            "drawbox=x=0:y=ih*0.58:w=iw:h=max(4\\,ih*0.008):color=0xEA580C@1:t=fill,"
            "format=rgba[bg];"
            f"{title_label};"
            "[bg][title]overlay=0:0:format=auto,trim=duration="
            f"{duration},format=yuv420p,setpts=PTS-STARTPTS[cardv]"
        )
        inputs = ["-i", str(input_path), *title_input]
        silent_index = 2
        commands: list[list[str]] = []
    else:
        extract = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-frames:v",
            "1",
            "-update",
            "1",
            str(firstframe_png),
        ]
        frame_input = ["-loop", "1", "-framerate", fps_str, "-t", str(duration), "-i", str(firstframe_png)]
        title_label = "[2:v]scale={size},setsar=1,fps={fps},format=rgba,setpts=PTS-STARTPTS[title]".format(
            size=size,
            fps=fps_str,
        )
        card_chain = (
            f"[1:v]scale={size},setsar=1,fps={fps_str},gblur=sigma=24,eq=brightness=-0.30,"
            "format=rgba,setpts=PTS-STARTPTS[bg];"
            f"{title_label};"
            "[bg][title]overlay=0:0:format=auto,trim=duration="
            f"{duration},format=yuv420p,setpts=PTS-STARTPTS[cardv]"
        )
        inputs = ["-i", str(input_path), *frame_input, *title_input]
        silent_index = 3
        commands = [extract]

    if has_audio:
        filter_complex = (
            f"{card_chain};"
            f"[{silent_index}:a]atrim=duration={duration},aformat=sample_fmts=fltp:channel_layouts=stereo,"
            "asetpts=PTS-STARTPTS[carda];"
            f"{input_video};"
            "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            "asetpts=PTS-STARTPTS[inputa];"
            "[cardv][carda][inputv][inputa]concat=n=2:v=1:a=1[v][a]"
        )
        command = [
            "ffmpeg",
            "-y",
            *inputs,
            "-f",
            "lavfi",
            "-t",
            str(duration),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            "-map",
            "[a]",
            *common_output(True),
        ]
    else:
        filter_complex = (
            f"{card_chain};"
            f"{input_video};"
            "[cardv][inputv]concat=n=2:v=1:a=0[v]"
        )
        command = [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            *common_output(False),
        ]
    commands.append(command)
    return commands


def add_title_card(
    input_path: Path,
    out_path: Path,
    title: str,
    subtitle: str | None = None,
    duration: float = 2.5,
    bg: str = "blur",
    font_path: str | None = None,
) -> Path:
    if not title.strip():
        raise ValueError("title is required")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg not found")
    if not has_pillow():
        raise RuntimeError("需要 Pillow：pip install Pillow")
    font = resolve_cjk_font(font_path)
    if font is None:
        raise RuntimeError("未找到中文字体，请设置 FONT_PATH 指向一个 .ttf/.otf/.ttc")

    info = probe_video(input_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="octopus-title-") as tmp:
        workdir = Path(tmp)
        title_png = workdir / "title.png"
        firstframe_png = workdir / "firstframe.png"
        render_title_png(
            title.strip(),
            subtitle.strip() if isinstance(subtitle, str) and subtitle.strip() else None,
            int(info["width"]),
            int(info["height"]),
            font,
            title_png,
        )
        commands = build_title_card_commands(
            input_path,
            out_path,
            title_png,
            firstframe_png,
            duration,
            bg,
            info,
            workdir,
        )
        for command in commands:
            subprocess.run(command, capture_output=True, text=True, check=True)
        probe_video(out_path)
    return out_path


def redact(obj):
    if isinstance(obj, dict):
        out = {}
        for key, value in obj.items():
            if str(key).lower() in SECRET_KEYS:
                out[key] = "***"
            else:
                out[key] = redact(value)
        return out
    if isinstance(obj, list):
        return [redact(value) for value in obj]
    if isinstance(obj, tuple):
        return tuple(redact(value) for value in obj)
    if isinstance(obj, str):
        if BEARER_RE.search(obj) or TOKEN_RE.match(obj):
            return "***"
        return obj
    return copy.deepcopy(obj)


def choice_to_dict(choice) -> dict[str, Any]:
    return {
        "model_id": choice.model_id,
        "provider": choice.provider_id,
        "model": choice.model["model"],
        "adapter": choice.model["adapter"],
        "quality": choice.model.get("quality"),
        "capabilities": choice.model.get("capabilities", []),
    }


def _stored_media_value(value: Any) -> Any:
    if not isinstance(value, str) or not value.startswith("data:"):
        return value
    header = value.split(",", 1)[0]
    return f"{header},…({len(value.encode('utf-8'))} bytes, local upload)"


def stored_request_copy(request: dict[str, Any]) -> dict[str, Any]:
    stored = copy.deepcopy(request)
    for key in ("image_urls", "video_urls", "audio_urls"):
        values = stored.get(key)
        if isinstance(values, list):
            stored[key] = [_stored_media_value(value) for value in values]
    return stored


def _run_relative(path: str | Path) -> str | None:
    try:
        return str(Path(path).resolve().relative_to(job_store.RUNS_DIR.resolve()))
    except (OSError, ValueError):
        return None


def _summary_progress(job: dict[str, Any]) -> int | None:
    raw = (job.get("last_poll_result") or {}).get("progress")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def safe_job_summary(job: dict[str, Any]) -> dict[str, Any]:
    downloaded = job.get("downloaded_files") or []
    results = [rel for path in downloaded if (rel := _run_relative(path))]
    return {
        "job_path": job.get("job_path"),
        "run_dir": job.get("run_dir"),
        "task": job.get("task"),
        "provider": job.get("provider"),
        "model_id": job.get("model_id"),
        "task_id": job.get("task_id"),
        "status": job.get("status"),
        "progress": _summary_progress(job),
        "estimate": job.get("estimate"),
        "result_urls": job.get("result_urls"),
        "downloaded_files": job.get("downloaded_files"),
        "results": results,
    }


def submit_job(
    config: dict[str, Any],
    task: str,
    request: dict[str, Any],
    provider: str | None = None,
    model_id: str | None = None,
    prefix: str = "visual",
    api_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    choice = select_model(
        config,
        task,
        provider_id=provider,
        model_id=model_id,
        api_keys=api_keys,
        request=request,
    )
    provider_obj = provider_for(choice.provider_id, choice.provider, api_keys=api_keys)
    result = provider_obj.submit(choice.model, request)
    estimate = estimate_cost(choice.model, request, get_budget(config))

    run_dir = job_store.make_run_dir(prefix)
    job = {
        "job_path": str(run_dir / "job.json"),
        "run_dir": str(run_dir),
        "task": task,
        "choice": choice_to_dict(choice),
        "request": redact(stored_request_copy(request)),
        "provider": choice.provider_id,
        "model_id": choice.model_id,
        "task_id": result.task_id,
        "status": result.status,
        "estimate": estimate,
        "submit_result": redact(result.raw),
        "result_urls": result.result_urls or [],
        "downloaded_files": [],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    job_store.write_json(run_dir / "job.json", job)
    return job


def poll_job(
    config: dict[str, Any],
    job_path: Path,
    download: bool = False,
    api_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    job = job_store.read_json(job_path)
    provider_config = config["providers"][job["provider"]]
    provider_obj = provider_for(job["provider"], provider_config, api_keys=api_keys)
    result = provider_obj.poll(job)
    job["status"] = result.status
    job["last_poll_result"] = redact(result.raw)
    job["result_urls"] = result.result_urls or []
    job["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    if download and result.status in DONE_STATUSES and result.result_urls:
        output_dir = Path(job["run_dir"]) / "results"
        files = provider_obj.download_results(result.result_urls, output_dir)
        job["downloaded_files"] = [str(path) for path in files]

    job_store.write_json(job_path, job)
    return job


def run_job_to_completion(
    config: dict[str, Any],
    job_path: Path,
    poll_interval: int = 10,
    timeout: int = 1800,
    api_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = poll_job(config, job_path, download=True, api_keys=api_keys)
        status = job.get("status")
        if status in DONE_STATUSES or status in FAILED_STATUSES:
            return job
        time.sleep(poll_interval)
    raise TimeoutError(f"Timed out after {timeout}s: {job_path}")


def run_job_background(
    config: dict[str, Any],
    job_path: Path,
    api_keys: dict[str, str] | None = None,
) -> None:
    try:
        run_job_to_completion(config, job_path, api_keys=api_keys)
    except Exception as exc:
        try:
            job = job_store.read_json(job_path)
        except Exception:
            job = {"job_path": str(job_path)}
        job["status"] = "failed"
        job["error"] = redact(str(exc))
        job["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        job_store.write_json(job_path, job)


def list_jobs() -> list[dict[str, Any]]:
    jobs = []
    for path in sorted(job_store.RUNS_DIR.glob("*/job.json"), reverse=True):
        try:
            jobs.append(safe_job_summary(job_store.read_json(path)))
        except Exception:
            continue
    return jobs


def _validate_job_id(job_id: str) -> None:
    if not job_id or "/" in job_id or "\\" in job_id or ".." in job_id or Path(job_id).is_absolute():
        raise KeyError(f"Invalid job id: {job_id}")


def get_job(job_id: str) -> dict[str, Any]:
    _validate_job_id(job_id)
    path = job_store.RUNS_DIR / job_id / "job.json"
    return safe_job_summary(job_store.read_json(path))


def stitch_videos(inputs: list[Path], out_path: Path) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_inputs: list[str] = []
    concat_inputs = ""
    for index, path in enumerate(inputs):
        ffmpeg_inputs.extend(["-i", str(path)])
        concat_inputs += f"[{index}:v][{index}:a]"
    filter_complex = f"{concat_inputs}concat=n={len(inputs)}:v=1:a=1[v][a]"
    command = [
        "ffmpeg",
        "-y",
        *ffmpeg_inputs,
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    subprocess.run(command, check=True)
    return out_path
