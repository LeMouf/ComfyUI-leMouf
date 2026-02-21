"""Local persisted runtime state for loop/composition UI sessions."""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Dict, Optional


def _json_clone(value: Any, fallback: Any) -> Any:
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback


class LoopRuntimeStateStore:
    """Thread-safe, repo-local JSON store keyed by loop_id."""

    def __init__(self, path: str, max_entries: int = 100) -> None:
        self._path = os.path.realpath(path)
        self._max_entries = max(1, int(max_entries or 1))
        self._lock = threading.Lock()
        self._states: Dict[str, Dict[str, Any]] = {}
        self._seq = 0
        self._load_locked()

    def _load_locked(self) -> None:
        with self._lock:
            self._states = {}
            if not os.path.isfile(self._path):
                return
            try:
                with open(self._path, "r", encoding="utf-8") as fh:
                    payload = json.load(fh)
            except Exception:
                return
            if not isinstance(payload, dict):
                return
            raw_states = payload.get("states")
            if not isinstance(raw_states, dict):
                return
            now = float(time.time())
            seq_cursor = 0
            for raw_loop_id, raw_state in raw_states.items():
                loop_id = str(raw_loop_id or "").strip()
                if not loop_id or not isinstance(raw_state, dict):
                    continue
                state = _json_clone(raw_state, {})
                if not isinstance(state, dict):
                    continue
                state["updated_at"] = float(state.get("updated_at") or now)
                seq_cursor += 1
                stored_seq = int(state.get("updated_seq") or seq_cursor)
                state["updated_seq"] = max(1, stored_seq)
                if state["updated_seq"] > self._seq:
                    self._seq = state["updated_seq"]
                self._states[loop_id] = state
            self._prune_locked()

    def _persist_locked(self) -> None:
        folder = os.path.dirname(self._path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        payload = {
            "version": 1,
            "saved_at": time.time(),
            "states": self._states,
        }
        tmp_path = f"{self._path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=True, sort_keys=True, indent=2)
        try:
            os.replace(tmp_path, self._path)
        except PermissionError:
            # Windows sandbox/workspace ACLs can deny atomic replace in some setups.
            with open(self._path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=True, sort_keys=True, indent=2)
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    def _prune_locked(self) -> None:
        if len(self._states) <= self._max_entries:
            return
        ordered = sorted(
            self._states.items(),
            key=lambda item: (
                float((item[1] or {}).get("updated_at") or 0.0),
                int((item[1] or {}).get("updated_seq") or 0),
                str(item[0] or ""),
            ),
            reverse=True,
        )
        keep = dict(ordered[: self._max_entries])
        self._states = keep

    def get(self, loop_id: str) -> Optional[Dict[str, Any]]:
        key = str(loop_id or "").strip()
        if not key:
            return None
        with self._lock:
            state = self._states.get(key)
            if not isinstance(state, dict):
                return None
            return _json_clone(state, None)

    def set(self, loop_id: str, runtime_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        key = str(loop_id or "").strip()
        if not key or not isinstance(runtime_state, dict):
            return None
        cloned = _json_clone(runtime_state, None)
        if not isinstance(cloned, dict):
            return None
        with self._lock:
            cloned["updated_at"] = float(time.time())
            self._seq += 1
            cloned["updated_seq"] = int(self._seq)
            self._states[key] = cloned
            self._prune_locked()
            self._persist_locked()
            return _json_clone(cloned, None)

    def clear(self, loop_id: str) -> bool:
        key = str(loop_id or "").strip()
        if not key:
            return False
        with self._lock:
            if key not in self._states:
                return False
            self._states.pop(key, None)
            self._persist_locked()
            return True
