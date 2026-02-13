"""SongGraph loader/validator placeholders."""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json
from typing import Any, Dict

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
    # Placeholder: wire to jsonschema validation later.
    # Must validate against song2daw/schemas/SongGraph.schema.json
    return isinstance(d, dict) and "nodes" in d and "edges" in d
