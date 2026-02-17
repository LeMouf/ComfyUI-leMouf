from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Set

LEVEL_MINOR = "minor"
LEVEL_MEDIUM = "medium"
LEVEL_MAJOR = "major"
VALID_LEVELS = {LEVEL_MINOR, LEVEL_MEDIUM, LEVEL_MAJOR}
SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")

ROOT = Path(__file__).resolve().parents[2]
FEATURES_FILE = ROOT / "feature_versions.json"
REQUEST_FILE = ROOT / ".feature_bump_next.json"


def parse_semver(value: str) -> tuple[int, int, int]:
    match = SEMVER_RE.match(str(value or "").strip())
    if not match:
        raise ValueError(f"invalid semver: {value!r}")
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def format_semver(parts: tuple[int, int, int]) -> str:
    major, medium, minor = parts
    return f"{major}.{medium}.{minor}"


def bump_semver(version: str, level: str) -> str:
    major, medium, minor = parse_semver(version)
    if level == LEVEL_MINOR:
        minor += 1
    elif level == LEVEL_MEDIUM:
        medium += 1
        minor = 0
    elif level == LEVEL_MAJOR:
        major += 1
        medium = 0
        minor = 0
    else:
        raise ValueError(f"unsupported bump level: {level}")
    return format_semver((major, medium, minor))


def read_json(path: Path) -> Mapping[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Mapping[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_feature_versions() -> MutableMapping[str, object]:
    return dict(read_json(FEATURES_FILE))


def save_feature_versions(payload: Mapping[str, object]) -> None:
    write_json(FEATURES_FILE, payload)


def feature_map(payload: Mapping[str, object]) -> MutableMapping[str, MutableMapping[str, object]]:
    features = payload.get("features")
    if not isinstance(features, MutableMapping):
        raise RuntimeError("feature_versions.json: missing 'features' object")
    out: MutableMapping[str, MutableMapping[str, object]] = {}
    for key, value in features.items():
        if isinstance(value, MutableMapping):
            out[str(key)] = value
    return out


def normalize_path(value: str) -> str:
    return str(value or "").replace("\\", "/").lstrip("./")


def path_matches_prefix(path: str, prefix: str) -> bool:
    p = normalize_path(path)
    pref = normalize_path(prefix)
    if not pref:
        return False
    if pref.endswith("/"):
        return p.startswith(pref)
    return p == pref or p.startswith(pref + "/")


def match_features_for_paths(payload: Mapping[str, object], changed_paths: Iterable[str]) -> List[str]:
    fmap = feature_map(payload)
    changed = [normalize_path(item) for item in changed_paths if str(item or "").strip()]
    matched: Set[str] = set()
    for feature_name, meta in fmap.items():
        prefixes = meta.get("paths")
        if not isinstance(prefixes, list):
            continue
        for file_path in changed:
            if any(path_matches_prefix(file_path, str(prefix)) for prefix in prefixes):
                matched.add(feature_name)
                break
    return sorted(matched)


def bump_features(
    payload: MutableMapping[str, object],
    features: Iterable[str],
    levels_by_feature: Mapping[str, str] | None = None,
    default_level: str = LEVEL_MINOR,
) -> Dict[str, str]:
    fmap = feature_map(payload)
    levels = levels_by_feature or {}
    updated: Dict[str, str] = {}
    for name in sorted(set(str(item) for item in features)):
        meta = fmap.get(name)
        if not isinstance(meta, MutableMapping):
            continue
        current = str(meta.get("version") or "").strip()
        if not current:
            continue
        level = str(levels.get(name) or default_level).lower()
        if level not in VALID_LEVELS:
            level = default_level
        next_version = bump_semver(current, level)
        meta["version"] = next_version
        updated[name] = next_version
    return updated


def read_feature_requests() -> Dict[str, str]:
    if not REQUEST_FILE.exists():
        return {}
    raw = read_json(REQUEST_FILE)
    out: Dict[str, str] = {}
    if not isinstance(raw, Mapping):
        return out
    requests = raw.get("requests")
    if not isinstance(requests, Mapping):
        return out
    for key, value in requests.items():
        level = str(value or "").strip().lower()
        if level in VALID_LEVELS:
            out[str(key)] = level
    return out


def write_feature_requests(requests: Mapping[str, str]) -> None:
    clean = {
        str(key): str(value).strip().lower()
        for key, value in requests.items()
        if str(value).strip().lower() in VALID_LEVELS
    }
    if not clean:
        clear_feature_requests()
        return
    payload = {"requests": clean}
    write_json(REQUEST_FILE, payload)


def clear_feature_requests() -> None:
    if REQUEST_FILE.exists():
        REQUEST_FILE.unlink()


def set_feature_request(feature: str, level: str) -> None:
    level_n = str(level or "").strip().lower()
    if level_n not in VALID_LEVELS:
        raise ValueError(f"invalid level: {level}")
    requests = read_feature_requests()
    requests[str(feature)] = level_n
    write_feature_requests(requests)


def get_staged_paths() -> List[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def stage_feature_file() -> None:
    subprocess.run(["git", "add", "feature_versions.json"], cwd=ROOT, check=True)


def request_level_for_all(level: str, payload: Mapping[str, object]) -> None:
    if level not in {LEVEL_MAJOR, LEVEL_MEDIUM}:
        raise ValueError("global feature request supports only medium/major")
    names = sorted(feature_map(payload).keys())
    write_feature_requests({name: level for name in names})
