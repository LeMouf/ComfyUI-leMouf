# song2daw — Core API (Draft)

This document describes the intended **stable surfaces** for `song2daw`.

## Python: SongGraph

### Load / Save
```python
from song2daw.core.graph import SongGraph

g = SongGraph.load(path)
g.save(path)
```

### Validate
```python
from song2daw.core.graph import validate_songgraph

validate_songgraph(g.to_dict())  # raises or returns bool
```

## Python: Pipeline Steps

### Step interface (conceptual)
```python
class Step:
    name: str
    version: str

    def run(self, inputs: dict, config: dict, ctx: "RunContext") -> dict:
        ...
```

### RunContext
Contains:
- artifact store access
- cache key builder
- logging helper
- environment/model version info

## Exporters

### Reaper project
```python
from song2daw.core.export.reaper import export_rpp

export_rpp(songgraph=g, out_path="out/project.rpp", assets_dir="out/assets/")
```

### Stems
```python
from song2daw.core.export.stems import export_stems
export_stems(songgraph=g, out_dir="out/stems/")
```

### MIDI (optional)
```python
from song2daw.core.export.midi import export_midi
export_midi(songgraph=g, out_dir="out/midi/")
```

## JS/TS UI contract

The UI consumes:
- `SongGraph.json`
- referenced artifacts (wav/midi/json)
- pipeline manifests for provenance display

No direct Python imports from the UI.
