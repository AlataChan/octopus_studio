from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from . import service
from .config import CONFIG_PATH, PROJECT_ROOT, RUNS_DIR, load_config, list_models, select_model, validate_config


DONE_STATUSES = service.DONE_STATUSES
FAILED_STATUSES = service.FAILED_STATUSES


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="octopus-visual",
        description="Route visual generation tasks across Volcengine Ark and Alibaba DashScope.",
    )
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("doctor", help="Check local configuration and key presence")
    p.set_defaults(func=cmd_doctor)

    p = sub.add_parser("models", help="List configured models")
    p.add_argument("--provider", help="Filter by provider id")
    p.set_defaults(func=cmd_models)

    p = sub.add_parser("route", help="Show selected model for a task")
    add_route_args(p)
    p.set_defaults(func=cmd_route)

    p = sub.add_parser("submit", help="Submit a task and write a job log")
    add_generation_args(p)
    p.set_defaults(func=cmd_submit)

    p = sub.add_parser("poll", help="Poll an existing job log")
    p.add_argument("--job", required=True, type=Path, help="Path to job.json")
    p.add_argument("--download", action="store_true", help="Download result media when ready")
    p.set_defaults(func=cmd_poll)

    p = sub.add_parser("run", help="Submit, poll, and download results")
    add_generation_args(p)
    p.add_argument("--poll-interval", type=int, default=10)
    p.add_argument("--timeout", type=int, default=1800)
    p.set_defaults(func=cmd_run)

    p = sub.add_parser("stitch", help="Concatenate videos with ffmpeg")
    p.add_argument("inputs", nargs="+", type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.set_defaults(func=cmd_stitch)

    p = sub.add_parser("title", help="Prepend a Chinese title card to a video")
    p.add_argument("--in", required=True, dest="in_path", type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--title", required=True)
    p.add_argument("--subtitle")
    p.add_argument("--duration", type=float, default=2.5)
    p.add_argument("--bg", choices=["blur", "solid"], default="blur")
    p.add_argument("--font-path")
    p.set_defaults(func=cmd_title)

    p = sub.add_parser("serve", help="Run the browser frontend")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8848, help="Port to bind (default: 8848)")
    p.set_defaults(func=cmd_serve)

    return parser


def add_route_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--task", required=True, help="Route key, e.g. video.final")
    parser.add_argument("--provider", help="Provider id, e.g. aliyun_dashscope")
    parser.add_argument("--model-id", help="Explicit model id from config/models.json")


def add_generation_args(parser: argparse.ArgumentParser) -> None:
    add_route_args(parser)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--ratio", default="16:9")
    parser.add_argument("--duration", type=int)
    parser.add_argument("--size", help='Image/video size, e.g. "1280*720" or provider-specific value')
    parser.add_argument("--seed", type=int)
    parser.add_argument("--n", type=int, help="Number of images when supported")
    parser.add_argument("--image-url", action="append", default=[], dest="image_urls")
    parser.add_argument("--video-url", action="append", default=[], dest="video_urls")
    parser.add_argument("--audio-url", action="append", default=[], dest="audio_urls")
    parser.add_argument("--generate-audio", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--watermark", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--prefix", default="visual")


def cmd_doctor(args: argparse.Namespace) -> int:
    config = load_config()
    print(f"project_root: {PROJECT_ROOT}")
    print(f"config: {CONFIG_PATH}")
    print(f"runs_dir: {RUNS_DIR}")
    for provider_id, provider in config["providers"].items():
        env_key = provider["env_key"]
        present = bool(os.environ.get(env_key))
        print(f"{provider_id}: {env_key}={'set' if present else 'missing'}")
        base_env = provider.get("base_url_env")
        if base_env:
            print(f"{provider_id}: {base_env}={os.environ.get(base_env) or provider.get('default_base_url')}")
    print(f"ffmpeg: {'found' if has_command('ffmpeg') else 'missing'}")
    return 0


def cmd_models(args: argparse.Namespace) -> int:
    config = load_config()
    rows = []
    for model_id, model in list_models(config):
        if args.provider and model["provider"] != args.provider:
            continue
        rows.append(
            {
                "id": model_id,
                "provider": model["provider"],
                "model": model["model"],
                "adapter": model["adapter"],
                "quality": model.get("quality"),
                "capabilities": model.get("capabilities", []),
            }
        )
    print(json.dumps(rows, ensure_ascii=False, indent=2))
    return 0


def cmd_route(args: argparse.Namespace) -> int:
    config = load_config()
    choice = select_model(config, args.task, args.provider, args.model_id)
    print(json.dumps(choice_to_dict(choice), ensure_ascii=False, indent=2))
    return 0


def cmd_submit(args: argparse.Namespace) -> int:
    config = load_config()
    job = submit_from_args(config, args)
    print_estimate(job)
    print(json.dumps(safe_job_summary(job), ensure_ascii=False, indent=2))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    config = load_config()
    job = submit_from_args(config, args)
    job_path = Path(job["job_path"])
    print_estimate(job)
    print(json.dumps(safe_job_summary(job), ensure_ascii=False, indent=2))
    job = service.run_job_to_completion(
        config,
        job_path,
        poll_interval=args.poll_interval,
        timeout=args.timeout,
        api_keys=None,
    )
    print(f"status={job.get('status')}")
    print(json.dumps(safe_job_summary(job), ensure_ascii=False, indent=2))
    return 2 if job.get("status") in FAILED_STATUSES else 0


def cmd_poll(args: argparse.Namespace) -> int:
    config = load_config()
    job = poll_job(config, args.job, download=args.download)
    print(json.dumps(safe_job_summary(job), ensure_ascii=False, indent=2))
    return 0


def submit_from_args(config: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    return service.submit_job(
        config,
        args.task,
        request_from_args(args),
        provider=args.provider,
        model_id=args.model_id,
        prefix=args.prefix,
        api_keys=None,
    )


def poll_job(config: dict[str, Any], job_path: Path, download: bool) -> dict[str, Any]:
    return service.poll_job(config, job_path, download=download, api_keys=None)


def request_from_args(args: argparse.Namespace) -> dict[str, Any]:
    request: dict[str, Any] = {
        "prompt": args.prompt,
        "ratio": args.ratio,
        "image_urls": args.image_urls,
        "video_urls": args.video_urls,
        "audio_urls": args.audio_urls,
        "watermark": args.watermark,
    }
    if args.duration is not None:
        request["duration"] = args.duration
    if args.size:
        request["size"] = args.size
    if args.seed is not None:
        request["seed"] = args.seed
    if args.n is not None:
        request["n"] = args.n
    if args.generate_audio is not None:
        request["generate_audio"] = args.generate_audio
    return request


def cmd_stitch(args: argparse.Namespace) -> int:
    out = service.stitch_videos(args.inputs, args.out)
    print(out.resolve())
    return 0


def cmd_title(args: argparse.Namespace) -> int:
    out = service.add_title_card(
        args.in_path,
        args.out,
        args.title,
        subtitle=args.subtitle,
        duration=args.duration,
        bg=args.bg,
        font_path=args.font_path,
    )
    print(out.resolve())
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    from . import webserver

    config = load_config()
    problems = validate_config(config)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    server_keys = [provider["env_key"] for provider in config["providers"].values()]
    if args.host not in {"127.0.0.1", "localhost"} and any(os.environ.get(key) for key in server_keys):
        print("WARNING: binding to a non-local host exposes server default API keys on the LAN.", file=sys.stderr)
    print(f"http://{args.host}:{args.port}")
    webserver.make_server(args.host, args.port, config).serve_forever()
    return 0


def choice_to_dict(choice) -> dict[str, Any]:
    return {
        "model_id": choice.model_id,
        "provider": choice.provider_id,
        "model": choice.model["model"],
        "adapter": choice.model["adapter"],
        "quality": choice.model.get("quality"),
        "capabilities": choice.model.get("capabilities", []),
    }


def safe_job_summary(job: dict[str, Any]) -> dict[str, Any]:
    return service.safe_job_summary(job)


def print_estimate(job: dict[str, Any]) -> None:
    estimate = job.get("estimate") or {}
    cny = estimate.get("cny")
    if cny is None:
        print("estimated cost: ≈ ¥? price not set")
        return
    print(f"estimated cost: ≈ ¥{float(cny):.2f} ({job.get('model_id')})")


def has_command(command: str) -> bool:
    return bool(shutil.which(command))


if __name__ == "__main__":
    raise SystemExit(main())
