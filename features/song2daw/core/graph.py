"""SongGraph loader/validator (draft).

- Deterministic behavior:
  - If `jsonschema` is installed, validate against JSON Schema (Draft 2020-12).
  - If not installed, fall back to a minimal deterministic structural validation.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import json
from typing import Any, Dict

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    Draft202012Validator = None


@dataclass
class SongGraph:
    data: Dict[str, Any]

    @classmethod
    def load(cls, path: str | Path) -> "SongGraph":
        p = Path(path)
        return cls(json.loads(p.read_text(encoding="utf-8")))

    def save(self, path: str | Path) -> None:
        p = Path(path)
        p.write_text(json.dumps(self.data, indent=2), encoding="utf-8")

    def to_dict(self) -> Dict[str, Any]:
        return self.data


def validate_songgraph(d: Dict[str, Any]) -> bool:
    """Return True if dict looks like a valid SongGraph.

    Deterministic:
    - With `jsonschema`: full validation using the schema file.
    - Without `jsonschema`: minimal structural checks only.
    """
    if not isinstance(d, dict):
        return False

    if Draft202012Validator is None:
        return _validate_songgraph_fallback(d)

    schema = _load_songgraph_schema()
    validator = Draft202012Validator(schema)
    return not any(validator.iter_errors(d))


@lru_cache(maxsize=1)
def _load_songgraph_schema() -> Dict[str, Any]:
    schema_path = Path(__file__).resolve().parent.parent / "schemas" / "SongGraph.schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))


def _validate_songgraph_fallback(d: Dict[str, Any]) -> bool:
    """Minimal deterministic validation when jsonschema is unavailable."""
    required_top_level = {"schema_version", "pipeline_version", "nodes", "edges", "timebase"}
    if not required_top_level.issubset(d.keys()):
        return False

    if not isinstance(d.get("nodes"), list):
        return False
    if not isinstance(d.get("edges"), list):
        return False

    timebase = d.get("timebase")
    if not isinstance(timebase, dict):
        return False

    audio = timebase.get("audio")
    musical = timebase.get("musical")
    if not isinstance(audio, dict) or not isinstance(musical, dict):
        return False

    sr = audio.get("sr")
    ppq = musical.get("ppq")
    if not isinstance(sr, int) or sr < 1:
        return False
    if not isinstance(ppq, int) or ppq < 1:
        return False

    for node in d["nodes"]:
        if not isinstance(node, dict):
            return False
        if not {"id", "type", "data"}.issubset(node.keys()):
            return False
        if not isinstance(node.get("id"), str):
            return False
        if not isinstance(node.get("type"), str):
            return False
        if not isinstance(node.get("data"), dict):
            return False

    for edge in d["edges"]:
        if not isinstance(edge, dict):
            return False
        if not {"from", "to", "type"}.issubset(edge.keys()):
            return False
        if not isinstance(edge.get("from"), str):
            return False
        if not isinstance(edge.get("to"), str):
            return False
        if not isinstance(edge.get("type"), str):
            return False

    return True
