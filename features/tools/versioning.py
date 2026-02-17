from __future__ import annotations

import argparse
import datetime as _dt
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Tuple

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from features.tools import feature_changelog
from features.tools import feature_versioning
INIT_FILE = ROOT / "__init__.py"
README_FILE = ROOT / "README.md"
CHANGELOG_FILE = ROOT / "CHANGELOG.md"
REQUEST_FILE = ROOT / ".version_bump_next"

VERSION_RE = re.compile(r'(__version__\s*=\s*")(\d+\.\d+\.\d+)(")')
README_VERSION_RE = re.compile(r"(Current version:\s*`)(\d+\.\d+\.\d+)(`)")
CHANGELOG_HEADING_RE = re.compile(r"^##\s+(\d+\.\d+\.\d+)\s+-\s+\d{4}-\d{2}-\d{2}\s*$", re.MULTILINE)
SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")

LEVEL_MINOR = "minor"
LEVEL_MEDIUM = "medium"
LEVEL_MAJOR = "major"
VALID_LEVELS = {LEVEL_MINOR, LEVEL_MEDIUM, LEVEL_MAJOR}


def parse_semver(value: str) -> Tuple[int, int, int]:
    match = SEMVER_RE.match(str(value or "").strip())
    if not match:
        raise ValueError(f"invalid semver: {value!r}")
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def format_semver(parts: Tuple[int, int, int]) -> str:
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


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def extract_version_from_init(text: str) -> str:
    match = VERSION_RE.search(text)
    if not match:
        raise RuntimeError("unable to find __version__ in __init__.py")
    return match.group(2)


def replace_init_version(text: str, new_version: str) -> str:
    updated, count = VERSION_RE.subn(rf"\g<1>{new_version}\g<3>", text, count=1)
    if count != 1:
        raise RuntimeError("failed to update __version__ in __init__.py")
    return updated


def replace_readme_version(text: str, new_version: str) -> str:
    updated, count = README_VERSION_RE.subn(rf"\g<1>{new_version}\g<3>", text, count=1)
    if count == 0:
        return text
    return updated


def ensure_changelog_release(text: str, version: str, date_iso: str) -> str:
    existing = CHANGELOG_HEADING_RE.search(text)
    if existing and existing.group(1) == version:
        return text
    lines = text.splitlines()
    insert_idx = 1 if lines and lines[0].strip().lower() == "# changelog" else 0
    block = [f"## {version} - {date_iso}", "", "- chore: maintenance update.", ""]
    return "\n".join(lines[:insert_idx] + block + lines[insert_idx:]).rstrip() + "\n"


def get_current_version() -> str:
    return extract_version_from_init(read_text(INIT_FILE))


def read_requested_level() -> str | None:
    if not REQUEST_FILE.exists():
        return None
    value = read_text(REQUEST_FILE).strip().lower()
    if value in VALID_LEVELS:
        return value
    return None


def set_requested_level(level: str) -> None:
    if level not in VALID_LEVELS:
        raise ValueError(f"invalid level: {level}")
    write_text(REQUEST_FILE, f"{level}\n")


def clear_requested_level() -> None:
    if REQUEST_FILE.exists():
        REQUEST_FILE.unlink()


def stage_files(paths: Iterable[Path]) -> None:
    rel_paths = [str(path.relative_to(ROOT)).replace("\\", "/") for path in paths if path.exists()]
    if not rel_paths:
        return
    subprocess.run(["git", "add", *rel_paths], check=True, cwd=ROOT)


def do_bump(level: str | None, use_request: bool, write_changelog: bool, stage: bool) -> str:
    chosen_level = (level or "").strip().lower()
    if use_request:
        requested = read_requested_level()
        if requested:
            chosen_level = requested
    if chosen_level not in VALID_LEVELS:
        chosen_level = LEVEL_MINOR

    init_text = read_text(INIT_FILE)
    current = extract_version_from_init(init_text)
    next_version = bump_semver(current, chosen_level)

    write_text(INIT_FILE, replace_init_version(init_text, next_version))
    write_text(README_FILE, replace_readme_version(read_text(README_FILE), next_version))

    if write_changelog:
        today = _dt.date.today().isoformat()
        changelog = ensure_changelog_release(read_text(CHANGELOG_FILE), next_version, today)
        write_text(CHANGELOG_FILE, changelog)

    if use_request:
        clear_requested_level()

    if stage:
        stage_targets = [INIT_FILE, README_FILE]
        if write_changelog:
            stage_targets.append(CHANGELOG_FILE)
        stage_files(stage_targets)

    return next_version


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Version bump tool (major/medium/minor).")
    sub = parser.add_subparsers(dest="command", required=True)

    show = sub.add_parser("show", help="Show current version.")
    show.set_defaults(func=cmd_show)

    req = sub.add_parser("request", help="Request next commit bump level.")
    req.add_argument("--level", choices=sorted(VALID_LEVELS), required=True)
    req.set_defaults(func=cmd_request)

    bump = sub.add_parser("bump", help="Bump version.")
    bump.add_argument("--level", choices=sorted(VALID_LEVELS))
    bump.add_argument("--from-request", action="store_true", help="Use .version_bump_next when present.")
    bump.add_argument("--no-changelog", action="store_true", help="Do not create changelog section for this bump.")
    bump.add_argument("--stage", action="store_true", help="Git-add modified version files.")
    bump.set_defaults(func=cmd_bump)

    feature_show = sub.add_parser("feature-show", help="Show feature versions.")
    feature_show.add_argument("--feature", help="Optional feature id.")
    feature_show.set_defaults(func=cmd_feature_show)

    feature_request = sub.add_parser("feature-request", help="Request next bump level for a feature.")
    feature_request.add_argument("--feature", required=True, help="Feature id from feature_versions.json")
    feature_request.add_argument("--level", choices=sorted(VALID_LEVELS), required=True)
    feature_request.set_defaults(func=cmd_feature_request)

    feature_request_all = sub.add_parser("feature-request-all", help="Request next bump level for all features.")
    feature_request_all.add_argument("--level", choices=[LEVEL_MEDIUM, LEVEL_MAJOR], required=True)
    feature_request_all.set_defaults(func=cmd_feature_request_all)

    feature_auto = sub.add_parser("feature-auto", help="Auto-bump touched features from staged files.")
    feature_auto.add_argument(
        "--default-level",
        choices=sorted(VALID_LEVELS),
        default=LEVEL_MINOR,
        help="Default bump level for touched features.",
    )
    feature_auto.add_argument("--stage", action="store_true", help="Git-add feature_versions.json after bump.")
    feature_auto.set_defaults(func=cmd_feature_auto)

    feature_chlog = sub.add_parser("feature-changelog", help="Generate FEATURE_CHANGELOG.md from git history.")
    feature_chlog.add_argument("--max-commits", type=int, default=400, help="How many commits to inspect.")
    feature_chlog.add_argument(
        "--max-entries-per-feature",
        type=int,
        default=50,
        help="How many entries to keep per feature.",
    )
    feature_chlog.add_argument("--stage", action="store_true", help="Git-add FEATURE_CHANGELOG.md after generation.")
    feature_chlog.set_defaults(func=cmd_feature_changelog)
    return parser


def cmd_show(_args: argparse.Namespace) -> int:
    print(get_current_version())
    return 0


def cmd_request(args: argparse.Namespace) -> int:
    set_requested_level(args.level)
    print(f"next bump level requested: {args.level}")
    return 0


def cmd_bump(args: argparse.Namespace) -> int:
    next_version = do_bump(
        level=args.level,
        use_request=bool(args.from_request),
        write_changelog=not bool(args.no_changelog),
        stage=bool(args.stage),
    )
    print(next_version)
    return 0


def cmd_feature_show(args: argparse.Namespace) -> int:
    payload = feature_versioning.load_feature_versions()
    features = feature_versioning.feature_map(payload)
    name = str(args.feature or "").strip()
    if name:
        meta = features.get(name)
        if not meta:
            raise SystemExit(f"unknown feature: {name}")
        print(f"{name}={meta.get('version', '')}")
        return 0
    for key in sorted(features.keys()):
        print(f"{key}={features[key].get('version', '')}")
    return 0


def cmd_feature_request(args: argparse.Namespace) -> int:
    payload = feature_versioning.load_feature_versions()
    features = feature_versioning.feature_map(payload)
    feature = str(args.feature).strip()
    if feature not in features:
        raise SystemExit(f"unknown feature: {feature}")
    feature_versioning.set_feature_request(feature, args.level)
    print(f"next bump level requested for {feature}: {args.level}")
    return 0


def cmd_feature_request_all(args: argparse.Namespace) -> int:
    payload = feature_versioning.load_feature_versions()
    feature_versioning.request_level_for_all(args.level, payload)
    print(f"next bump level requested for all features: {args.level}")
    return 0


def cmd_feature_auto(args: argparse.Namespace) -> int:
    payload = feature_versioning.load_feature_versions()
    staged = feature_versioning.get_staged_paths()
    touched = feature_versioning.match_features_for_paths(payload, staged)
    if not touched:
        print("no touched features")
        return 0
    requested = feature_versioning.read_feature_requests()
    levels = {name: requested[name] for name in touched if name in requested}
    updated = feature_versioning.bump_features(
        payload,
        touched,
        levels_by_feature=levels,
        default_level=args.default_level,
    )
    feature_versioning.save_feature_versions(payload)
    if args.stage:
        feature_versioning.stage_feature_file()
    if requested:
        feature_versioning.clear_feature_requests()
    for name in sorted(updated.keys()):
        print(f"{name}={updated[name]}")
    return 0


def cmd_feature_changelog(args: argparse.Namespace) -> int:
    text = feature_changelog.generate_feature_changelog(
        max_commits=int(args.max_commits),
        max_entries_per_feature=int(args.max_entries_per_feature),
    )
    feature_changelog.write_feature_changelog(text)
    if args.stage:
        feature_changelog.stage_feature_changelog()
    print("FEATURE_CHANGELOG.md generated")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
