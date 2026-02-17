from __future__ import annotations

import datetime as _dt
import re
import subprocess
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Sequence

from features.tools import feature_versioning

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_FILE = ROOT / "FEATURE_CHANGELOG.md"

CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?: (?P<subject>.+)$"
)


def parse_conventional_header(subject: str) -> Dict[str, str] | None:
    text = str(subject or "").strip()
    match = CONVENTIONAL_RE.match(text)
    if not match:
        return None
    return {
        "type": str(match.group("type") or "").strip().lower(),
        "scope": str(match.group("scope") or "").strip().lower(),
        "subject": str(match.group("subject") or "").strip(),
        "breaking": "!" if match.group("breaking") else "",
    }


def normalize_scope(scope: str) -> str:
    return str(scope or "").strip().lower().replace("\\", "/")


def build_scope_aliases(features_payload: Mapping[str, object]) -> Dict[str, str]:
    fmap = feature_versioning.feature_map(features_payload)
    aliases: Dict[str, str] = {}
    for name, meta in fmap.items():
        aliases[name] = name
        extra = meta.get("scopes")
        if isinstance(extra, list):
            for item in extra:
                alias = normalize_scope(str(item))
                if alias:
                    aliases[alias] = name
    return aliases


def resolve_feature_from_scope(scope: str, aliases: Mapping[str, str]) -> str | None:
    value = normalize_scope(scope)
    if not value:
        return None
    if value in aliases:
        return aliases[value]
    if "/" in value:
        head = value.split("/", 1)[0]
        if head in aliases:
            return aliases[head]
    if "_" in value:
        head = value.split("_", 1)[0]
        if head in aliases:
            return aliases[head]
    if "-" in value:
        head = value.split("-", 1)[0]
        if head in aliases:
            return aliases[head]
    return None


def get_git_log_entries(limit: int = 400) -> List[Dict[str, str]]:
    fmt = "%H%x1f%cs%x1f%s"
    result = subprocess.run(
        ["git", "log", f"-n{int(limit)}", f"--pretty=format:{fmt}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    out: List[Dict[str, str]] = []
    for line in result.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) != 3:
            continue
        commit_hash, date_iso, subject = parts
        out.append(
            {
                "hash": commit_hash.strip(),
                "date": date_iso.strip(),
                "subject": subject.strip(),
            }
        )
    return out


def group_entries_by_feature(
    commits: Sequence[Mapping[str, str]],
    features_payload: Mapping[str, object],
) -> Dict[str, List[Dict[str, str]]]:
    fmap = feature_versioning.feature_map(features_payload)
    by_feature: Dict[str, List[Dict[str, str]]] = {name: [] for name in fmap.keys()}
    aliases = build_scope_aliases(features_payload)

    for item in commits:
        parsed = parse_conventional_header(str(item.get("subject") or ""))
        if not parsed:
            continue
        feature = resolve_feature_from_scope(parsed.get("scope", ""), aliases)
        if not feature:
            continue
        if feature not in by_feature:
            continue
        by_feature[feature].append(
            {
                "hash": str(item.get("hash") or ""),
                "date": str(item.get("date") or ""),
                "type": parsed["type"],
                "scope": parsed["scope"],
                "subject": parsed["subject"],
                "breaking": parsed["breaking"],
                "raw": str(item.get("subject") or ""),
            }
        )
    return by_feature


def trim_entries(by_feature: Mapping[str, Sequence[Mapping[str, str]]], max_entries: int) -> Dict[str, List[Dict[str, str]]]:
    limit = max(1, int(max_entries))
    out: Dict[str, List[Dict[str, str]]] = {}
    for key, entries in by_feature.items():
        out[str(key)] = [dict(item) for item in list(entries)[:limit]]
    return out


def render_feature_changelog(
    features_payload: Mapping[str, object],
    by_feature: Mapping[str, Sequence[Mapping[str, str]]],
) -> str:
    fmap = feature_versioning.feature_map(features_payload)
    generated = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: List[str] = [
        "# Feature Changelog",
        "",
        "_Auto-generated from git history using Conventional Commit scopes._",
        f"_Generated: {generated}_",
        "",
    ]
    for feature in sorted(fmap.keys()):
        meta = fmap[feature]
        version = str(meta.get("version") or "").strip()
        lines.append(f"## {feature} ({version})")
        entries = list(by_feature.get(feature, []))
        if not entries:
            lines.extend(["- No scoped commits found yet.", ""])
            continue
        for item in entries:
            short_hash = str(item.get("hash") or "")[:8]
            date = str(item.get("date") or "")
            raw = str(item.get("raw") or "").strip()
            lines.append(f"- {date} `{short_hash}` {raw}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def generate_feature_changelog(max_commits: int = 400, max_entries_per_feature: int = 50) -> str:
    payload = feature_versioning.load_feature_versions()
    commits = get_git_log_entries(limit=max_commits)
    grouped = group_entries_by_feature(commits, payload)
    trimmed = trim_entries(grouped, max_entries=max_entries_per_feature)
    return render_feature_changelog(payload, trimmed)


def write_feature_changelog(text: str) -> None:
    OUTPUT_FILE.write_text(text, encoding="utf-8")


def stage_feature_changelog() -> None:
    subprocess.run(["git", "add", OUTPUT_FILE.name], cwd=ROOT, check=True)
