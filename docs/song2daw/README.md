# 🎵 song2daw
**Deconstruct music. Understand it. Rebuild it.**

---

## 🧒 Explain it like I'm 5

Imagine your favorite song is a **cake** 🍰.

When you listen to it, you only see the finished cake.
But you don’t know:
- what ingredients are inside  
- in what order they were added  
- why it tastes good  
- or how to make a new one that’s a bit different  

**song2daw** is a machine that:
1. takes the cake apart  
2. looks at every ingredient separately  
3. understands **how it was made**  
4. and gives you the **recipe** so you can rebuild it — or change it.

---

## 🧠 What is song2daw?

`song2daw` is an open-source **music deconstruction and reconstruction system**.

Its purpose is **not** to perfectly clone songs, but to:
- analyze an audio track
- extract its **structural essence**
- rebuild a **procedural construction graph**
- project that graph into **DAW-compatible formats**

At its core, `song2daw` treats music as something that can be **understood, inspected, and transformed**, not just rendered.

---

## 🧩 Core concept: the SongGraph

The central artifact of `song2daw` is the **SongGraph**.

It is a **deterministic, versioned, procedural graph** describing:
- musical **structure** (sections, repetitions, transitions)
- **sources** (abstract sound layers, not fixed DAW tracks)
- **events** (notes, hits, textures, envelopes)
- **time** (audio time and musical time)
- **effects** (detected or inferred processing)
- **relationships** between all of the above

Everything else is a **projection** of this graph.

```
Audio → Analysis Pipelines → SongGraph
SongGraph → DAW Project / Stems / MIDI / UI
```

---

## 🔁 Deterministic by design

Given:
- the same input audio
- the same pipeline configuration
- the same model versions

`song2daw` will **always** produce the same SongGraph.

No randomness.  
No hidden state.  
No “it worked yesterday”.

Creativity is introduced **later**, on top of a stable foundation.

---

## 🧪 Pipeline-driven architecture

`song2daw` is implemented as a **feature module** of **ComfyUI-leMouf**.

It uses a **pipeline-based architecture**, where each task is an explicit step:
- ingest
- tempo & beat grid detection
- structural segmentation
- source separation
- event extraction
- effect estimation
- projection / export

Each pipeline step:
- is deterministic
- is cacheable
- produces versioned artifacts
- can be re-run or inspected independently

This makes the system auditable, debuggable, and extensible.

---

## 🎛 User interfaces

`song2daw` provides **two complementary interfaces**:

### 1. ComfyUI workflows
Used for:
- running ML pipelines
- experimenting with analysis strategies
- inspecting intermediate artifacts

### 2. DAW-like visual UI (read-only in v1)
Used for:
- timeline visualization
- track and layer inspection
- structure understanding
- validation of the SongGraph

Editing comes later.  
Understanding comes first.

---

## 🎚 DAW compatibility

In its first stable iteration, `song2daw` targets:

- **Reaper** (`.rpp` project files)
- WAV stems
- MIDI (progressively)
- markers, tempo maps, and structure metadata

Reaper is used as a **projection target**, not as a hard dependency.

---

## ⚖ Legal & ethical position

`song2daw` is:
- a **neutral analysis and creative tool**
- intended for **research, education, and personal creative workflows**

It:
- does not provide audio content
- does not bypass DRM
- does not claim ownership of analyzed material

Users are fully responsible for how they use the tool.

---

## 🧱 Technology stack

- **Python**  
  Core logic, ML, audio processing, pipelines

- **ComfyUI**  
  Workflow orchestration and node-based experimentation

- **JavaScript / TypeScript**  
  DAW-like visualization UI

- **JSON**  
  Stable interchange format and SongGraph definition

---

## 🚧 Project status

This project is **early-stage and experimental**.

Expect:
- breaking changes
- evolving schemas
- aggressive iteration

Stability comes from:
- determinism
- strict versioning
- explicit pipelines

---

## 🧠 Philosophy

> Don’t generate music.  
> **Understand it first.**
