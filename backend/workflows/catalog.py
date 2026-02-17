from __future__ import annotations

import json
import os
from typing import Any, Dict, List


def is_feature_scoped_workflow_name(name: str) -> bool:
    raw = str(name or "").strip()
    if not raw:
        return False
    normalized = raw.replace("\\", "/").strip("/")
    parts = [part for part in normalized.split("/") if part]
    if len(parts) < 2:
        return False
    if any(part in {".", ".."} for part in parts):
        return False
    return parts[-1].lower().endswith(".json")


def list_workflow_files(folder: str) -> List[str]:
    root = str(folder or "").strip()
    if not root or not os.path.isdir(root):
        return []
    files: List[str] = []
    for current_root, _dirs, names in os.walk(root):
        for name in names:
            if not name.lower().endswith(".json"):
                continue
            full = os.path.join(current_root, name)
            if not os.path.isfile(full):
                continue
            rel = os.path.relpath(full, root).replace("\\", "/")
            if is_feature_scoped_workflow_name(rel):
                files.append(rel)
    return sorted(files)


def load_workflow_file(name: str, folder: str) -> Dict[str, Any]:
    raw = str(name or "").strip()
    if not raw:
        raise RuntimeError("invalid_name")
    normalized = raw.replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("./") or normalized.startswith("../"):
        raise RuntimeError("invalid_name")
    parts = [part for part in normalized.split("/") if part and part != "."]
    if not parts or any(part == ".." for part in parts):
        raise RuntimeError("invalid_name")
    if len(parts) < 2:
        raise RuntimeError("invalid_name")
    joined = "/".join(parts)
    if not is_feature_scoped_workflow_name(joined):
        raise RuntimeError("invalid_name")

    root = os.path.realpath(str(folder or ""))
    full = os.path.realpath(os.path.join(root, *parts))
    root_prefix = root if root.endswith(os.sep) else root + os.sep
    if not (full == root or full.startswith(root_prefix)):
        raise RuntimeError("invalid_name")
    if not os.path.isfile(full):
        raise RuntimeError("not_found")
    with open(full, "r", encoding="utf-8") as handle:
        return json.load(handle)

