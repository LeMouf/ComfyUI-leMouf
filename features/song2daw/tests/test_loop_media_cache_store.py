from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from backend.loop.media_cache import LoopMediaCacheStore


def _case_dir() -> Path:
    base = Path(__file__).resolve().parent / "_tmp_media_cache"
    base.mkdir(parents=True, exist_ok=True)
    case_dir = base / f"case_{uuid.uuid4().hex}"
    case_dir.mkdir(parents=True, exist_ok=True)
    return case_dir


def _cleanup_case(path: Path) -> None:
    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass


def test_media_cache_store_persists_and_resolves_file():
    case_dir = _case_dir()
    store = LoopMediaCacheStore(str(case_dir), max_files_per_loop=8, max_file_bytes=1024 * 1024)
    payload = b"hello-world-media"
    saved = store.store("loop-a", "clip.mp4", "video/mp4", payload)
    assert isinstance(saved, dict)
    assert saved["loop_id"] == "loop-a"
    assert saved["size"] == len(payload)
    assert str(saved["file_id"]).endswith("clip.mp4")

    resolved = store.resolve("loop-a", saved["file_id"])
    assert resolved is not None
    path = Path(resolved)
    assert path.is_file()
    assert path.read_bytes() == payload
    _cleanup_case(case_dir)


def test_media_cache_store_rejects_oversized_payload():
    case_dir = _case_dir()
    store = LoopMediaCacheStore(str(case_dir), max_files_per_loop=8, max_file_bytes=8)
    saved = store.store("loop-a", "clip.wav", "audio/wav", b"0123456789")
    assert saved is None
    _cleanup_case(case_dir)


def test_media_cache_store_clear_loop():
    case_dir = _case_dir()
    store = LoopMediaCacheStore(str(case_dir), max_files_per_loop=8, max_file_bytes=1024 * 1024)
    saved = store.store("loop-z", "asset.png", "image/png", b"123")
    assert isinstance(saved, dict)
    assert store.resolve("loop-z", saved["file_id"]) is not None
    assert store.clear_loop("loop-z") is True
    assert store.resolve("loop-z", saved["file_id"]) is None
    _cleanup_case(case_dir)
