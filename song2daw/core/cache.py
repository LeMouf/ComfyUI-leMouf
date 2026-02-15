"""Deterministic cache key helpers for song2daw pipeline steps."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


def build_step_cache_key(
    *,
    step_name: str,
    step_version: str,
    inputs: Mapping[str, Any],
    config: Mapping[str, Any] | None = None,
    model_versions: Mapping[str, str] | None = None,
) -> str:
    """Return a stable SHA-256 cache key for one deterministic pipeline step."""
    if not step_name.strip():
        raise ValueError("step_name must be non-empty")
    if not step_version.strip():
        raise ValueError("step_version must be non-empty")

    payload = {
        "step": {"name": step_name, "version": step_version},
        "inputs": dict(inputs),
        "config": dict(config or {}),
        "model_versions": dict(model_versions or {}),
    }

    try:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    except TypeError as exc:
        raise ValueError(f"cache payload must be JSON serializable: {exc}") from exc

    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

