from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from backend.loop.runtime_state import LoopRuntimeStateStore


def _case_path() -> Path:
    base = Path(__file__).resolve().parent / "_tmp_runtime_state"
    base.mkdir(parents=True, exist_ok=True)
    case_dir = base / f"case_{uuid.uuid4().hex}"
    case_dir.mkdir(parents=True, exist_ok=True)
    return case_dir / "runtime_state.json"


def _cleanup_case(path: Path) -> None:
    try:
        shutil.rmtree(path.parent, ignore_errors=True)
    except Exception:
        pass


def test_runtime_state_store_persists_and_restores():
    state_path = _case_path()
    store = LoopRuntimeStateStore(str(state_path), max_entries=8)

    payload = {
        "loopId": "loop-a",
        "steps": [{"id": "s1", "role": "composition", "stepIndex": 0}],
        "uiState": {"dockVisible": True},
    }
    saved = store.set("loop-a", payload)
    assert isinstance(saved, dict)

    restored = store.get("loop-a")
    assert isinstance(restored, dict)
    assert restored["loopId"] == "loop-a"
    assert restored["steps"][0]["id"] == "s1"
    assert "updated_at" in restored

    reloaded = LoopRuntimeStateStore(str(state_path), max_entries=8)
    restored_after_reload = reloaded.get("loop-a")
    assert isinstance(restored_after_reload, dict)
    assert restored_after_reload["loopId"] == "loop-a"
    assert restored_after_reload["uiState"]["dockVisible"] is True
    _cleanup_case(state_path)


def test_runtime_state_store_clear():
    state_path = _case_path()
    store = LoopRuntimeStateStore(str(state_path), max_entries=8)
    store.set("loop-a", {"loopId": "loop-a"})
    assert store.get("loop-a") is not None

    assert store.clear("loop-a") is True
    assert store.get("loop-a") is None
    assert store.clear("loop-a") is False
    _cleanup_case(state_path)


def test_runtime_state_store_prunes_oldest():
    state_path = _case_path()
    store = LoopRuntimeStateStore(str(state_path), max_entries=2)
    store.set("loop-a", {"loopId": "loop-a"})
    store.set("loop-b", {"loopId": "loop-b"})
    store.set("loop-c", {"loopId": "loop-c"})

    # loop-a should be pruned because max_entries=2
    assert store.get("loop-a") is None
    assert store.get("loop-b") is not None
    assert store.get("loop-c") is not None
    _cleanup_case(state_path)
