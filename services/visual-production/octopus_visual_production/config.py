from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "models.json"
RUNS_DIR = PROJECT_ROOT / "runs"
DEFAULT_BUDGET = {
    "usd_cny_rate": 7.2,
    "confirm_threshold_cny": 1.0,
    "session_cap_cny": 10.0,
}


@dataclass(frozen=True)
class ModelChoice:
    model_id: str
    provider_id: str
    provider: dict[str, Any]
    model: dict[str, Any]


def load_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or CONFIG_PATH
    with config_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def list_models(config: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return sorted(config["models"].items())


def get_budget(config: dict[str, Any]) -> dict[str, Any]:
    return {**DEFAULT_BUDGET, **(config.get("budget") or {})}


def provider_has_key(provider_config: dict[str, Any], api_keys: dict | None) -> bool:
    env_key = provider_config.get("env_key")
    if not env_key:
        return False
    if api_keys and api_keys.get(env_key):
        return True
    return bool(os.environ.get(env_key))


def _request_skips_model(model: dict[str, Any], request: dict[str, Any] | None) -> bool:
    if not request:
        return False
    if model.get("adapter") == "agnes_video":
        return bool(request.get("video_urls") or request.get("audio_urls"))
    return False


def select_model(
    config: dict[str, Any],
    task: str,
    provider_id: str | None = None,
    model_id: str | None = None,
    api_keys: dict | None = None,
    request: dict[str, Any] | None = None,
) -> ModelChoice:
    if model_id:
        candidate_ids = [model_id]
    else:
        candidate_ids = config["routes"].get(task, [])

    if not candidate_ids:
        raise ValueError(f"No route configured for task: {task}")

    skipped_for_missing_key = 0
    skipped_total = 0

    for candidate_id in candidate_ids:
        model = config["models"].get(candidate_id)
        if not model:
            skipped_total += 1
            continue
        current_provider_id = model["provider"]
        if provider_id and current_provider_id != provider_id:
            skipped_total += 1
            continue
        provider = config["providers"].get(current_provider_id)
        if not provider:
            skipped_total += 1
            continue
        if _request_skips_model(model, request):
            skipped_total += 1
            continue
        if not provider_id and not model_id and not provider_has_key(provider, api_keys):
            skipped_for_missing_key += 1
            skipped_total += 1
            continue
        return ModelChoice(candidate_id, current_provider_id, provider, model)

    if skipped_for_missing_key and skipped_for_missing_key == skipped_total:
        raise ValueError(f"No usable model for task={task!r}: no key for any candidate provider")
    if skipped_for_missing_key:
        raise ValueError(
            f"No usable model for task={task!r}, provider={provider_id!r}, "
            f"model={model_id!r}; one or more candidate providers have no key"
        )
    raise ValueError(
        f"No usable model for task={task!r}, provider={provider_id!r}, model={model_id!r}"
    )


def validate_config(config: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    providers = config.get("providers", {})
    models = config.get("models", {})
    valid_pricing_units = {"second", "image", "generation"}
    valid_currencies = {"CNY", "USD"}
    known_adapters = {
        "ark_content_video",
        "dashscope_image",
        "dashscope_video",
        "agnes_video",
        "agnes_image",
    }

    for route, model_ids in config.get("routes", {}).items():
        for route_model_id in model_ids:
            if route_model_id not in models:
                problems.append(f"Route {route} references missing model: {route_model_id}")

    for current_model_id, model in models.items():
        current_provider_id = model.get("provider")
        if current_provider_id not in providers:
            problems.append(f"Model {current_model_id} references missing provider: {current_provider_id}")
        adapter = model.get("adapter")
        if adapter not in known_adapters:
            problems.append(f"Model {current_model_id} has unsupported adapter: {adapter}")
        if current_provider_id == "aliyun_dashscope" and not model.get("endpoint"):
            problems.append(f"DashScope model {current_model_id} missing endpoint")
        pricing = model.get("pricing")
        if pricing is not None:
            price = pricing.get("price")
            if not isinstance(price, (int, float)) or isinstance(price, bool) or price < 0:
                problems.append(f"Model {current_model_id} pricing price must be a non-negative number")
            if pricing.get("unit") not in valid_pricing_units:
                problems.append(f"Model {current_model_id} pricing unit must be one of {sorted(valid_pricing_units)}")
            if pricing.get("currency") not in valid_currencies:
                problems.append(f"Model {current_model_id} pricing currency must be one of {sorted(valid_currencies)}")

    if "agnes" in providers and not providers["agnes"].get("base_url"):
        problems.append("Agnes provider missing base_url")

    budget = config.get("budget") or {}
    for budget_key in DEFAULT_BUDGET:
        if budget_key in budget:
            value = budget[budget_key]
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                problems.append(f"Budget field {budget_key} must be numeric")

    return problems
