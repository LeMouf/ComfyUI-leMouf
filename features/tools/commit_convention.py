from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import List

ALLOWED_TYPES = (
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "perf",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
)

HEADER_RE = re.compile(
    rf"^(?P<type>{'|'.join(ALLOWED_TYPES)})"
    r"(?P<scope>\([a-z0-9._/\-]+\))?"
    r"(?P<breaking>!)?: "
    r"(?P<subject>.+)$"
)


def validate_header(header: str) -> List[str]:
    text = str(header or "").strip()
    errors: List[str] = []
    if not text:
        return ["commit message is empty"]

    # practical exceptions
    if text.startswith("Merge "):
        return []
    if text.startswith('Revert "'):
        return []
    if text.startswith("fixup! ") or text.startswith("squash! "):
        return []

    match = HEADER_RE.match(text)
    if not match:
        errors.append(
            "invalid commit header format. expected: type(scope): subject"
        )
        return errors

    subject = match.group("subject").strip()
    if len(subject) < 3:
        errors.append("subject is too short (minimum 3 characters)")
    if subject.endswith("."):
        errors.append("subject must not end with a period")
    return errors


def validate_message(text: str) -> List[str]:
    lines = [line.rstrip("\n") for line in str(text or "").splitlines()]
    # Skip leading blank lines
    while lines and not lines[0].strip():
        lines.pop(0)
    if not lines:
        return ["commit message is empty"]
    return validate_header(lines[0])


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def cmd_validate(args: argparse.Namespace) -> int:
    text = read_file(Path(args.file)) if args.file else str(args.message or "")
    errors = validate_message(text)
    if not errors:
        return 0

    print("Commit message rejected:")
    for item in errors:
        print(f"- {item}")
    print("")
    print("Allowed types:")
    print(", ".join(ALLOWED_TYPES))
    print("")
    print("Examples:")
    print("- feat(song2daw): add deterministic run hydration")
    print("- fix(loop): keep focus on first incomplete cycle")
    print("- chore(versioning)!: switch to strict commit-msg hook")
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Conventional commit validator.")
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="Validate commit message.")
    validate.add_argument("--file", help="Path to commit message file.")
    validate.add_argument("--message", help="Raw commit message text.")
    validate.set_defaults(func=cmd_validate)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

