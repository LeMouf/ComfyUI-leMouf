"""
ComfyUI-leMouf nodes.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

try:
    from server import PromptServer
    from aiohttp import web
    import execution
    try:
        from comfy_execution.utils import get_executing_context
    except Exception:
        get_executing_context = None  # type: ignore
except Exception:  # pragma: no cover - ComfyUI runtime only
    PromptServer = None  # type: ignore
    web = None  # type: ignore
    execution = None  # type: ignore
    get_executing_context = None  # type: ignore


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

    def create_or_get(self, loop_id: Optional[str] = None) -> LoopState:
        with self._lock:
            if loop_id and loop_id in self._loops:
                return self._loops[loop_id]
            new_id = loop_id or str(uuid.uuid4())
            state = LoopState(loop_id=new_id)
            self._loops[new_id] = state
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


def _list_workflow_files() -> List[str]:
    folder = _workflows_dir()
    if not os.path.isdir(folder):
        return []
    files = []
    for name in os.listdir(folder):
        if not name.lower().endswith(".json"):
            continue
        full = os.path.join(folder, name)
        if os.path.isfile(full):
            files.append(name)
    return sorted(files)


def _load_workflow_file(name: str) -> Dict[str, Any]:
    safe = os.path.basename(name or "")
    if not safe or safe != name:
        raise RuntimeError("invalid_name")
    full = os.path.join(_workflows_dir(), safe)
    if not os.path.isfile(full):
        raise RuntimeError("not_found")
    with open(full, "r", encoding="utf-8") as handle:
        return json.load(handle)


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
        return web.json_response({"loops": loops})

    async def loop_get(request):
        loop_id = request.match_info["loop_id"]
        s = REGISTRY.get(loop_id)
        if not s:
            return web.json_response({"error": "not_found"}, status=404)
        return web.json_response(
            {
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
            }
        )

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
        decision = payload.get("decision")
        if not loop_id or cycle_index < 0:
            return web.json_response({"error": "invalid_payload"}, status=400)
        REGISTRY.update_manifest(loop_id, cycle_index, retry_index, decision=decision)
        s = REGISTRY.get(loop_id)
        if s:
            if decision in ("replay", "reject"):
                s.current_retry = retry_index + 1
            else:
                s.current_retry = 0
                s.current_cycle = cycle_index + 1
            s.status = "complete" if s.total_cycles and s.current_cycle >= s.total_cycles else "idle"
        return web.json_response({"ok": True})

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
        return web.json_response({"ok": True})

    async def workflows_list(_request):
        folder = _workflows_dir()
        files = _list_workflow_files()
        return web.json_response(
            {
                "workflows": files,
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
        return web.json_response({"ok": True, "workflow": workflow, "name": name})

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
    add_route("GET", "/lemouf/workflows/list", workflows_list)
    add_route("POST", "/lemouf/workflows/load", workflows_load)

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
        return {
            "required": {
                "role": (["generate", "execute"],),
                "workflow": (workflows,),
            },
            "optional": {
                "flow": ("PIPELINE",),
            },
        }

    RETURN_TYPES = ("PIPELINE",)
    RETURN_NAMES = ("flow",)
    FUNCTION = "noop"
    CATEGORY = "leMouf/Pipeline"

    def noop(self, role: str, workflow: str, flow: str = ""):
        return (flow or "",)


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
        return (payload,)


NODE_CLASS_MAPPINGS = {
    "LoopMap": LoopMap,
    "LoopPayload": LoopPayload,
    "LoopPipelineStep": LoopPipelineStep,
    "LoopReturn": LoopReturn,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoopMap": "Loop Map (leMouf)",
    "LoopPayload": "Loop Payload (leMouf)",
    "LoopPipelineStep": "Loop Pipeline Step (leMouf)",
    "LoopReturn": "Loop Return (leMouf)",
}

# Register routes on import so the UI can call the API without running a node first.
try:  # pragma: no cover - runtime guard
    _ensure_routes()
except Exception:
    pass
