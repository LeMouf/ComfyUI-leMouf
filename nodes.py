"""
ComfyUI-leMouf nodes.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import wave
from urllib.parse import quote as url_quote
from array import array
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any, Dict, List, Mapping, Optional, Tuple

THIS_DIR = os.path.dirname(os.path.realpath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

try:
    from .backend.workflows import catalog as workflow_catalog
    from .backend.workflows import profiles as workflow_profiles
    from .backend.loop.media_cache import LoopMediaCacheStore
    from .backend.loop.runtime_state import LoopRuntimeStateStore
except Exception:  # pragma: no cover - direct import context
    from backend.workflows import catalog as workflow_catalog
    from backend.workflows import profiles as workflow_profiles
    from backend.loop.media_cache import LoopMediaCacheStore
    from backend.loop.runtime_state import LoopRuntimeStateStore

def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def _log(message: str) -> None:
    print(f"[leMouf] {message}")


MAX_LOOPS = _int_env("LEMOUF_MAX_LOOPS", 50)
MAX_MANIFEST = _int_env("LEMOUF_MAX_MANIFEST", 2000)
MAX_SONG2DAW_RUNS = _int_env("LEMOUF_MAX_SONG2DAW_RUNS", 100)
MAX_RUNTIME_STATES = _int_env("LEMOUF_MAX_RUNTIME_STATES", max(10, MAX_LOOPS if MAX_LOOPS > 0 else 100))
MAX_MEDIA_CACHE_FILES_PER_LOOP = _int_env("LEMOUF_MAX_MEDIA_CACHE_FILES_PER_LOOP", 512)
MAX_MEDIA_CACHE_FILE_MB = _int_env("LEMOUF_MAX_MEDIA_CACHE_FILE_MB", 512)
MAX_MEDIA_CACHE_FILE_BYTES = max(1, int(MAX_MEDIA_CACHE_FILE_MB)) * 1024 * 1024
_MIDI_EXTENSIONS = {".mid", ".midi"}

_LOOP_RUNTIME_STATE_PATH = os.path.join(THIS_DIR, "backend", "loop", "runtime_state.json")
LOOP_RUNTIME_STATES = LoopRuntimeStateStore(
    path=_LOOP_RUNTIME_STATE_PATH,
    max_entries=MAX_RUNTIME_STATES,
)
_LOOP_MEDIA_CACHE_DIR = os.path.join(THIS_DIR, "backend", "loop", "media_cache")
LOOP_MEDIA_CACHE = LoopMediaCacheStore(
    path=_LOOP_MEDIA_CACHE_DIR,
    max_files_per_loop=MAX_MEDIA_CACHE_FILES_PER_LOOP,
    max_file_bytes=MAX_MEDIA_CACHE_FILE_BYTES,
)


try:
    from server import PromptServer
    from aiohttp import web
    import execution
    try:
        from comfy_execution.utils import get_executing_context
    except Exception:
        get_executing_context = None  # type: ignore
except Exception as exc:  # pragma: no cover - ComfyUI runtime only
    PromptServer = None  # type: ignore
    web = None  # type: ignore
    execution = None  # type: ignore
    get_executing_context = None  # type: ignore
    _log(f"Runtime imports unavailable: {exc}")


# -------------------------
# Loop state + registry
# -------------------------


@dataclass
class LoopManifestEntry:
    cycle_index: int
    retry_index: int
    status: str
    prompt_id: Optional[str] = None
    decision: Optional[str] = None
    outputs: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


@dataclass
class LoopState:
    loop_id: str
    total_cycles: int = 1
    mode: str = "interactive"
    status: str = "idle"
    current_cycle: int = 0
    current_retry: int = 0
    overrides: Dict[str, Any] = field(default_factory=dict)
    loop_map: Optional[Dict[str, Any]] = None
    loop_map_error: Optional[str] = None
    payload: Optional[Any] = None
    payload_error: Optional[str] = None
    workflow: Optional[Dict[str, Any]] = None
    workflow_meta: Optional[Dict[str, Any]] = None
    workflow_source: str = "path"
    manifest: List[LoopManifestEntry] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    last_error: Optional[str] = None


class LoopRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loops: Dict[str, LoopState] = {}
        self._last_warning: Optional[str] = None

    def _prune_locked(self) -> None:
        if MAX_LOOPS > 0 and len(self._loops) > MAX_LOOPS:
            ordered = sorted(self._loops.values(), key=lambda s: s.updated_at)
            overflow = len(self._loops) - MAX_LOOPS
            for state in ordered[:overflow]:
                self._loops.pop(state.loop_id, None)
                _log(f"Pruned loop {state.loop_id} (max loops reached)")
            self._last_warning = f"loop_limit_reached: max_loops={MAX_LOOPS}"
        if MAX_MANIFEST > 0:
            for state in self._loops.values():
                if len(state.manifest) > MAX_MANIFEST:
                    overflow = len(state.manifest) - MAX_MANIFEST
                    state.manifest = state.manifest[overflow:]
                    state.updated_at = time.time()
                    _log(f"Trimmed manifest for {state.loop_id} (kept {MAX_MANIFEST})")
                    self._last_warning = f"manifest_limit_reached: max_manifest={MAX_MANIFEST}"

    def consume_warning(self) -> Optional[str]:
        with self._lock:
            warning = self._last_warning
            self._last_warning = None
            return warning

    def create_or_get(self, loop_id: Optional[str] = None) -> LoopState:
        with self._lock:
            if loop_id and loop_id in self._loops:
                return self._loops[loop_id]
            new_id = loop_id or str(uuid.uuid4())
            state = LoopState(loop_id=new_id)
            self._loops[new_id] = state
            self._prune_locked()
            return state

    def get(self, loop_id: str) -> Optional[LoopState]:
        with self._lock:
            return self._loops.get(loop_id)

    def list(self) -> List[LoopState]:
        with self._lock:
            return list(self._loops.values())

    def update(self, loop_id: str, **kwargs: Any) -> Optional[LoopState]:
        with self._lock:
            state = self._loops.get(loop_id)
            if not state:
                return None
            for k, v in kwargs.items():
                if hasattr(state, k):
                    setattr(state, k, v)
            state.updated_at = time.time()
            return state

    def reset(self, loop_id: str, keep_workflow: bool = True) -> Optional[LoopState]:
        with self._lock:
            state = self._loops.get(loop_id)
            if not state:
                return None
            state.status = "idle"
            state.current_cycle = 0
            state.current_retry = 0
            state.last_error = None
            state.manifest = []
            state.loop_map_error = None
            state.payload_error = None
            if not keep_workflow:
                state.workflow = None
                state.workflow_meta = None
                state.workflow_source = "path"
                state.overrides = {}
                state.loop_map = None
                state.payload = None
            state.updated_at = time.time()
            return state

    def set_workflow(
        self,
        loop_id: str,
        workflow: Dict[str, Any],
        source: str,
        workflow_meta: Optional[Dict[str, Any]] = None,
    ) -> Optional[LoopState]:
        return self.update(loop_id, workflow=workflow, workflow_source=source, workflow_meta=workflow_meta)

    def add_manifest(self, loop_id: str, entry: LoopManifestEntry) -> Optional[LoopManifestEntry]:
        with self._lock:
            state = self._loops.get(loop_id)
            if not state:
                return None
            state.manifest.append(entry)
            state.updated_at = time.time()
            self._prune_locked()
            return entry

    def update_manifest(
        self, loop_id: str, cycle_index: int, retry_index: int, **kwargs: Any
    ) -> Optional[LoopManifestEntry]:
        with self._lock:
            state = self._loops.get(loop_id)
            if not state:
                return None
            for entry in state.manifest:
                if entry.cycle_index == cycle_index and entry.retry_index == retry_index:
                    for k, v in kwargs.items():
                        if hasattr(entry, k):
                            setattr(entry, k, v)
                    entry.updated_at = time.time()
                    state.updated_at = time.time()
                    return entry
            return None


REGISTRY = LoopRegistry()


_APPROVED_DECISIONS = {"approve", "approved"}
_RETRY_DECISIONS = {"replay", "reject"}
_NON_ACTIONABLE_DECISIONS = {"reject", "replay", "discard"}
_QUEUE_RUNNING_STATUSES = {"queued", "running"}


def _normalize_loop_decision(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalize_loop_status(value: Any) -> str:
    return str(value or "").strip().lower()


def _entries_for_cycle(state: LoopState, cycle_index: int) -> List[LoopManifestEntry]:
    return [entry for entry in state.manifest if int(entry.cycle_index) == int(cycle_index)]


def _dedupe_cycle_entries(entries: List[LoopManifestEntry]) -> List[LoopManifestEntry]:
    latest_by_retry: Dict[int, LoopManifestEntry] = {}
    for entry in entries:
        retry = int(entry.retry_index)
        previous = latest_by_retry.get(retry)
        if previous is None or float(entry.updated_at) >= float(previous.updated_at):
            latest_by_retry[retry] = entry
    return list(latest_by_retry.values())


def _cycle_has_approved_entry(entries: List[LoopManifestEntry]) -> bool:
    return any(
        _normalize_loop_decision(entry.decision) in _APPROVED_DECISIONS
        for entry in _dedupe_cycle_entries(entries)
    )


def _cycle_has_actionable_entry(entries: List[LoopManifestEntry]) -> bool:
    for entry in _dedupe_cycle_entries(entries):
        status = _normalize_loop_status(entry.status)
        decision = _normalize_loop_decision(entry.decision)
        if status in _QUEUE_RUNNING_STATUSES:
            return True
        if status == "returned" and decision not in _NON_ACTIONABLE_DECISIONS:
            return True
    return False


def _next_retry_index_for_cycle(entries: List[LoopManifestEntry], needs_generation: bool) -> int:
    if not entries:
        return 0
    max_retry = max(int(entry.retry_index) for entry in entries)
    if needs_generation:
        return max_retry + 1
    running_retries = [
        int(entry.retry_index)
        for entry in entries
        if _normalize_loop_status(entry.status) in _QUEUE_RUNNING_STATUSES
    ]
    if running_retries:
        return max(running_retries)
    returned_retries = [
        int(entry.retry_index)
        for entry in entries
        if _normalize_loop_status(entry.status) == "returned"
        and _normalize_loop_decision(entry.decision) not in _NON_ACTIONABLE_DECISIONS
    ]
    if returned_retries:
        return max(returned_retries)
    return max_retry + 1


def _compute_loop_progression(state: LoopState) -> Dict[str, Any]:
    total_cycles = max(1, int(state.total_cycles or 1))
    next_cycle_index: Optional[int] = None
    for idx in range(total_cycles):
        entries = _entries_for_cycle(state, idx)
        if not _cycle_has_approved_entry(entries):
            next_cycle_index = idx
            break

    if next_cycle_index is None:
        return {
            "next_cycle_index": None,
            "next_retry_index": None,
            "needs_generation": False,
            "status": "complete",
        }

    cycle_entries = _entries_for_cycle(state, next_cycle_index)
    needs_generation = not _cycle_has_actionable_entry(cycle_entries)
    next_retry_index = _next_retry_index_for_cycle(cycle_entries, needs_generation)
    has_running = any(
        _normalize_loop_status(entry.status) in _QUEUE_RUNNING_STATUSES for entry in state.manifest
    )
    return {
        "next_cycle_index": next_cycle_index,
        "next_retry_index": next_retry_index,
        "needs_generation": needs_generation,
        "status": "running" if has_running else "idle",
    }


def _sync_loop_runtime_from_manifest(state: LoopState) -> Dict[str, Any]:
    progression = _compute_loop_progression(state)
    next_cycle_index = progression.get("next_cycle_index")
    next_retry_index = progression.get("next_retry_index")
    if next_cycle_index is None:
        state.current_cycle = max(0, int(state.total_cycles or 0))
        state.current_retry = 0
    else:
        state.current_cycle = int(next_cycle_index)
        state.current_retry = int(next_retry_index or 0)
    state.status = str(progression.get("status") or "idle")
    state.updated_at = time.time()
    return progression


def _apply_loop_decision_state(
    state: LoopState,
    cycle_index: int,
    retry_index: int,
    decision: Any,
) -> Optional[Dict[str, Any]]:
    normalized_decision = _normalize_loop_decision(decision)
    targets: List[LoopManifestEntry] = []
    for entry in state.manifest:
        if int(entry.cycle_index) == int(cycle_index) and int(entry.retry_index) == int(retry_index):
            targets.append(entry)
    if not targets:
        return None

    now = time.time()
    for target in targets:
        target.decision = normalized_decision
        target.updated_at = now

    if normalized_decision in _APPROVED_DECISIONS:
        for entry in state.manifest:
            if int(entry.cycle_index) != int(cycle_index):
                continue
            if int(entry.retry_index) == int(retry_index):
                continue
            if _normalize_loop_decision(entry.decision) in _APPROVED_DECISIONS:
                entry.decision = "discard"
                entry.updated_at = now

    progression = _sync_loop_runtime_from_manifest(state)
    state.updated_at = now
    return progression


# -------------------------
# song2daw run state + registry
# -------------------------


@dataclass
class Song2DawRunState:
    run_id: str
    status: str
    audio_path: str
    stems_dir: str
    step_configs: Dict[str, Any] = field(default_factory=dict)
    model_versions: Dict[str, Any] = field(default_factory=dict)
    run_dir: str = ""
    summary: Dict[str, Any] = field(default_factory=dict)
    result: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class Song2DawRunRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: Dict[str, Song2DawRunState] = {}

    def _prune_locked(self) -> None:
        if MAX_SONG2DAW_RUNS > 0 and len(self._runs) > MAX_SONG2DAW_RUNS:
            ordered = sorted(self._runs.values(), key=lambda s: s.updated_at)
            overflow = len(self._runs) - MAX_SONG2DAW_RUNS
            for state in ordered[:overflow]:
                self._runs.pop(state.run_id, None)

    def add(self, run: Song2DawRunState) -> Song2DawRunState:
        with self._lock:
            self._runs[run.run_id] = run
            self._prune_locked()
            return run

    def get(self, run_id: str) -> Optional[Song2DawRunState]:
        with self._lock:
            return self._runs.get(run_id)

    def list(self) -> List[Song2DawRunState]:
        with self._lock:
            return sorted(self._runs.values(), key=lambda s: s.updated_at, reverse=True)

    def clear(self) -> None:
        with self._lock:
            self._runs.clear()


SONG2DAW_RUNS = Song2DawRunRegistry()


# -------------------------
# Helpers
# -------------------------


def _apply_overrides(workflow: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    # overrides: { "NodeID.Param": value }
    if not overrides:
        return workflow
    wf = json.loads(json.dumps(workflow))
    nodes = wf.get("nodes") or wf.get("prompt") or wf
    if not isinstance(nodes, dict):
        return wf
    for key, value in overrides.items():
        if "." not in key:
            continue
        node_id, param = key.split(".", 1)
        node = nodes.get(node_id)
        if not node:
            continue
        inputs = node.get("inputs")
        if isinstance(inputs, dict):
            inputs[param] = value
    return wf


def _parse_json_field(raw: Any, label: str) -> Tuple[Optional[Any], Optional[str]]:
    if raw is None:
        return None, None
    if isinstance(raw, (dict, list)):
        return raw, None
    text = str(raw).strip()
    if not text:
        return None, None
    try:
        return json.loads(text), None
    except Exception as exc:
        return None, f"{label} json error: {exc}"


def _auto_seed(loop_id: str, cycle_index: int, retry_index: int) -> int:
    import hashlib

    key = f"{loop_id}:{cycle_index}:{retry_index}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _tokenize_path(expr: str, cycle_index: int) -> List[Any]:
    tokens: List[Any] = []
    text = expr.strip()
    if not text:
        return tokens
    if text.startswith("$payload"):
        text = text[len("$payload") :]
    if text.startswith("."):
        text = text[1:]
    while text:
        if text[0] == "[":
            end = text.find("]")
            if end == -1:
                break
            raw = text[1:end].strip()
            if raw in ("cycle_index", "$cycle_index"):
                tokens.append(int(cycle_index))
            elif (raw.startswith("'") and raw.endswith("'")) or (raw.startswith('"') and raw.endswith('"')):
                tokens.append(raw[1:-1])
            elif raw.isdigit() or (raw.startswith("-") and raw[1:].isdigit()):
                tokens.append(int(raw))
            else:
                tokens.append(raw)
            text = text[end + 1 :]
            if text.startswith("."):
                text = text[1:]
        else:
            next_dot = text.find(".")
            next_bracket = text.find("[")
            cut = None
            if next_dot == -1 and next_bracket == -1:
                cut = len(text)
            elif next_dot == -1:
                cut = next_bracket
            elif next_bracket == -1:
                cut = next_dot
            else:
                cut = min(next_dot, next_bracket)
            part = text[:cut]
            if part:
                tokens.append(part)
            text = text[cut:]
            if text.startswith("."):
                text = text[1:]
    return tokens


def _get_by_tokens(root: Any, tokens: List[Any]) -> Any:
    value = root
    for token in tokens:
        if isinstance(value, dict):
            value = value.get(token)
        elif isinstance(value, list) and isinstance(token, int):
            if 0 <= token < len(value):
                value = value[token]
            else:
                return None
        else:
            return None
    return value


def _resolve_cycle_payload(payload: Any, cycle_index: int, cycle_source: Optional[str]) -> Any:
    if cycle_source:
        tokens = _tokenize_path(cycle_source, cycle_index)
        return _get_by_tokens(payload, tokens) if tokens else payload
    if isinstance(payload, list):
        if 0 <= cycle_index < len(payload):
            return payload[cycle_index]
        return None
    return payload


def _resolve_from_path(payload: Any, path: str, cycle_index: int) -> Any:
    if not path:
        return None
    tokens = _tokenize_path(path, cycle_index)
    if not tokens:
        return None
    return _get_by_tokens(payload, tokens)


def _iter_meta_nodes(workflow_meta: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(workflow_meta, dict):
        return []
    nodes = workflow_meta.get("nodes")
    if not isinstance(nodes, list):
        return []
    return nodes


def _meta_title(meta: Dict[str, Any]) -> str:
    for key in ("title", "name"):
        value = meta.get(key)
        if value:
            return str(value)
    props = meta.get("properties")
    if isinstance(props, dict):
        for key in ("title", "Node name for S&R"):
            value = props.get(key)
            if value:
                return str(value)
    return ""


def _resolve_node_ids(
    selector: Any, prompt: Dict[str, Any], workflow_meta: Optional[Dict[str, Any]]
) -> List[str]:
    if selector is None:
        return []
    if isinstance(selector, list):
        ids: List[str] = []
        for item in selector:
            ids.extend(_resolve_node_ids(item, prompt, workflow_meta))
        return list(dict.fromkeys(ids))
    if not isinstance(selector, str):
        return []

    text = selector.strip()
    if not text:
        return []
    if text.startswith("id:"):
        return [text[3:]]

    if text.startswith("type:"):
        type_name = text[5:]
        return [str(node_id) for node_id, node in prompt.items() if str(node.get("class_type") or "") == type_name]

    if text.startswith("re:"):
        pattern = text[3:]
        try:
            regex = re.compile(pattern)
        except Exception:
            return []
        ids = []
        for meta in _iter_meta_nodes(workflow_meta):
            title = _meta_title(meta)
            if regex.search(title):
                ids.append(str(meta.get("id")))
        if ids:
            return ids
        return [
            str(node_id)
            for node_id, node in prompt.items()
            if regex.search(str(node.get("class_type") or ""))
        ]

    tag = text if text.startswith("@") else f"@{text}"
    ids = []
    for meta in _iter_meta_nodes(workflow_meta):
        title = _meta_title(meta)
        if tag in title:
            ids.append(str(meta.get("id")))
    return ids


def _build_overrides_from_map(
    loop_map: Optional[Dict[str, Any]],
    payload: Any,
    loop_id: str,
    cycle_index: int,
    retry_index: int,
    prompt: Dict[str, Any],
    workflow_meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(loop_map, dict):
        return {}
    mappings = loop_map.get("mappings")
    if not isinstance(mappings, list):
        return {}
    cycle_source = loop_map.get("cycle_source") if isinstance(loop_map.get("cycle_source"), str) else None
    cycle_payload = _resolve_cycle_payload(payload, cycle_index, cycle_source)
    overrides: Dict[str, Any] = {}

    def resolve_special(value: Any) -> Any:
        if isinstance(value, str):
            if value == "$auto_seed":
                return _auto_seed(loop_id, cycle_index, retry_index)
            if value == "$cycle_index":
                return cycle_index
            if value == "$retry_index":
                return retry_index
        return value

    for entry in mappings:
        if not isinstance(entry, dict):
            continue
        from_path = str(entry.get("from") or "").strip()
        to_cfg = entry.get("to") if isinstance(entry.get("to"), dict) else {}
        node_selector = to_cfg.get("node")
        input_name = to_cfg.get("input")
        if not from_path or not node_selector or not input_name:
            continue
        value = resolve_special(_resolve_from_path(cycle_payload, from_path, cycle_index))
        if value is None and "fallback" in entry:
            value = resolve_special(entry.get("fallback"))
        if retry_index > 0 and "on_retry" in entry:
            value = resolve_special(entry.get("on_retry"))
        if value is None:
            continue
        node_ids = _resolve_node_ids(node_selector, prompt, workflow_meta)
        if not node_ids:
            continue
        for node_id in node_ids:
            overrides[f"{node_id}.{input_name}"] = value
    return overrides


def _extract_loop_config(
    prompt: Dict[str, Any],
) -> Tuple[
    Optional[Dict[str, Any]],
    Optional[str],
    Optional[Any],
    Optional[str],
    bool,
    bool,
]:
    loop_map: Optional[Dict[str, Any]] = None
    loop_map_error: Optional[str] = None
    payload: Optional[Any] = None
    payload_error: Optional[str] = None
    loop_map_found = False
    payload_found = False

    for node in prompt.values():
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        if class_type == "LoopMap":
            loop_map_found = True
            raw = inputs.get("map_json")
            loop_map, loop_map_error = _parse_json_field(raw, "loop_map")
        elif class_type == "LoopPayload":
            payload_found = True
            raw = inputs.get("payload_json")
            payload, payload_error = _parse_json_field(raw, "payload")
        if loop_map_found and payload_found:
            break
    return loop_map, loop_map_error, payload, payload_error, loop_map_found, payload_found


def _workflows_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "workflows")


def _is_feature_scoped_workflow_name(name: str) -> bool:
    return workflow_catalog.is_feature_scoped_workflow_name(name)


def _list_workflow_files() -> List[str]:
    return workflow_catalog.list_workflow_files(_workflows_dir())


def _load_workflow_file(name: str) -> Dict[str, Any]:
    return workflow_catalog.load_workflow_file(name, _workflows_dir())


_WORKFLOW_PROFILE_NODE_TYPE = workflow_profiles.WORKFLOW_PROFILE_NODE_TYPE
_WORKFLOW_PROFILE_DEFAULT = workflow_profiles.WORKFLOW_PROFILE_DEFAULT


def _normalize_profile_id(value: Any) -> str:
    return workflow_profiles.normalize_profile_id(value)


def _normalize_semver(value: Any, fallback: str) -> str:
    return workflow_profiles.normalize_semver(value, fallback)


def _normalize_workflow_kind(value: Any, fallback: str = "master") -> str:
    return workflow_profiles.normalize_workflow_kind(value, fallback)


def _coalesce_profile_id(profile_id_raw: Any, profile_id_custom_raw: Any) -> str:
    return workflow_profiles.coalesce_profile_id(profile_id_raw, profile_id_custom_raw)


def _resolve_workflow_profile(
    workflow: Optional[Mapping[str, Any]] = None,
    prompt: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    return workflow_profiles.resolve_workflow_profile(workflow=workflow, prompt=prompt)


def _list_workflow_entries() -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for name in _list_workflow_files():
        profile = workflow_profiles.finalize_workflow_profile(
            {
                "profile_id": "generic_loop",
                "source": "list_fallback",
            },
            "list_fallback",
        )
        try:
            workflow = _load_workflow_file(name)
            profile = _resolve_workflow_profile(workflow=workflow, prompt=None)
        except Exception:
            pass
        entries.append({"name": name, "workflow_profile": profile})
    return entries


def _song2daw_run_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    steps = result.get("steps")
    if not isinstance(steps, list):
        steps = []
    step_summaries = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        outputs = step.get("outputs")
        output_keys = sorted(outputs.keys()) if isinstance(outputs, dict) else []
        step_summaries.append(
            {
                "name": step.get("name"),
                "version": step.get("version"),
                "cache_key": step.get("cache_key"),
                "outputs": output_keys,
            }
        )
    artifacts = result.get("artifacts")
    artifact_keys = sorted(artifacts.keys()) if isinstance(artifacts, dict) else []
    return {
        "step_count": len(step_summaries),
        "steps": step_summaries,
        "artifact_keys": artifact_keys,
    }


def _song2daw_build_ui_view_payload(run: Song2DawRunState) -> Dict[str, Any]:
    from features.song2daw.core.ui_view import build_ui_view, validate_ui_view

    ui_view = build_ui_view(
        run.result,
        run_id=run.run_id,
        audio_path=run.audio_path,
        stems_dir=run.stems_dir,
    )
    return {
        "run_id": run.run_id,
        "status": run.status,
        "ui_view": ui_view,
        "valid": validate_ui_view(ui_view),
    }


def _is_midi_path(path: str) -> bool:
    _, ext = os.path.splitext(str(path or "").strip().lower())
    return ext in _MIDI_EXTENSIONS


def _song2daw_collect_preview_events(result: Mapping[str, Any]) -> List[Dict[str, Any]]:
    artifacts = result.get("artifacts")
    if not isinstance(artifacts, Mapping):
        return []

    events_ref = artifacts.get("events")
    items = events_ref.get("items") if isinstance(events_ref, Mapping) else None
    if not isinstance(items, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, Mapping):
            continue
        t0 = float(item.get("t0_sec") or 0.0)
        t1 = float(item.get("t1_sec") or t0)
        if not math.isfinite(t0) or not math.isfinite(t1):
            continue
        if t1 <= t0:
            t1 = t0 + 0.08
        velocity = int(item.get("velocity") or 80)
        note = int(item.get("midi_note") or 60)
        normalized.append(
            {
                "source_id": str(item.get("source_id") or "src:preview"),
                "t0_sec": max(0.0, t0),
                "t1_sec": max(0.0, t1),
                "velocity": max(1, min(127, velocity)),
                "midi_note": max(12, min(120, note)),
            }
        )
    return normalized


def _song2daw_infer_preview_duration_sec(result: Mapping[str, Any], events: List[Dict[str, Any]]) -> float:
    duration_sec = 0.0
    artifacts = result.get("artifacts")
    if isinstance(artifacts, Mapping):
        beatgrid = artifacts.get("beatgrid")
        beats = beatgrid.get("beats_sec") if isinstance(beatgrid, Mapping) else None
        if isinstance(beats, list):
            for beat in beats:
                if isinstance(beat, (int, float)) and math.isfinite(float(beat)):
                    duration_sec = max(duration_sec, float(beat))
    for event in events:
        duration_sec = max(duration_sec, float(event.get("t1_sec") or 0.0))
    return min(600.0, max(0.5, duration_sec))


def _midi_note_to_hz(note: int) -> float:
    return 440.0 * (2.0 ** ((float(note) - 69.0) / 12.0))


def _song2daw_write_preview_mix_wav(path: str, events: List[Dict[str, Any]], duration_sec: float) -> bool:
    if not events:
        return False

    sample_rate = 22050
    total_frames = max(1, int(round(duration_sec * sample_rate)))
    samples = [0.0] * total_frames
    attack_frames = max(1, int(0.004 * sample_rate))
    release_frames = max(1, int(0.022 * sample_rate))

    for event in events:
        start = int(round(float(event["t0_sec"]) * sample_rate))
        end = int(round(float(event["t1_sec"]) * sample_rate))
        if end <= start:
            end = start + max(1, int(0.05 * sample_rate))
        if start >= total_frames:
            continue
        end = min(total_frames, end)
        length = max(1, end - start)
        source_id = str(event["source_id"])
        seed = int(sha256(source_id.encode("utf-8")).hexdigest()[:8], 16)
        phase0 = (seed % 6283) / 1000.0
        freq = _midi_note_to_hz(int(event["midi_note"]))
        step = (2.0 * math.pi * freq) / sample_rate
        amp = 0.04 + (float(event["velocity"]) / 127.0) * 0.12

        for frame in range(length):
            env = 1.0
            if frame < attack_frames:
                env = frame / attack_frames
            elif frame > length - release_frames:
                env = max(0.0, (length - frame) / release_frames)
            idx = start + frame
            if idx >= total_frames:
                break
            samples[idx] += math.sin(phase0 + step * frame) * amp * env

    peak = 0.0
    for value in samples:
        abs_value = abs(value)
        if abs_value > peak:
            peak = abs_value
    gain = 0.0 if peak <= 1e-9 else 0.92 / peak

    pcm = array("h")
    for value in samples:
        scaled = max(-1.0, min(1.0, value * gain))
        pcm.append(int(round(scaled * 32767.0)))

    try:
        with wave.open(path, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(pcm.tobytes())
    except Exception:
        return False
    return True


def _song2daw_ensure_preview_mix_audio(run: Song2DawRunState) -> Optional[str]:
    run_dir = str(run.run_dir or "").strip()
    if not run_dir:
        return None
    run_dir_real = os.path.realpath(run_dir)
    if not os.path.isdir(run_dir_real):
        return None

    preview_path = os.path.join(run_dir_real, "preview_mix.wav")
    if os.path.isfile(preview_path):
        return preview_path

    events = _song2daw_collect_preview_events(run.result if isinstance(run.result, Mapping) else {})
    if not events:
        return None
    duration_sec = _song2daw_infer_preview_duration_sec(
        run.result if isinstance(run.result, Mapping) else {},
        events,
    )
    ok = _song2daw_write_preview_mix_wav(preview_path, events, duration_sec)
    return preview_path if ok and os.path.isfile(preview_path) else None


def _song2daw_collect_audio_assets(run: Song2DawRunState) -> Dict[str, str]:
    assets: Dict[str, str] = {}
    preview_mix_path = _song2daw_ensure_preview_mix_audio(run)
    if preview_mix_path:
        assets["preview_mix"] = preview_mix_path

    mix_path = _resolve_run_audio_path(run, run.audio_path)
    if mix_path and not _is_midi_path(mix_path):
        assets["mix"] = mix_path
    elif preview_mix_path:
        assets["mix"] = preview_mix_path
    elif mix_path:
        assets["mix"] = mix_path

    artifacts = run.result.get("artifacts") if isinstance(run.result, dict) else None
    stems_generated = artifacts.get("stems_generated") if isinstance(artifacts, dict) else None
    stem_items = stems_generated.get("items") if isinstance(stems_generated, dict) else None
    if isinstance(stem_items, list):
        for item in stem_items:
            if not isinstance(item, dict):
                continue
            source_id = str(item.get("source_id") or "").strip()
            if not source_id:
                continue
            stem_raw = str(item.get("path_hint") or item.get("path") or "").strip()
            stem_path = _resolve_run_audio_path(run, stem_raw)
            if stem_path:
                assets[f"source:{source_id}"] = stem_path

    return dict(sorted(assets.items(), key=lambda entry: entry[0]))


def _song2daw_resolve_audio_asset_path(run: Song2DawRunState, asset: str) -> Optional[str]:
    assets = _song2daw_collect_audio_assets(run)
    requested = str(asset or "").strip()
    if not requested:
        requested = "mix"
    if requested in assets:
        return assets[requested]
    if requested in ("__source_audio", "source_audio", "workflow_source", "mix"):
        source_path = _resolve_run_audio_path(run, run.audio_path)
        if source_path:
            return source_path
    return None


def _resolve_run_audio_path(run: Song2DawRunState, raw_path: str) -> Optional[str]:
    value = str(raw_path or "").strip()
    if not value:
        return None

    candidates: List[str] = []
    normalized = value.replace("\\", os.sep).replace("/", os.sep)
    if os.path.isabs(normalized):
        candidates.append(normalized)
    else:
        if run.run_dir:
            candidates.append(os.path.join(run.run_dir, normalized))
        candidates.append(os.path.join(os.getcwd(), normalized))
        candidates.append(os.path.join(os.path.dirname(__file__), normalized))
        stems_dir = str(run.stems_dir or "").strip()
        if stems_dir:
            stems_norm = stems_dir.replace("\\", os.sep).replace("/", os.sep)
            if os.path.isabs(stems_norm):
                candidates.append(os.path.join(stems_norm, normalized))
            else:
                candidates.append(os.path.join(os.getcwd(), stems_norm, normalized))
                candidates.append(os.path.join(os.path.dirname(__file__), stems_norm, normalized))
        try:
            import folder_paths  # type: ignore

            for getter_name in ("get_input_directory", "get_output_directory", "get_temp_directory"):
                getter = getattr(folder_paths, getter_name, None)
                if callable(getter):
                    try:
                        base = getter()
                    except Exception:
                        base = ""
                    base_text = str(base or "").strip()
                    if base_text:
                        candidates.append(os.path.join(base_text, normalized))

            annotated = getattr(folder_paths, "get_annotated_filepath", None)
            if callable(annotated):
                try:
                    annotated_path = annotated(value)
                except Exception:
                    annotated_path = ""
                annotated_text = str(annotated_path or "").strip()
                if annotated_text:
                    candidates.append(annotated_text)
        except Exception:
            pass

    deduped = []
    seen = set()
    for candidate in candidates:
        real_candidate = os.path.realpath(candidate)
        if real_candidate in seen:
            continue
        seen.add(real_candidate)
        deduped.append(real_candidate)
    for candidate in deduped:
        if os.path.isfile(candidate):
            return candidate
    return None


def _open_directory(path: str) -> Tuple[bool, str]:
    folder = str(path or "").strip()
    if not folder:
        return False, "missing_path"
    if not os.path.isdir(folder):
        return False, "not_found"
    try:
        if hasattr(os, "startfile"):
            os.startfile(folder)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _resolve_loop_id(loop_id: str) -> Optional[str]:
    loop_id = (loop_id or "").strip()
    if loop_id and REGISTRY.get(loop_id):
        return loop_id
    if get_executing_context is None:
        return loop_id or None
    ctx = get_executing_context()
    if not ctx or not getattr(ctx, "prompt_id", None):
        return loop_id or None
    prompt_id = ctx.prompt_id
    for loop in REGISTRY.list():
        for entry in loop.manifest:
            if entry.prompt_id == prompt_id:
                return loop.loop_id
    return loop_id or None


def _update_manifest_by_prompt(loop_id: str, prompt_id: str, **kwargs: Any) -> Optional[LoopManifestEntry]:
    s = REGISTRY.get(loop_id)
    if not s:
        return None
    for entry in s.manifest:
        if entry.prompt_id == prompt_id:
            for k, v in kwargs.items():
                if hasattr(entry, k):
                    setattr(entry, k, v)
            entry.updated_at = time.time()
            s.updated_at = time.time()
            return entry
    return None


def _update_latest_pending(
    loop_id: str,
    cycle_index: int,
    retry_index: int,
    **kwargs: Any,
) -> Optional[LoopManifestEntry]:
    s = REGISTRY.get(loop_id)
    if not s:
        return None
    pending = [entry for entry in s.manifest if entry.status in ("queued", "running")]
    if not pending:
        return None
    same_cycle = [entry for entry in pending if entry.cycle_index == cycle_index]
    candidates = same_cycle or pending
    entry = max(candidates, key=lambda e: e.updated_at)
    entry.cycle_index = cycle_index
    entry.retry_index = retry_index
    for k, v in kwargs.items():
        if hasattr(entry, k):
            setattr(entry, k, v)
    entry.updated_at = time.time()
    s.updated_at = time.time()
    return entry


def _save_images(
    images,
    loop_id: str,
    cycle_index: int,
    retry_index: int,
) -> List[Dict[str, Any]]:
    try:
        import numpy as np
        import torch
        from PIL import Image
        import folder_paths
    except Exception as exc:
        raise RuntimeError(f"Image save dependencies missing: {exc}") from exc

    def normalize_batch(value):
        if value is None:
            return []
        if isinstance(value, torch.Tensor):
            if value.dim() == 4:
                return [value[i] for i in range(value.shape[0])]
            if value.dim() == 3:
                return [value]
        if isinstance(value, np.ndarray):
            if value.ndim == 4:
                return [value[i] for i in range(value.shape[0])]
            if value.ndim == 3:
                return [value]
        if isinstance(value, (list, tuple)):
            items = []
            for item in value:
                if isinstance(item, torch.Tensor):
                    if item.dim() == 4:
                        items.extend([item[i] for i in range(item.shape[0])])
                    elif item.dim() == 3:
                        items.append(item)
                elif isinstance(item, np.ndarray):
                    if item.ndim == 4:
                        items.extend([item[i] for i in range(item.shape[0])])
                    elif item.ndim == 3:
                        items.append(item)
                else:
                    items.append(item)
            return items
        return [value]

    batch = normalize_batch(images)
    if not batch:
        return []

    first = batch[0]
    if isinstance(first, torch.Tensor):
        height, width = first.shape[0], first.shape[1]
    elif isinstance(first, np.ndarray):
        height, width = first.shape[0], first.shape[1]
    else:
        raise RuntimeError("Unsupported image payload type")

    output_dir = folder_paths.get_output_directory()
    prefix = f"lemouf_loop/{loop_id}/cycle_{cycle_index:04}_r{retry_index:02}"
    full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        prefix, output_dir, width, height
    )

    results: List[Dict[str, Any]] = []
    for batch_number, image in enumerate(batch):
        if isinstance(image, torch.Tensor):
            i = 255.0 * image.cpu().numpy()
        elif isinstance(image, np.ndarray):
            i = image
        else:
            raise RuntimeError("Unsupported image payload type")
        if i.dtype != np.uint8:
            if i.max() <= 1.0:
                i = i * 255.0
            i = np.clip(i, 0, 255).astype(np.uint8)
        img = Image.fromarray(i)
        filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
        file = f"{filename_with_batch_num}_{counter:05}_.png"
        img.save(os.path.join(full_output_folder, file))
        results.append({"filename": file, "subfolder": subfolder, "type": "output"})
        counter += 1

    return results


def _safe_json_value(value: Any, max_items: int = 50) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (bytes, bytearray)):
        return {"_type": "bytes", "size": len(value)}
    try:
        import numpy as np

        if isinstance(value, np.generic):
            return value.item()
    except Exception:
        pass
    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for idx, (k, v) in enumerate(value.items()):
            if idx >= max_items:
                result["__truncated__"] = len(value)
                break
            result[str(k)] = _safe_json_value(v, max_items=max_items)
        return result
    if isinstance(value, (list, tuple)):
        items = []
        for idx, item in enumerate(value):
            if idx >= max_items:
                items.append(f"...({len(value) - max_items} more)")
                break
            items.append(_safe_json_value(item, max_items=max_items))
        return items
    return str(value)


def _looks_like_images(value: Any) -> bool:
    try:
        import numpy as np
        import torch
    except Exception:
        np = None  # type: ignore
        torch = None  # type: ignore

    if torch is not None and isinstance(value, torch.Tensor):
        return value.dim() in (3, 4)
    if np is not None and isinstance(value, np.ndarray):
        return value.ndim in (3, 4)
    if isinstance(value, (list, tuple)) and value:
        return any(_looks_like_images(item) for item in value)
    return False


def _is_saved_file_list(value: Any) -> bool:
    return (
        isinstance(value, list)
        and value
        and all(isinstance(item, dict) and "filename" in item for item in value)
    )


def _extract_outputs(
    payload: Any,
    loop_id: str,
    cycle_index: int,
    retry_index: int,
) -> Dict[str, Any]:
    outputs: Dict[str, Any] = {}
    if payload is None:
        return outputs

    def maybe_images(value: Any) -> None:
        if value is None:
            return
        if _is_saved_file_list(value):
            outputs["images"] = value
            return
        if _looks_like_images(value):
            try:
                outputs["images"] = _save_images(value, loop_id, cycle_index, retry_index)
            except Exception as exc:
                outputs["save_error"] = str(exc)

    if isinstance(payload, dict):
        if "images" in payload or "image" in payload:
            maybe_images(payload.get("images", payload.get("image")))
        if "text" in payload:
            outputs["text"] = _safe_json_value(payload.get("text"))
        if "json" in payload:
            outputs["json"] = _safe_json_value(payload.get("json"))
        if "audio" in payload:
            outputs["audio"] = _safe_json_value(payload.get("audio"))
        if "video" in payload:
            outputs["video"] = _safe_json_value(payload.get("video"))
        if not outputs:
            outputs["json"] = _safe_json_value(payload)
        return outputs

    if _looks_like_images(payload):
        maybe_images(payload)
        return outputs

    if isinstance(payload, str):
        outputs["text"] = payload
    elif isinstance(payload, (bytes, bytearray)):
        outputs["binary"] = {"size": len(payload)}
    else:
        outputs["json"] = _safe_json_value(payload)
    return outputs


def _export_approved(loop_id: str) -> Tuple[int, str]:
    try:
        import folder_paths
    except Exception as exc:
        raise RuntimeError(f"folder_paths missing: {exc}") from exc

    s = REGISTRY.get(loop_id)
    if not s:
        raise RuntimeError("loop_not_found")

    output_dir = folder_paths.get_output_directory()
    dest_folder = os.path.join(output_dir, "lemouf", loop_id)
    os.makedirs(dest_folder, exist_ok=True)

    count = 0
    timestamp = int(time.time() * 1000)
    for entry in s.manifest:
        decision = (entry.decision or "").lower()
        if decision not in ("approve", "approved"):
            continue
        images = entry.outputs.get("images") if entry.outputs else None
        if not isinstance(images, list):
            continue
        for idx, image in enumerate(images):
            filename = image.get("filename") if isinstance(image, dict) else None
            if not filename:
                continue
            subfolder = image.get("subfolder") if isinstance(image, dict) else ""
            src = os.path.join(output_dir, subfolder or "", filename)
            if not os.path.exists(src):
                continue
            ext = os.path.splitext(filename)[1] or ".png"
            name = f"cycle_{entry.cycle_index:04}_r{entry.retry_index:02}_i{idx:02}_{timestamp}_{count:04}{ext}"
            dst = os.path.join(dest_folder, name)
            shutil.copy2(src, dst)
            count += 1
    return count, dest_folder


async def _enqueue_workflow_async(
    workflow: Dict[str, Any], loop_id: str
) -> Tuple[Optional[str], Optional[str]]:
    if PromptServer is None:
        return None, "PromptServer not available"

    prompt_id = str(uuid.uuid4())
    ps = PromptServer.instance

    try:
        prompt = workflow.get("prompt") if isinstance(workflow, dict) and "prompt" in workflow else workflow
        if execution is None:
            return None, "Execution module not available"

        valid, err, outputs_to_execute, node_errors = await execution.validate_prompt(prompt_id, prompt, None)
        if not valid:
            return None, f"Invalid prompt: {err}"

        number = ps.number
        ps.number += 1

        extra_data: Dict[str, Any] = {"client_id": loop_id, "create_time": int(time.time() * 1000)}
        sensitive: Dict[str, Any] = {}
        if hasattr(execution, "SENSITIVE_EXTRA_DATA_KEYS"):
            for sensitive_val in execution.SENSITIVE_EXTRA_DATA_KEYS:
                if sensitive_val in extra_data:
                    sensitive[sensitive_val] = extra_data.pop(sensitive_val)

        ps.prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute, sensitive))
        return prompt_id, None
    except Exception as exc:
        return None, str(exc)


# -------------------------
# Web API (UI panel support)
# -------------------------


def _ensure_routes() -> None:
    if PromptServer is None:
        return
    if getattr(PromptServer.instance, "_lemouf_loop_routes", False):
        return

    routes = PromptServer.instance.routes

    def add_route(method: str, path: str, handler):
        method = method.upper()
        if method == "GET":
            routes.get(path)(handler)
            routes.get(f"/api{path}")(handler)
        elif method == "POST":
            routes.post(path)(handler)
            routes.post(f"/api{path}")(handler)
        elif method == "PUT":
            routes.put(path)(handler)
            routes.put(f"/api{path}")(handler)
        elif method == "DELETE":
            routes.delete(path)(handler)
            routes.delete(f"/api{path}")(handler)
        else:
            routes.route(method, path)(handler)
            routes.route(method, f"/api{path}")(handler)

    async def loop_list(_request):
        loops = []
        for s in REGISTRY.list():
            loops.append(
                {
                    "loop_id": s.loop_id,
                    "status": s.status,
                    "mode": s.mode,
                    "total_cycles": s.total_cycles,
                    "current_cycle": s.current_cycle,
                    "current_retry": s.current_retry,
                    "updated_at": s.updated_at,
                }
            )
        warning = REGISTRY.consume_warning()
        payload = {"loops": loops}
        if warning:
            payload["warning"] = warning
        return web.json_response(payload)

    async def loop_get(request):
        loop_id = request.match_info["loop_id"]
        s = REGISTRY.get(loop_id)
        if not s:
            return web.json_response({"error": "not_found"}, status=404)
        runtime_state = LOOP_RUNTIME_STATES.get(loop_id)
        warning = REGISTRY.consume_warning()
        payload = {
            "loop_id": s.loop_id,
            "status": s.status,
            "mode": s.mode,
            "total_cycles": s.total_cycles,
            "current_cycle": s.current_cycle,
            "current_retry": s.current_retry,
            "overrides": s.overrides,
            "loop_map": s.loop_map,
            "loop_map_error": s.loop_map_error,
            "payload_error": s.payload_error,
            "workflow_source": s.workflow_source,
            "manifest": [entry.__dict__ for entry in s.manifest],
            "last_error": s.last_error,
            "runtime_state": runtime_state,
        }
        if warning:
            payload["warning"] = warning
        return web.json_response(payload)

    async def loop_create(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        s = REGISTRY.create_or_get(loop_id)
        return web.json_response({"loop_id": s.loop_id})

    async def loop_set_workflow(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        prompt = payload.get("prompt")
        workflow_meta = payload.get("workflow")
        if not loop_id or not isinstance(prompt, dict):
            return web.json_response({"error": "invalid_payload"}, status=400)
        meta = workflow_meta if isinstance(workflow_meta, dict) else None
        REGISTRY.set_workflow(loop_id, prompt, "ui", workflow_meta=meta)
        (
            loop_map,
            loop_map_error,
            payload_data,
            payload_error,
            loop_map_found,
            payload_found,
        ) = _extract_loop_config(prompt)
        updates: Dict[str, Any] = {}
        if loop_map_found or loop_map_error:
            updates["loop_map"] = loop_map
            updates["loop_map_error"] = loop_map_error
        if payload_found or payload_error:
            updates["payload"] = payload_data
            updates["payload_error"] = payload_error
        if updates:
            REGISTRY.update(loop_id, **updates)
        return web.json_response({"ok": True})

    async def loop_step(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        if not loop_id:
            return web.json_response({"error": "missing_loop_id"}, status=400)
        s = REGISTRY.get(loop_id)
        if not s or not s.workflow:
            return web.json_response({"error": "missing_workflow"}, status=400)

        raw_cycle = payload.get("cycle_index", None)
        raw_retry = payload.get("retry_index", None)
        cycle_index = s.current_cycle if raw_cycle is None else int(raw_cycle)
        if raw_retry is None:
            retry_index = s.current_retry
            if any(
                entry.cycle_index == cycle_index and entry.retry_index == retry_index
                for entry in s.manifest
            ):
                retry_index += 1
        else:
            retry_index = int(raw_retry)
        if s.total_cycles and cycle_index >= s.total_cycles:
            s.status = "complete"
            return web.json_response({"error": "complete"}, status=400)
        s.current_cycle = cycle_index
        s.current_retry = retry_index
        s.status = "running"

        overrides = dict(s.overrides or {})
        try:
            map_overrides = _build_overrides_from_map(
                s.loop_map, s.payload, loop_id, cycle_index, retry_index, s.workflow, s.workflow_meta
            )
            overrides.update(map_overrides)
        except Exception as exc:
            s.last_error = str(exc)
        wf = _apply_overrides(s.workflow, overrides)
        prompt_id, err = await _enqueue_workflow_async(wf, loop_id)
        if err:
            s.status = "error"
            s.last_error = err
            return web.json_response({"error": err}, status=500)

        entry = LoopManifestEntry(
            cycle_index=cycle_index,
            retry_index=retry_index,
            status="queued",
            prompt_id=prompt_id,
        )
        REGISTRY.add_manifest(loop_id, entry)
        return web.json_response({"ok": True, "prompt_id": prompt_id})

    async def loop_decision(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        cycle_index = int(payload.get("cycle_index", -1))
        retry_index = int(payload.get("retry_index", 0))
        decision = _normalize_loop_decision(payload.get("decision"))
        if not loop_id or cycle_index < 0:
            return web.json_response({"error": "invalid_payload"}, status=400)
        if decision not in _APPROVED_DECISIONS.union(_RETRY_DECISIONS).union({"discard"}):
            return web.json_response({"error": "invalid_decision"}, status=400)
        updated = REGISTRY.update_manifest(loop_id, cycle_index, retry_index, decision=decision)
        if not updated:
            return web.json_response({"error": "entry_not_found"}, status=404)
        s = REGISTRY.get(loop_id)
        if not s:
            return web.json_response({"error": "not_found"}, status=404)
        progression = _apply_loop_decision_state(s, cycle_index, retry_index, decision)
        if progression is None:
            return web.json_response({"error": "entry_not_found"}, status=404)
        return web.json_response(
            {
                "ok": True,
                "decision": decision,
                "current_cycle": s.current_cycle,
                "current_retry": s.current_retry,
                "status": s.status,
                "next_cycle_index": progression.get("next_cycle_index"),
                "next_retry_index": progression.get("next_retry_index"),
                "needs_generation": bool(progression.get("needs_generation")),
            }
        )

    async def loop_overrides(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        overrides = payload.get("overrides")
        if not loop_id or not isinstance(overrides, dict):
            return web.json_response({"error": "invalid_payload"}, status=400)
        REGISTRY.update(loop_id, overrides=overrides)
        return web.json_response({"ok": True})

    async def loop_config(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        total_cycles = payload.get("total_cycles")
        if not loop_id:
            return web.json_response({"error": "missing_loop_id"}, status=400)
        updates: Dict[str, Any] = {}
        if total_cycles is not None:
            try:
                updates["total_cycles"] = max(1, int(total_cycles))
            except Exception:
                return web.json_response({"error": "invalid_total_cycles"}, status=400)
        if not updates:
            return web.json_response({"error": "no_updates"}, status=400)
        s = REGISTRY.update(loop_id, **updates)
        if not s:
            return web.json_response({"error": "not_found"}, status=404)
        if s.total_cycles and s.current_cycle >= s.total_cycles:
            s.status = "complete"
        return web.json_response({"ok": True, "total_cycles": s.total_cycles})

    async def loop_export_approved(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        if not loop_id:
            return web.json_response({"error": "missing_loop_id"}, status=400)
        try:
            count, folder = _export_approved(loop_id)
        except RuntimeError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response({"ok": True, "count": count, "folder": folder})

    async def loop_reset(request):
        payload = await request.json()
        loop_id = payload.get("loop_id")
        keep_workflow = payload.get("keep_workflow", True)
        if not loop_id:
            return web.json_response({"error": "missing_loop_id"}, status=400)
        s = REGISTRY.reset(loop_id, keep_workflow=bool(keep_workflow))
        if not s:
            return web.json_response({"error": "not_found"}, status=404)
        LOOP_RUNTIME_STATES.clear(str(loop_id))
        LOOP_MEDIA_CACHE.clear_loop(str(loop_id))
        return web.json_response({"ok": True})

    async def loop_runtime_state_set(request):
        payload = await request.json()
        loop_id = str(payload.get("loop_id") or "").strip()
        if not loop_id:
            return web.json_response({"error": "missing_loop_id"}, status=400)
        if payload.get("clear"):
            LOOP_RUNTIME_STATES.clear(loop_id)
            return web.json_response({"ok": True, "cleared": True})
        runtime_state = payload.get("runtime_state")
        if not isinstance(runtime_state, dict):
            return web.json_response({"error": "invalid_runtime_state"}, status=400)
        saved = LOOP_RUNTIME_STATES.set(loop_id, runtime_state)
        if not saved:
            return web.json_response({"error": "invalid_runtime_state"}, status=400)
        return web.json_response({"ok": True})

    async def loop_media_cache_upload(request):
        if not request.content_type or "multipart/" not in str(request.content_type):
            return web.json_response({"error": "invalid_content_type"}, status=400)
        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"error": "invalid_multipart"}, status=400)
        loop_id = ""
        file_name = ""
        content_type = ""
        payload = None
        while True:
            part = await reader.next()
            if part is None:
                break
            name = str(getattr(part, "name", "") or "").strip().lower()
            if name == "loop_id":
                try:
                    loop_id = str(await part.text()).strip()
                except Exception:
                    loop_id = ""
                continue
            if name != "file":
                try:
                    await part.release()
                except Exception:
                    pass
                continue
            file_name = str(getattr(part, "filename", "") or "resource.bin").strip()
            content_type = str(
                getattr(part, "content_type", "") or part.headers.get("Content-Type") or ""
            ).strip()
            data = bytearray()
            total = 0
            while True:
                chunk = await part.read_chunk()
                if not chunk:
                    break
                total += len(chunk)
                if total > LOOP_MEDIA_CACHE.max_file_bytes:
                    return web.json_response(
                        {
                            "error": "file_too_large",
                            "max_file_bytes": int(LOOP_MEDIA_CACHE.max_file_bytes),
                        },
                        status=413,
                    )
                data.extend(chunk)
            payload = bytes(data)
        if payload is None:
            return web.json_response({"error": "missing_file"}, status=400)
        saved = LOOP_MEDIA_CACHE.store(loop_id=loop_id, filename=file_name, content_type=content_type, data=payload)
        if not saved:
            return web.json_response({"error": "cache_store_failed"}, status=400)
        safe_loop_id = str(saved.get("loop_id") or "default")
        safe_file_id = str(saved.get("file_id") or "")
        src = (
            f"/lemouf/loop/media_cache/{url_quote(safe_loop_id, safe='')}/"
            f"{url_quote(safe_file_id, safe='')}"
        )
        mime = str(saved.get("mime") or "")
        preview_src = src if mime.lower().startswith("image/") else ""
        return web.json_response(
            {
                "ok": True,
                "asset": {
                    "src": src,
                    "previewSrc": preview_src,
                    "mime": mime,
                    "size": int(saved.get("size") or 0),
                    "filename": str(saved.get("filename") or file_name or "resource.bin"),
                    "loop_id": safe_loop_id,
                    "cache_id": safe_file_id,
                },
            }
        )

    async def loop_media_cache_get(request):
        loop_id = request.match_info.get("loop_id", "")
        file_id = request.match_info.get("file_id", "")
        path = LOOP_MEDIA_CACHE.resolve(loop_id=loop_id, file_id=file_id)
        if not path:
            return web.json_response({"error": "not_found"}, status=404)
        return web.FileResponse(path=path)

    async def workflows_list(_request):
        folder = _workflows_dir()
        entries = _list_workflow_entries()
        files = [str(entry.get("name") or "") for entry in entries if str(entry.get("name") or "")]
        profiles = {
            name: entry.get("workflow_profile")
            for entry in entries
            for name in [str(entry.get("name") or "")]
            if name
        }
        master_files = [
            name
            for name in files
            if str((profiles.get(name) or {}).get("workflow_kind") or "master").lower() == "master"
        ]
        return web.json_response(
            {
                "workflows": files,
                "master_workflows": master_files,
                "workflow_profiles": profiles,
                "folder": folder,
                "exists": os.path.isdir(folder),
                "count": len(files),
            }
        )

    async def workflows_load(request):
        payload = await request.json()
        name = payload.get("name")
        if not name:
            return web.json_response({"error": "missing_name"}, status=400)
        try:
            workflow = _load_workflow_file(str(name))
        except RuntimeError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        workflow_profile = _resolve_workflow_profile(workflow=workflow, prompt=None)
        return web.json_response(
            {
                "ok": True,
                "workflow": workflow,
                "workflow_profile": workflow_profile,
                "name": name,
            }
        )

    async def song2daw_runs_list(_request):
        runs = []
        for run in SONG2DAW_RUNS.list():
            runs.append(
                {
                    "run_id": run.run_id,
                    "status": run.status,
                    "audio_path": run.audio_path,
                    "stems_dir": run.stems_dir,
                    "run_dir": run.run_dir,
                    "error": run.error,
                    "created_at": run.created_at,
                    "updated_at": run.updated_at,
                    "summary": run.summary,
                }
            )
        return web.json_response({"runs": runs})

    async def song2daw_run_get(request):
        run_id = request.match_info["run_id"]
        run = SONG2DAW_RUNS.get(run_id)
        if not run:
            return web.json_response({"error": "not_found"}, status=404)
        audio_assets = _song2daw_collect_audio_assets(run)
        return web.json_response(
            {
                "run_id": run.run_id,
                "status": run.status,
                "audio_path": run.audio_path,
                "stems_dir": run.stems_dir,
                "audio_assets": audio_assets,
                "step_configs": run.step_configs,
                "model_versions": run.model_versions,
                "run_dir": run.run_dir,
                "summary": run.summary,
                "result": run.result,
                "error": run.error,
                "created_at": run.created_at,
                "updated_at": run.updated_at,
            }
        )

    async def song2daw_run_ui_view_get(request):
        run_id = request.match_info["run_id"]
        run = SONG2DAW_RUNS.get(run_id)
        if not run:
            return web.json_response({"error": "not_found"}, status=404)
        payload = _song2daw_build_ui_view_payload(run)
        return web.json_response(payload)

    async def song2daw_runs_clear(_request):
        SONG2DAW_RUNS.clear()
        return web.json_response({"ok": True})

    async def song2daw_run_open(request):
        payload = await request.json()
        run_id = str(payload.get("run_id") or "").strip()
        if not run_id:
            return web.json_response({"error": "missing_run_id"}, status=400)
        run = SONG2DAW_RUNS.get(run_id)
        if not run:
            return web.json_response({"error": "not_found"}, status=404)
        ok, err = _open_directory(run.run_dir)
        if not ok:
            return web.json_response({"error": err or "open_failed"}, status=400)
        return web.json_response({"ok": True, "run_dir": run.run_dir})

    async def song2daw_run_audio_get(request):
        run_id = request.match_info["run_id"]
        run = SONG2DAW_RUNS.get(run_id)
        if not run:
            return web.json_response({"error": "not_found"}, status=404)

        asset = str(request.query.get("asset") or "mix").strip()
        audio_path = _song2daw_resolve_audio_asset_path(run, asset)
        if not audio_path:
            return web.json_response({"error": "asset_not_found", "asset": asset}, status=404)
        return web.FileResponse(path=audio_path)

    add_route("GET", "/lemouf/loop/list", loop_list)
    add_route("GET", "/lemouf/loop/{loop_id}", loop_get)
    add_route("POST", "/lemouf/loop/create", loop_create)
    add_route("POST", "/lemouf/loop/set_workflow", loop_set_workflow)
    add_route("POST", "/lemouf/loop/step", loop_step)
    add_route("POST", "/lemouf/loop/decision", loop_decision)
    add_route("POST", "/lemouf/loop/overrides", loop_overrides)
    add_route("POST", "/lemouf/loop/config", loop_config)
    add_route("POST", "/lemouf/loop/export_approved", loop_export_approved)
    add_route("POST", "/lemouf/loop/reset", loop_reset)
    add_route("POST", "/lemouf/loop/runtime_state", loop_runtime_state_set)
    add_route("POST", "/lemouf/loop/media_cache", loop_media_cache_upload)
    add_route("GET", "/lemouf/loop/media_cache/{loop_id}/{file_id}", loop_media_cache_get)
    add_route("GET", "/lemouf/workflows/list", workflows_list)
    add_route("POST", "/lemouf/workflows/load", workflows_load)
    add_route("GET", "/lemouf/song2daw/runs", song2daw_runs_list)
    add_route("GET", "/lemouf/song2daw/runs/{run_id}", song2daw_run_get)
    add_route("GET", "/lemouf/song2daw/runs/{run_id}/ui_view", song2daw_run_ui_view_get)
    add_route("GET", "/lemouf/song2daw/runs/{run_id}/audio", song2daw_run_audio_get)
    add_route("POST", "/lemouf/song2daw/runs/clear", song2daw_runs_clear)
    add_route("POST", "/lemouf/song2daw/runs/open", song2daw_run_open)

    PromptServer.instance._lemouf_loop_routes = True


# -------------------------
# Nodes
# -------------------------


class LoopMap:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "map_json": (
                    "STRING",
                    {
                        "default": '{\n  "schema": "lemouf.loopmap.v1",\n  "mappings": []\n}',
                        "multiline": True,
                    },
                )
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("map_json",)
    FUNCTION = "noop"
    CATEGORY = "leMouf/Loop"

    def noop(self, map_json: str):
        return (map_json,)


class LoopPayload:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "payload_json": ("STRING", {"default": "[]", "multiline": True}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("payload",)
    FUNCTION = "noop"
    CATEGORY = "leMouf/Loop"

    def noop(self, payload_json: str):
        value, _err = _parse_json_field(payload_json, "payload")
        return (value if value is not None else [],)


class LoopPipelineStep:
    @classmethod
    def INPUT_TYPES(cls):
        workflows = _list_workflow_files()
        if not workflows:
            workflows = ["(none)"]
        else:
            workflows = ["(none)"] + [name for name in workflows if name != "(none)"]
        return {
            "required": {
                "role": (["generate", "execute", "composition"],),
                "workflow": (workflows,),
            },
            "optional": {
                "resources_json": (
                    "STRING",
                    {"default": "[]", "multiline": True},
                ),
                "flow": ("PIPELINE",),
            },
        }

    RETURN_TYPES = ("PIPELINE",)
    RETURN_NAMES = ("flow",)
    FUNCTION = "noop"
    CATEGORY = "leMouf/Pipeline"

    def noop(self, role: str, workflow: str, resources_json: str = "[]", flow: str = ""):
        return (flow or "",)


class LeMoufWorkflowProfile:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "profile_id": (["song2daw", "generic_loop", "tool", "custom"],),
                "profile_id_custom": ("STRING", {"default": "", "multiline": False}),
                "profile_version": ("STRING", {"default": "0.1.0", "multiline": False}),
                "ui_contract_version": ("STRING", {"default": "1.0.0", "multiline": False}),
                "workflow_kind": (["master", "branch"],),
            },
            "optional": {
                "flow": ("PIPELINE",),
            },
        }

    RETURN_TYPES = ("PIPELINE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("flow", "profile_id", "profile_version", "ui_contract_version", "workflow_kind")
    FUNCTION = "declare"
    CATEGORY = "leMouf/Pipeline"

    def declare(
        self,
        profile_id: str,
        profile_id_custom: str,
        profile_version: str,
        ui_contract_version: str,
        workflow_kind: str,
        flow: str = "",
    ):
        resolved_profile_id = _coalesce_profile_id(profile_id, profile_id_custom) or _WORKFLOW_PROFILE_DEFAULT["profile_id"]
        resolved_profile_version = _normalize_semver(
            profile_version,
            _WORKFLOW_PROFILE_DEFAULT["profile_version"],
        )
        resolved_ui_contract = _normalize_semver(
            ui_contract_version,
            _WORKFLOW_PROFILE_DEFAULT["ui_contract_version"],
        )
        resolved_workflow_kind = _normalize_workflow_kind(
            workflow_kind,
            _WORKFLOW_PROFILE_DEFAULT["workflow_kind"],
        )
        return (flow or "", resolved_profile_id, resolved_profile_version, resolved_ui_contract, resolved_workflow_kind)


class LoopReturn:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "loop_id": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "payload": ("*",),
            },
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("payload",)
    FUNCTION = "put"
    CATEGORY = "leMouf/Loop"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(
        cls,
        loop_id: str,
        payload=None,
    ):
        loop_id = (loop_id or "").strip()
        s = REGISTRY.get(loop_id) if loop_id else None
        if not s:
            return f"{loop_id}"
        return f"{loop_id}|{s.current_cycle}|{s.current_retry}"

    def put(
        self,
        loop_id: str,
        payload=None,
    ):
        _ensure_routes()
        loop_id = _resolve_loop_id(loop_id)
        if not loop_id:
            return (payload,)

        s = REGISTRY.get(loop_id)
        if not s:
            return (payload,)

        cycle_index = s.current_cycle
        retry_index = s.current_retry
        prompt_id = None
        if get_executing_context is not None:
            ctx = get_executing_context()
            prompt_id = getattr(ctx, "prompt_id", None) if ctx else None
        outputs = _extract_outputs(payload, loop_id, cycle_index, retry_index)
        if s.payload is None and isinstance(outputs.get("json"), list):
            s.payload = outputs.get("json")

        entry = None
        if prompt_id:
            entry = _update_manifest_by_prompt(
                loop_id,
                prompt_id,
                status="returned",
                outputs=outputs,
            )
        if not entry:
            entry = REGISTRY.update_manifest(
                loop_id,
                cycle_index,
                retry_index,
                status="returned",
                outputs=outputs,
            )
        if not entry:
            entry = _update_latest_pending(
                loop_id,
                cycle_index,
                retry_index,
                status="returned",
                outputs=outputs,
            )
        if not entry:
            REGISTRY.add_manifest(
                loop_id,
                LoopManifestEntry(
                    cycle_index=cycle_index,
                    retry_index=retry_index,
                    status="returned",
                    prompt_id=prompt_id,
                    outputs=outputs,
                ),
            )
        _sync_loop_runtime_from_manifest(s)
        return (payload,)


class Song2DawRun:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio_path": ("STRING", {"default": "", "multiline": False}),
                "stems_dir": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "step_configs_json": ("STRING", {"default": "{}", "multiline": True}),
                "model_versions_json": ("STRING", {"default": "{}", "multiline": True}),
                "output_dir": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("songgraph_json", "artifacts_json", "run_json", "run_dir")
    FUNCTION = "run"
    CATEGORY = "leMouf/song2daw"

    def run(
        self,
        audio_path: str,
        stems_dir: str,
        step_configs_json: str = "{}",
        model_versions_json: str = "{}",
        output_dir: str = "",
    ):
        from features.song2daw.core.runner import run_default_song2daw_pipeline, save_run_outputs

        step_configs, step_configs_error = _parse_json_field(step_configs_json, "step_configs")
        if step_configs_error:
            raise ValueError(step_configs_error)
        model_versions, model_versions_error = _parse_json_field(model_versions_json, "model_versions")
        if model_versions_error:
            raise ValueError(model_versions_error)

        if step_configs is None:
            step_configs = {}
        if model_versions is None:
            model_versions = {}

        if not isinstance(step_configs, dict):
            raise ValueError("step_configs must be a JSON object")
        if not isinstance(model_versions, dict):
            raise ValueError("model_versions must be a JSON object")

        run_id = str(uuid.uuid4())
        run_dir = ""
        try:
            result = run_default_song2daw_pipeline(
                audio_path=audio_path,
                stems_dir=stems_dir,
                step_configs=step_configs,
                model_versions=model_versions,
            )
            target_output_dir = ""
            if isinstance(output_dir, str) and output_dir.strip():
                target_output_dir = output_dir.strip()
            elif PromptServer is not None:
                try:
                    import folder_paths

                    target_output_dir = os.path.join(
                        folder_paths.get_output_directory(),
                        "lemouf",
                        "song2daw",
                    )
                except Exception:
                    target_output_dir = ""

            if target_output_dir:
                run_dir = str(save_run_outputs(result, target_output_dir))

            SONG2DAW_RUNS.add(
                Song2DawRunState(
                    run_id=run_id,
                    status="ok",
                    audio_path=audio_path,
                    stems_dir=stems_dir,
                    step_configs=step_configs,
                    model_versions=model_versions,
                    run_dir=run_dir,
                    summary=_song2daw_run_summary(result),
                    result=result,
                )
            )
        except Exception as exc:
            SONG2DAW_RUNS.add(
                Song2DawRunState(
                    run_id=run_id,
                    status="error",
                    audio_path=audio_path,
                    stems_dir=stems_dir,
                    step_configs=step_configs,
                    model_versions=model_versions,
                    run_dir=run_dir,
                    summary={},
                    result={},
                    error=str(exc),
                )
            )
            raise

        songgraph_json = json.dumps(result.get("songgraph", {}), indent=2, sort_keys=True)
        artifacts_json = json.dumps(result.get("artifacts", {}), indent=2, sort_keys=True)
        run_json = json.dumps(result, indent=2, sort_keys=True)
        return (songgraph_json, artifacts_json, run_json, run_dir)


NODE_CLASS_MAPPINGS = {
    "LoopMap": LoopMap,
    "LoopPayload": LoopPayload,
    "LoopPipelineStep": LoopPipelineStep,
    "LeMoufWorkflowProfile": LeMoufWorkflowProfile,
    "LoopReturn": LoopReturn,
    "Song2DawRun": Song2DawRun,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoopMap": "Loop Map (leMouf)",
    "LoopPayload": "Loop Payload (leMouf)",
    "LoopPipelineStep": "Loop Pipeline Step (leMouf)",
    "LeMoufWorkflowProfile": "Workflow Profile (leMouf)",
    "LoopReturn": "Loop Return (leMouf)",
    "Song2DawRun": "song2daw Run (leMouf)",
}

# Register routes on import so the UI can call the API without running a node first.
try:  # pragma: no cover - runtime guard
    _ensure_routes()
except Exception as exc:
    _log(f"Failed to register routes: {exc}")
