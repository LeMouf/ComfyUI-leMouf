# 🎛️ song2daw — Technical Documentation

## 📌 Overview

**song2daw** is a system for **music deconstruction, procedural analysis, and DAW‑ready reconstruction**.

It analyzes audio material and reconstructs a **deterministic procedural representation** called the **SongGraph**, which acts as the single source of truth.  
All exports (DAW projects, stems, MIDI, UI views) are projections derived from this graph.

This document is intended for **developers**, including collaborative workflows with Codex or other AI coding assistants.

---

## 🧠 Core Principles

- **Procedural-first**: music is represented as a construction graph, not as static tracks  
- **Deterministic**: same inputs + same pipeline = same outputs  
- **Pipeline-driven**: every transformation is an explicit step  
- **DAW-agnostic**: DAW formats are projections, not dependencies  
- **Versioned at all levels**: schema, pipelines, nodes, models  

---

## 🗂 Repository Structure

```
song2daw/
├── core/
│   ├── graph/            # SongGraph schema, validation, API
│   ├── pipelines/        # Pipeline step implementations
│   ├── models/           # ML model wrappers + versioning
│   ├── io/               # Audio I/O, exporters, importers
│   ├── cache/            # Deterministic cache layer
│   └── tests/            # Unit & integration tests
├── comfyui_nodes/        # ComfyUI node bindings
├── ui/                   # DAW-like visualization UI (JS/TS)
├── docs/                 # Architecture & schema documentation
├── examples/             # Sample audio and pipeline manifests
├── README.md             # User-facing README
└── README.tech.md        # This document
```

---

## 🧩 SongGraph

### Definition

The **SongGraph** is the canonical data model describing a song.

It is a **JSON-based hybrid graph**:
- human-readable
- machine-validated
- explicitly versioned

### Core Node Types

- **StructureNode**  
  Sections, repetitions, transitions

- **SourceNode**  
  Abstract sound layers (not fixed DAW tracks)

- **EventNode**  
  Notes, hits, textures, envelopes

- **TimeNode**  
  Musical time (bars/beats) + absolute time

- **EffectNode**  
  Detected or inferred processing

### Edges

Edges define:
- temporal relationships
- dependencies
- containment
- modulation links

### Versioning

Each SongGraph contains:
```json
{
  "schema_version": "1.0.0",
  "pipeline_version": "0.3.2",
  "node_versions": {
    "SourceSeparation": "1.1.0",
    "TempoAnalysis": "1.0.2"
  }
}
```

---

## 🔄 Pipeline Architecture

### Pipeline System

`song2daw` uses the **ComfyUI‑leMouf pipeline framework**.

Each pipeline step:
- has explicit inputs and outputs
- is deterministic
- produces versioned artifacts
- is fully cacheable

### Typical Pipeline Steps

| Step | Responsibility |
|----|---------------|
| Ingest | Load audio or stems |
| TempoAnalysis | BPM, beat grid, downbeats |
| StructureSegmentation | Sections & repetition |
| SourceSeparation | Abstract source layers |
| EventExtraction | Onsets, notes, MIDI |
| EffectEstimation | FX proxies |
| Projection | DAW / stems / MIDI export |

Artifacts are stored per-step and referenced by the SongGraph.

---

## 📦 Deterministic Cache

Cache keys are generated from:
- input hashes
- configuration parameters
- pipeline step version
- model version

This guarantees:
- zero recomputation when unchanged
- reproducible debugging
- safe refactors

---

## 🧪 Testing Strategy

### Unit Tests

- SongGraph schema validation
- Cache key stability
- Deterministic pipeline replays

### Integration Tests

- End-to-end pipeline runs
- Export validation (Reaper, WAV, MIDI)
- Regression tests on reference audio

All tests must be **repeatable and side-effect free**.

---

## 🎛 Interfaces

### Python Core

- Headless execution
- CLI-friendly
- JSON in / JSON out

### ComfyUI

- Pipeline visualization
- Step inspection
- Workflow experimentation

### DAW-like UI (JS/TS)

- Read-only timeline
- Track/layer visualization
- Structural inspection

---

## 🧠 Codex / Duo Workflow Guidelines

- Treat SongGraph as immutable input/output
- Never introduce randomness in core steps
- Always version schema & steps
- Prefer small, explicit pipeline steps
- Log every non-trivial decision

Codex is expected to:
- generate step skeletons
- extend schema safely
- write tests alongside logic

---

## ⚖ Legal / Safety Notes

- No DRM bypass
- No audio distribution
- Analysis-only tooling
- User is responsible for content usage

---

## 🚧 Status

This project is **experimental and evolving**.

Breaking changes are expected until:
- SongGraph schema stabilizes
- Core pipelines are validated

---

## 🧠 Philosophy

> Music is not a waveform.  
> It is a construction.
