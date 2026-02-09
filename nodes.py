"""
ComfyUI-leMouf nodes.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
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
    info: Optional[str] = None
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
            if not keep_workflow:
                state.workflow = None
                state.workflow_meta = None
                state.workflow_source = "path"
                state.overrides = {}
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


def _parse_overrides(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


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


def _run_async(coro):
    if PromptServer is None:
        raise RuntimeError("PromptServer not available")
    loop = PromptServer.instance.loop
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None
    if running_loop and running_loop == loop:
        raise RuntimeError("Cannot block the running event loop")
    if loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, loop).result()
    return asyncio.get_event_loop().run_until_complete(coro)


def _enqueue_workflow(workflow: Dict[str, Any], loop_id: str) -> Tuple[Optional[str], Optional[str]]:
    if PromptServer is None:
        return None, "PromptServer not available"

    prompt_id = str(uuid.uuid4())
    ps = PromptServer.instance

    try:
        # Accept either a raw prompt dict or a wrapper containing "prompt"
        prompt = workflow.get("prompt") if isinstance(workflow, dict) and "prompt" in workflow else workflow
        if execution is None:
            return None, "Execution module not available"

        valid, err, outputs_to_execute, node_errors = _run_async(
            execution.validate_prompt(prompt_id, prompt, None)
        )
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


def _save_images(
    images,
    loop_id: str,
    cycle_index: int,
    retry_index: int,
) -> List[Dict[str, Any]]:
    try:
        import numpy as np
        from PIL import Image
        import folder_paths
    except Exception as exc:
        raise RuntimeError(f"Image save dependencies missing: {exc}") from exc

    output_dir = folder_paths.get_output_directory()
    prefix = f"lemouf_loop/{loop_id}/cycle_{cycle_index:04}_r{retry_index:02}"
    full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        prefix, output_dir, images[0].shape[1], images[0].shape[0]
    )

    results: List[Dict[str, Any]] = []
    for batch_number, image in enumerate(images):
        i = 255.0 * image.cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
        file = f"{filename_with_batch_num}_{counter:05}_.png"
        img.save(os.path.join(full_output_folder, file))
        results.append({"filename": file, "subfolder": subfolder, "type": "output"})
        counter += 1

    return results


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
        REGISTRY.set_workflow(loop_id, prompt, "ui", workflow_meta=workflow_meta if isinstance(workflow_meta, dict) else None)
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

        wf = _apply_overrides(s.workflow, s.overrides)
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

    PromptServer.instance._lemouf_loop_routes = True


# -------------------------
# Nodes
# -------------------------


class WorkflowLoopOrchestrator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "workflow_source": (["path", "ui"], {"default": "path"}),
                "workflow_path": ("STRING", {"default": "", "multiline": False}),
                "cycles": ("INT", {"default": 1, "min": 1, "max": 100000}),
                "mode": (["interactive", "batch", "end"], {"default": "interactive"}),
                "overrides_json": ("STRING", {"default": "", "multiline": True}),
                "loop_id": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "autostart": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("loop_id", "status", "cycle_index", "total_cycles")
    FUNCTION = "run"
    CATEGORY = "leMouf/Loop"

    def run(
        self,
        workflow_source: str,
        workflow_path: str,
        cycles: int,
        mode: str,
        overrides_json: str,
        loop_id: str,
        autostart: bool = False,
    ):
        _ensure_routes()
        loop_id = loop_id.strip() or None
        state = REGISTRY.create_or_get(loop_id)
        overrides = _parse_overrides(overrides_json)
        REGISTRY.update(
            state.loop_id,
            total_cycles=int(cycles),
            mode=mode,
            overrides=overrides,
            workflow_source=workflow_source,
        )

        if workflow_source == "path" and workflow_path:
            try:
                with open(workflow_path, "r", encoding="utf-8") as f:
                    workflow = json.load(f)
                REGISTRY.set_workflow(state.loop_id, workflow, "path")
            except Exception as exc:
                REGISTRY.update(state.loop_id, status="error", last_error=str(exc))
        elif workflow_source == "ui":
            # workflow must be provided via UI endpoint
            pass

        # MVP: autostart is best-effort (queues a first cycle)
        if autostart:
            s = REGISTRY.get(state.loop_id)
            if s and s.workflow:
                s.current_cycle = 0
                s.current_retry = 0
                s.status = "running"
                wf = _apply_overrides(s.workflow, s.overrides)
                prompt_id, err = _enqueue_workflow(wf, s.loop_id)
                if err:
                    s.status = "error"
                    s.last_error = err
                else:
                    REGISTRY.add_manifest(
                        s.loop_id,
                        LoopManifestEntry(
                            cycle_index=0,
                            retry_index=0,
                            status="queued",
                            prompt_id=prompt_id,
                        ),
                    )

        s = REGISTRY.get(state.loop_id)
        status = s.status if s else "unknown"
        cycle_index = s.current_cycle if s else 0
        total_cycles = s.total_cycles if s else cycles
        return (state.loop_id, status, cycle_index, total_cycles)


class LoopContext:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"loop_id": ("STRING", {"default": "", "multiline": False})},
            "optional": {
                "base_seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "seed_mode": (["cycle", "cycle+retry", "hash"], {"default": "cycle+retry"}),
            },
        }

    RETURN_TYPES = ("STRING", "INT", "INT", "BOOLEAN", "INT", "INT")
    RETURN_NAMES = ("loop_id", "cycle_index", "retry_index", "is_retry", "total_cycles", "seed")
    FUNCTION = "get"
    CATEGORY = "leMouf/Loop"

    @classmethod
    def IS_CHANGED(cls, loop_id: str, base_seed: int = 0, seed_mode: str = "cycle+retry"):
        loop_id = (loop_id or "").strip()
        s = REGISTRY.get(loop_id)
        if not s:
            return f"{loop_id}|0|0|{base_seed}|{seed_mode}"
        return f"{loop_id}|{s.current_cycle}|{s.current_retry}|{base_seed}|{seed_mode}"

    def _calc_seed(self, loop_id: str, cycle_index: int, retry_index: int, base_seed: int, mode: str) -> int:
        if mode == "hash":
            payload = f"{loop_id}|{cycle_index}|{retry_index}|{base_seed}".encode("utf-8")
            digest = hashlib.sha256(payload).hexdigest()
            return int(digest[:16], 16)
        if mode == "cycle":
            return (base_seed + cycle_index) & 0xFFFFFFFFFFFFFFFF
        return (base_seed + (cycle_index * 100000) + retry_index) & 0xFFFFFFFFFFFFFFFF

    def get(self, loop_id: str, base_seed: int = 0, seed_mode: str = "cycle+retry"):
        _ensure_routes()
        loop_id = (loop_id or "").strip()
        if not loop_id:
            seed = self._calc_seed("", 0, 0, base_seed, seed_mode)
            return ("", 0, 0, False, 0, seed)
        s = REGISTRY.get(loop_id)
        if not s:
            seed = self._calc_seed(loop_id, 0, 0, base_seed, seed_mode)
            return (loop_id, 0, 0, False, 0, seed)
        seed = self._calc_seed(loop_id, s.current_cycle, s.current_retry, base_seed, seed_mode)
        return (loop_id, s.current_cycle, s.current_retry, s.current_retry > 0, s.total_cycles, seed)


class LoopReturn:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "loop_id": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "cycle_index": ("INT", {"default": -1, "min": -1, "max": 100000}),
                "retry_index": ("INT", {"default": -1, "min": -1, "max": 100000}),
                "info": ("STRING", {"default": "", "multiline": True}),
                "images": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("info",)
    FUNCTION = "put"
    CATEGORY = "leMouf/Loop"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(
        cls,
        loop_id: str,
        cycle_index: int = -1,
        retry_index: int = -1,
        info: str = "",
        images=None,
    ):
        loop_id = (loop_id or "").strip()
        s = REGISTRY.get(loop_id) if loop_id else None
        if not s:
            return f"{loop_id}|{cycle_index}|{retry_index}|{info}"
        return f"{loop_id}|{s.current_cycle}|{s.current_retry}|{cycle_index}|{retry_index}"

    def put(
        self,
        loop_id: str,
        cycle_index: int = -1,
        retry_index: int = -1,
        info: str = "",
        images=None,
    ):
        _ensure_routes()
        loop_id = _resolve_loop_id(loop_id)
        if not loop_id:
            return (info,)

        s = REGISTRY.get(loop_id)
        if not s:
            return (info,)

        if cycle_index < 0:
            cycle_index = s.current_cycle
        if retry_index < 0:
            retry_index = s.current_retry
        prompt_id = None
        if get_executing_context is not None:
            ctx = get_executing_context()
            prompt_id = getattr(ctx, "prompt_id", None) if ctx else None
        outputs: Dict[str, Any] = {}
        if images is not None:
            try:
                outputs["images"] = _save_images(images, loop_id, cycle_index, retry_index)
            except Exception as exc:
                outputs["save_error"] = str(exc)

        entry = None
        if prompt_id:
            entry = _update_manifest_by_prompt(
                loop_id,
                prompt_id,
                status="returned",
                info=info,
                outputs=outputs,
            )
        if not entry:
            entry = REGISTRY.update_manifest(
                loop_id,
                cycle_index,
                retry_index,
                status="returned",
                info=info,
                outputs=outputs,
            )
        if not entry:
            entry = _update_latest_pending(
                loop_id,
                cycle_index,
                retry_index,
                status="returned",
                info=info,
                outputs=outputs,
            )
        if not entry:
            REGISTRY.add_manifest(
                loop_id,
                LoopManifestEntry(
                    cycle_index=cycle_index,
                    retry_index=retry_index,
                    status="returned",
                    info=info,
                    prompt_id=prompt_id,
                    outputs=outputs,
                ),
            )
        return (info,)


NODE_CLASS_MAPPINGS = {
    "WorkflowLoopOrchestrator": WorkflowLoopOrchestrator,
    "LoopContext": LoopContext,
    "LoopReturn": LoopReturn,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "WorkflowLoopOrchestrator": "Workflow Loop Orchestrator (leMouf)",
    "LoopContext": "Loop Context (leMouf)",
    "LoopReturn": "Loop Return (leMouf)",
}

# Register routes on import so the UI can call the API without running a node first.
try:  # pragma: no cover - runtime guard
    _ensure_routes()
except Exception:
    pass
