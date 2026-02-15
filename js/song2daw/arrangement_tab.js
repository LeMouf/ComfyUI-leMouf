import { app } from "../../scripts/app.js";

const EXT_NAME = "lemouf.song2daw.arrangement";
const TAB_ID = "song2daw_arrangement";
const TAB_TITLE = "song2daw";

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}

function loadCss() {
  // NOTE: replace 'ComfyUI-leMouf' below if your custom node folder name differs.
  const href = `extensions/ComfyUI-leMouf/js/song2daw/assets/song2daw.css`;
  if ([...document.querySelectorAll("link")].some(l => l.href.includes("song2daw.css"))) return;
  const link = el("link", { rel: "stylesheet", href });
  document.head.appendChild(link);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function createRenderer(state, canvas, inspectorEl) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function timeToX(tSec) { return (tSec - state.view.t0) * state.view.pxPerSec; }
  function xToTime(x) { return x / state.view.pxPerSec + state.view.t0; }

  function hexToRgba(hex, a) {
    const h = (hex || "#888").replace("#","");
    const v = h.length === 3 ? h.split("").map(x=>x+x).join("") : h;
    const r = parseInt(v.slice(0,2),16), g = parseInt(v.slice(2,4),16), b = parseInt(v.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function drawRuler(y, h) {
    ctx.fillStyle = "#121722";
    ctx.fillRect(0, y, canvas.clientWidth, h);
    ctx.strokeStyle = "#2a2f3a";
    ctx.beginPath(); ctx.moveTo(0, y + h - 0.5); ctx.lineTo(canvas.clientWidth, y + h - 0.5); ctx.stroke();

    const down = state.data?.beats?.downbeats_sec || [];
    ctx.fillStyle = "rgba(230,230,230,0.75)";
    ctx.font = "12px system-ui";
    for (let i = 0; i < down.length; i++) {
      const x = timeToX(down[i]);
      if (x < -50 || x > canvas.clientWidth + 50) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, canvas.clientHeight); ctx.stroke();
      if (i % 2 === 0) ctx.fillText(String(i + 1), x + 4, y + 14);
    }
  }

  function drawSections(y, h) {
    const sections = state.data?.sections || [];
    for (const s of sections) {
      const x0 = timeToX(s.t0_sec);
      const x1 = timeToX(s.t1_sec);
      if (x1 < 0 || x0 > canvas.clientWidth) continue;
      ctx.fillStyle = "rgba(255, 208, 90, 0.22)";
      ctx.fillRect(x0, y, x1 - x0, h);
      ctx.fillStyle = "rgba(230,230,230,0.8)";
      ctx.font = "12px system-ui";
      ctx.fillText((s.label || "").toUpperCase(), x0 + 6, y + 14);
    }
  }

  function drawTracks(y0) {
    const tracks = state.data?.tracks || [];
    const rowH = state.view.trackH;

    for (let i = 0; i < tracks.length; i++) {
      const y = y0 + i * rowH - state.view.scrollY;
      if (y + rowH < 0 || y > canvas.clientHeight) continue;

      ctx.fillStyle = i % 2 ? "#0f1218" : "#0c0f15";
      ctx.fillRect(0, y, canvas.clientWidth, rowH);

      const clips = tracks[i].clips || [];
      for (const c of clips) {
        const x0 = timeToX(c.t0_sec);
        const x1 = timeToX(c.t1_sec);
        if (x1 < 0 || x0 > canvas.clientWidth) continue;

        const color = tracks[i].color || "#4aa3ff";
        ctx.fillStyle = hexToRgba(color, 0.45);
        ctx.fillRect(x0, y + 6, Math.max(2, x1 - x0), rowH - 12);

        ctx.strokeStyle = hexToRgba(color, 0.85);
        ctx.strokeRect(x0 + 0.5, y + 6.5, Math.max(2, x1 - x0) - 1, rowH - 13);

        ctx.fillStyle = "rgba(240,240,240,0.85)";
        ctx.font = "12px system-ui";
        ctx.fillText(c.id, x0 + 6, y + 22);

        if (c.kind === "midi" && Array.isArray(c.notes)) {
          const noteAreaY = y + 30;
          const noteAreaH = rowH - 42;
          for (const n of c.notes) {
            const nx0 = timeToX(n.t0_sec);
            const nx1 = timeToX(n.t0_sec + n.dur_sec);
            if (nx1 < x0 || nx0 > x1) continue;
            const pitch = n.pitch ?? 60;
            const py = noteAreaY + (1 - (pitch - 24) / 72) * noteAreaH;
            ctx.fillStyle = "rgba(120, 255, 180, 0.8)";
            ctx.fillRect(nx0, py, Math.max(2, nx1 - nx0), 6);
          }
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (!state.data) {
      ctx.fillStyle = "rgba(230,230,230,0.8)";
      ctx.font = "14px system-ui";
      ctx.fillText("No ui_view.json loaded.", 16, 24);
      return;
    }
    const rulerH = 22;
    const lanesH = 24;
    drawRuler(0, rulerH);
    drawSections(rulerH, lanesH);
    drawTracks(rulerH + lanesH);
  }

  function hitTest(mx, my) {
    const rulerH = 22, lanesH = 24;
    const y0 = rulerH + lanesH;
    const tracks = state.data?.tracks || [];
    const rowH = state.view.trackH;
    const idx = Math.floor((my + state.view.scrollY - y0) / rowH);
    if (idx < 0 || idx >= tracks.length) return null;
    const t = tracks[idx];
    const tY = y0 + idx * rowH - state.view.scrollY;
    for (const c of (t.clips || [])) {
      const x0 = timeToX(c.t0_sec), x1 = timeToX(c.t1_sec);
      if (mx >= x0 && mx <= x1 && my >= tY + 6 && my <= tY + rowH - 6) {
        return { type: "clip", track: t, clip: c };
      }
    }
    return { type: "track", track: t };
  }

  function setInspector(sel) {
    inspectorEl.innerHTML = "";
    if (!sel) {
      inspectorEl.append(el("div", { class: "song2daw-muted" }, [document.createTextNode("Nothing selected")]));
      return;
    }
    const kv = el("div", { class: "song2daw-kv" });
    const add = (k, v) => {
      kv.append(el("div", { class: "k" }, [document.createTextNode(k)]));
      kv.append(el("div", { class: "v" }, [document.createTextNode(String(v))]));
    };
    add("type", sel.type);
    if (sel.track) add("track", sel.track.name);
    if (sel.clip) {
      add("clip", sel.clip.id);
      add("kind", sel.clip.kind);
      add("t0_sec", sel.clip.t0_sec);
      add("t1_sec", sel.clip.t1_sec);
      if (sel.clip.asset) add("asset", sel.clip.asset);
      if (sel.clip.notes) add("notes", sel.clip.notes.length);
    }
    inspectorEl.append(kv);
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (e.ctrlKey || e.metaKey) {
      const before = xToTime(mx);
      const scale = Math.exp(-e.deltaY * 0.001);
      state.view.pxPerSec = Math.min(600, Math.max(20, state.view.pxPerSec * scale));
      const after = xToTime(mx);
      state.view.t0 += (before - after);
      state.view.t0 = Math.max(0, state.view.t0);
      draw();
      return;
    }
    if (e.shiftKey) {
      state.view.t0 += e.deltaY / state.view.pxPerSec;
      state.view.t0 = Math.max(0, state.view.t0);
    } else {
      state.view.scrollY += e.deltaY;
      state.view.scrollY = Math.max(0, state.view.scrollY);
    }
    draw();
  }, { passive: false });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sel = hitTest(mx, my);
    state.selection = sel;
    setInspector(sel);
    draw();
  });

  window.addEventListener("resize", resize);

  return { resize, draw, setInspector };
}

function renderTrackList(left, state) {
  left.innerHTML = "";
  const tracks = state.data?.tracks || [];
  if (!tracks.length) {
    left.append(el("div", { class: "song2daw-track song2daw-muted" }, [document.createTextNode("No tracks loaded")]));
    return;
  }
  for (const t of tracks) {
    const row = el("div", { class: "song2daw-track" });
    const sw = el("div", { class: "swatch" });
    sw.style.background = t.color || "#888";
    row.append(sw, document.createTextNode(t.name));
    left.append(row);
  }
}

app.registerExtension({
  name: EXT_NAME,
  bottomPanelTabs: [
    {
      id: TAB_ID,
      title: TAB_TITLE,
      type: "custom",
      render: async (container) => {
        loadCss();
        container.innerHTML = "";
        container.style.height = "100%";

        const state = { data: null, selection: null, view: { t0: 0, pxPerSec: 80, trackH: 64, scrollY: 0 } };

        const left = el("div", { class: "song2daw-left" });
        const center = el("div", { class: "song2daw-center" });
        const right = el("div", { class: "song2daw-right" });

        const toolbar = el("div", { class: "song2daw-toolbar" });
        const btnLoadFixture = el("button", { onclick: async () => {
          const url = "extensions/ComfyUI-leMouf/examples/song2daw/ui/sample_ui_view.json";
          state.data = await fetchJson(url);
          renderTrackList(left, state);
          renderer.setInspector(null);
          renderer.resize();
        }}, [document.createTextNode("Load fixture")]);

        const btnFit = el("button", { onclick: () => {
          if (!state.data?.song?.duration_sec) return;
          state.view.t0 = 0;
          const rect = canvas.getBoundingClientRect();
          state.view.pxPerSec = Math.max(20, rect.width / state.data.song.duration_sec);
          renderer.draw();
        }}, [document.createTextNode("Fit")]);

        toolbar.append(btnLoadFixture, btnFit);

        const canvasWrap = el("div", { class: "song2daw-canvas-wrap" });
        const canvas = el("canvas", { class: "song2daw-canvas" });
        canvasWrap.append(canvas);
        center.append(toolbar, canvasWrap);

        container.append(el("div", { class: "song2daw-root" }, [left, center, right]));

        const renderer = createRenderer(state, canvas, right);
        renderTrackList(left, state);
        renderer.setInspector(null);
        renderer.resize();
      }
    }
  ]
});
