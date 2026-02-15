# song2daw - Core API

This document describes practical API surfaces used in release `0.3.0`.

## Python surfaces

### Graph validation

```python
from song2daw.core.graph import validate_songgraph

validate_songgraph(songgraph_dict)
```

### Pipeline execution

```python
from song2daw.core.pipeline import load_pipeline_steps, run_pipeline

steps = load_pipeline_steps(pipeline_yaml_path)
result = run_pipeline(audio_path, stems_dir, steps=steps)
```

### Run persistence

```python
from song2daw.core.runner import save_run_outputs

run_dir = save_run_outputs(result, output_dir)
```

## HTTP routes (leMouf panel)

### Workflow catalog

- `GET /lemouf/workflows/list`
- `POST /lemouf/workflows/load`

### song2daw runs

- `GET /lemouf/song2daw/runs`
- `GET /lemouf/song2daw/runs/{run_id}`
- `GET /lemouf/song2daw/runs/{run_id}/ui_view`
- `GET /lemouf/song2daw/runs/{run_id}/audio`
- `POST /lemouf/song2daw/runs/open`
- `POST /lemouf/song2daw/runs/clear`

## Stability notes

- SongGraph schema is validated against `song2daw/schemas/SongGraph.schema.json`.
- UI payload should be treated as read-only view data.
- Workflow profile metadata controls UI adapter routing.
