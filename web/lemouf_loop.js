import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

let lastApiError = "";

if (window.__lemoufLoopRegistered) {
  console.warn("[leMouf Loop] extension already registered, skipping");
} else {
  window.__lemoufLoopRegistered = true;
  console.log("[leMouf Loop] extension loaded");
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn("[leMouf Loop] JSON parse failed:", err);
    return null;
  }
}

async function apiGet(path) {
  const res = await api.fetchApi(path);
  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          detail = parsed?.error || parsed?.message || text;
        } catch {
          detail = text;
        }
      }
    } catch {}
    lastApiError = `GET ${path} ${res.status}${detail ? `: ${detail}` : ""}`;
    console.warn("[leMouf Loop] GET failed", path, res.status, detail);
    return null;
  }
  return safeJson(res);
}

async function apiPost(path, data) {
  const res = await api.fetchApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          detail = parsed?.error || parsed?.message || text;
        } catch {
          detail = text;
        }
      }
    } catch {}
    lastApiError = `POST ${path} ${res.status}${detail ? `: ${detail}` : ""}`;
    console.warn("[leMouf Loop] POST failed", path, res.status, detail);
    return null;
  }
  return safeJson(res);
}

function injectStyles() {
  if (document.getElementById("lemouf-loop-style")) return;
  const style = el("style", { id: "lemouf-loop-style" }, [
    `
    .lemouf-loop-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: var(--lemouf-gutter, 420px);
      background: linear-gradient(180deg, #f6f0e6, #efe3d3);
      border: 1px solid #c7b7a6;
      border-radius: 12px 0 0 12px;
      padding: 12px 12px 12px 16px;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: #3b2f24;
      box-shadow: 0 8px 30px rgba(40, 30, 20, 0.18);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-title {
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 12px;
    }
    .lemouf-loop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lemouf-loop-header .lemouf-loop-title {
      margin-bottom: 0;
    }
    .lemouf-loop-header-btn {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid #b59c86;
      background: #f6f0e6;
      color: #5b4637;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }
    .lemouf-loop-header-btn:hover {
      filter: brightness(0.98);
    }
    .lemouf-loop-loopid {
      font-size: 11px;
      color: #6b5a4a;
      margin-bottom: 6px;
      opacity: 0.85;
    }
    .lemouf-loop-poststart {
      display: flex;
      flex-direction: column;
      min-height: 0;
      gap: 8px;
    }
    .lemouf-loop-poststart-top {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
    }
    .lemouf-loop-poststart-bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-resizer {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8px;
      cursor: ew-resize;
      background: rgba(90, 70, 55, 0.08);
      border-right: 1px solid rgba(90, 70, 55, 0.2);
    }
    .lemouf-loop-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .lemouf-loop-row > * { flex: 1 1 120px; }
    .lemouf-loop-btn {
      background: #5b4637;
      color: #f7f2ea;
      border: none;
      border-radius: 8px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
    }
    .lemouf-loop-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(0.2);
      box-shadow: none;
    }
    .lemouf-loop-btn.alt { background: #8a6b4f; }
    .lemouf-loop-btn.ghost { background: transparent; border: 1px solid #5b4637; color: #5b4637; }
    .lemouf-loop-inline {
      display: flex;
      align-items: stretch;
      gap: 6px;
      margin-bottom: 8px;
    }
    .lemouf-loop-inline label {
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      padding: 0 6px;
      border-radius: 6px;
      background: #e7d7c6;
      color: #3b2f24;
      border: 1px solid #b59c86;
      white-space: nowrap;
    }
    .lemouf-loop-inline input,
    .lemouf-loop-inline button {
      height: 30px;
    }
    .lemouf-loop-inline input {
      width: auto;
      flex: 1 1 auto;
      min-width: 0;
      padding: 0 8px;
    }
    .lemouf-loop-inline button {
      flex: 0 0 auto;
      padding: 0 12px;
      border-radius: 8px;
    }
    .lemouf-loop-action {
      position: relative;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-radius: 10px;
      padding: 7px 10px;
      border: 1px solid transparent;
      transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .lemouf-loop-action::before {
      display: inline-block;
      font-size: 12px;
    }
    .lemouf-loop-action.approve {
      background: linear-gradient(180deg, #2f7a4f, #246a43);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.approve::before { content: "✓"; }
    .lemouf-loop-action.reject {
      background: linear-gradient(180deg, #a03a2e, #8a2e24);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.reject::before { content: "✕"; }
    .lemouf-loop-action.replay {
      background: linear-gradient(180deg, #8a6b4f, #6d533b);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.replay::before { content: "↻"; }
    .lemouf-loop-action:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(40, 30, 20, 0.2);
      filter: brightness(1.03);
    }
    .lemouf-loop-action:active {
      transform: translateY(0);
      box-shadow: none;
    }
    .lemouf-loop-accordion {
      border: 1px solid #c7b7a6;
      border-radius: 10px;
      background: rgba(255, 250, 243, 0.6);
      padding: 6px;
      margin-bottom: 8px;
    }
    .lemouf-loop-accordion summary {
      cursor: pointer;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #5b4637;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lemouf-loop-accordion summary::-webkit-details-marker {
      display: none;
    }
    .lemouf-loop-accordion summary::before {
      content: "▸";
      font-size: 12px;
      transition: transform 120ms ease;
    }
    .lemouf-loop-accordion[open] summary::before {
      transform: rotate(90deg);
    }
    .lemouf-loop-field { font-size: 12px; }
    .lemouf-loop-field input, .lemouf-loop-field select, .lemouf-loop-field textarea {
      width: 100%;
      border-radius: 6px;
      border: 1px solid #b59c86;
      padding: 4px 6px;
      font-size: 12px;
      background: #fffaf3;
      color: #3b2f24;
    }
    .lemouf-loop-manifest {
      flex: 1;
      min-height: 140px;
      overflow: auto;
      background: #fffaf3;
      border: 1px solid #b59c86;
      border-radius: 8px;
      padding: 6px;
      font-size: 11px;
    }
    .lemouf-loop-status {
      font-size: 11px;
      color: #5b4637;
      white-space: pre-wrap;
    }
    .lemouf-loop-manifest-row {
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px dashed rgba(90, 70, 55, 0.25);
    }
    .lemouf-loop-manifest-row:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .lemouf-loop-gallery {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .lemouf-loop-cycle {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px dashed rgba(90, 70, 55, 0.25);
    }
    .lemouf-loop-cycle:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .lemouf-loop-cycle-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      margin-bottom: 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #3b2f24;
    }
    .lemouf-loop-cycle-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lemouf-loop-result-card {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .lemouf-loop-thumb-actions {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      opacity: 0;
      transition: opacity 120ms ease;
      pointer-events: none;
    }
    .lemouf-loop-result-card:hover .lemouf-loop-thumb-actions {
      opacity: 1;
      pointer-events: auto;
    }
    .lemouf-loop-thumb-action {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid rgba(60, 45, 35, 0.2);
      background: rgba(255, 250, 243, 0.92);
      color: #3b2f24;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(20, 16, 12, 0.2);
      transition: transform 120ms ease, opacity 120ms ease;
    }
    .lemouf-loop-thumb-action.approve { color: #1f6a44; }
    .lemouf-loop-thumb-action.reject { color: #8a2e24; }
    .lemouf-loop-result-card.is-deciding .lemouf-loop-thumb-actions {
      opacity: 1;
    }
    .lemouf-loop-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 22px;
      height: 22px;
      margin: -11px 0 0 -11px;
      border-radius: 50%;
      border: 2px solid rgba(91, 70, 55, 0.25);
      border-top-color: rgba(91, 70, 55, 0.85);
      animation: lemouf-spin 0.8s linear infinite;
      display: none;
      pointer-events: none;
    }
    .lemouf-loop-result-card.is-loading .lemouf-loop-spinner,
    .lemouf-loop-preview.is-loading .lemouf-loop-spinner {
      display: block;
    }
    @keyframes lemouf-spin {
      to { transform: rotate(360deg); }
    }
    .lemouf-loop-result-badge {
      position: absolute;
      top: -6px;
      left: -6px;
      background: #5b4637;
      color: #f7f2ea;
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .lemouf-loop-result-badge.approve { background: #2f7a4f; }
    .lemouf-loop-result-badge.reject { background: #a03a2e; }
    .lemouf-loop-result-badge.replay { background: #8a6b4f; }
    .lemouf-loop-result-badge.queued { background: #6b6b6b; }
    .lemouf-loop-result-badge.running { background: #9a7b2f; }
    .lemouf-loop-result-badge.returned { background: #2f5f7a; }
    .lemouf-loop-result-badge.error { background: #7a2f2f; }
    .lemouf-loop-result-badge.pending { background: #5b4637; }
    .lemouf-loop-result-placeholder {
      width: 96px;
      height: 96px;
      border-radius: 6px;
      border: 1px dashed #b59c86;
      background: #fffaf3;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #7a6756;
      text-align: center;
      padding: 6px;
    }
    .lemouf-loop-thumb {
      width: 96px;
      height: 96px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #b59c86;
      background: #fff;
      cursor: pointer;
    }
    .lemouf-loop-preview {
      border: 1px solid #b59c86;
      border-radius: 10px;
      background: #fffaf3;
      padding: 6px;
      position: relative;
    }
    .lemouf-loop-preview-img {
      width: 100%;
      height: auto;
      max-height: 220px;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #d6c4b2;
      background: #fff;
      cursor: pointer;
      display: none;
    }
    .lemouf-loop-preview-empty {
      font-size: 11px;
      color: #7a6756;
      text-align: center;
      padding: 18px 8px;
    }
    .lemouf-loop-progress {
      border: 1px solid #b59c86;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px 8px;
      font-size: 11px;
    }
    .lemouf-loop-progress-track {
      position: relative;
      height: 10px;
      border-radius: 999px;
      background: #e7d7c6;
      overflow: hidden;
      margin-top: 6px;
    }
    .lemouf-loop-progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #5b4637, #8a6b4f);
      transition: width 120ms linear;
    }
    .lemouf-loop-progress.indeterminate .lemouf-loop-progress-bar {
      width: 35%;
      animation: lemouf-indeterminate 1.2s ease-in-out infinite;
    }
    @keyframes lemouf-indeterminate {
      0% { transform: translateX(-60%); }
      100% { transform: translateX(260%); }
    }
    .lemouf-loop-progress-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lemouf-loop-progress-node {
      font-weight: 600;
      color: #5b4637;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lemouf-loop-progress-state {
      color: #7a6756;
    }
    .lemouf-loop-lightbox {
      position: fixed;
      inset: 0;
      background: rgba(20, 16, 12, 0.78);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 24px;
    }
    .lemouf-loop-lightbox.is-open {
      display: flex;
    }
    .lemouf-loop-lightbox img {
      max-width: 92vw;
      max-height: 92vh;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: #fff;
    }
    .lemouf-loop-lightbox button {
      position: absolute;
      top: 16px;
      right: 16px;
      background: #f6f0e6;
      color: #3b2f24;
      border: 1px solid #c7b7a6;
      border-radius: 999px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .lemouf-loop-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 999px;
      background: #d7c1a8;
      font-size: 10px;
      margin-left: 6px;
    }
    `,
  ]);
  document.head.appendChild(style);
}

async function getCurrentPromptPayload() {
  const candidates = [
    app,
    window?.comfyAPI?.app?.app,
    window?.comfyAPI?.app,
    window?.app,
  ];
  for (const candidate of candidates) {
    const fn = candidate?.graphToPrompt;
    if (typeof fn === "function") {
      try {
        return await fn.call(candidate);
      } catch (err) {
        console.warn("[leMouf Loop] graphToPrompt failed:", err);
      }
    }
  }
  console.warn("[leMouf Loop] graphToPrompt not available");
  return null;
}

function hashString(input) {
  if (!input) return null;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function signatureFromPrompt(prompt) {
  try {
    const json = JSON.stringify(prompt);
    return hashString(json);
  } catch {
    return null;
  }
}

function extractTypesFromPrompt(prompt) {
  if (!prompt || typeof prompt !== "object") return [];
  return Object.values(prompt).map((node) =>
    String(node?.class_type || node?.type || node?.title || "")
  );
}

function extractTypesFromWorkflowNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => String(node?.type || node?.class_type || node?.title || ""));
}

function hasType(types, needle) {
  return types.some((value) => value === needle || value.includes(needle));
}

function validateWorkflow(prompt, workflowNodes) {
  const errors = [];
  const warnings = [];
  const promptTypes = extractTypesFromPrompt(prompt);
  const workflowTypes = extractTypesFromWorkflowNodes(workflowNodes);
  const types = promptTypes.length ? promptTypes : workflowTypes;

  if (!types.length) {
    errors.push("Workflow not readable from UI.");
    return { ok: false, errors, warnings };
  }

  const hasLoopContext = hasType(types, "LoopContext") || hasType(types, "Loop Context");
  const hasLoopReturn = hasType(types, "LoopReturn") || hasType(types, "Loop Return");
  const hasKSampler = hasType(types, "KSampler");

  if (!hasLoopContext) errors.push("Missing Loop Context node.");
  if (!hasLoopReturn) errors.push("Missing Loop Return node.");
  if (!hasKSampler) warnings.push("No KSampler node found.");

  if (prompt && typeof prompt === "object") {
    const entries = Object.entries(prompt);
    const loopContexts = entries.filter(([, node]) => String(node?.class_type || "") === "LoopContext");
    const ksamplers = entries.filter(([, node]) => {
      const t = String(node?.class_type || "");
      return t === "KSampler" || t === "KSamplerAdvanced";
    });
    let seedLinked = false;
    if (ksamplers.length && loopContexts.length) {
      const loopIds = new Set(loopContexts.map(([id]) => String(id)));
      for (const [, node] of ksamplers) {
        const seed = node?.inputs?.seed;
        if (Array.isArray(seed) && loopIds.has(String(seed[0]))) {
          seedLinked = true;
          break;
        }
      }
    }
    if (!seedLinked) {
      errors.push("KSampler.seed is not linked to LoopContext.seed.");
    }

    let returnHasImages = false;
    const loopReturns = entries.filter(([, node]) => String(node?.class_type || "") === "LoopReturn");
    for (const [, node] of loopReturns) {
      const imagesInput = node?.inputs?.images;
      if (Array.isArray(imagesInput)) {
        returnHasImages = true;
        break;
      }
    }
    if (!returnHasImages) {
      warnings.push("Loop Return has no images input linked.");
    }
  } else {
    warnings.push("Graph linkage checks require a synced workflow.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function getComfyApp() {
  return window?.comfyAPI?.app?.app || app || window?.app || null;
}

function getGutterRoot() {
  const first = document.body?.firstElementChild;
  if (first && first.tagName === "DIV") return first;
  return document.body;
}

function getSelectedNodes(canvas) {
  const selected =
    canvas?.selected_nodes ??
    canvas?.selectedNodes ??
    canvas?.selected_items ??
    canvas?.selectedItems ??
    null;
  if (!selected) return [];
  if (Array.isArray(selected)) return selected;
  if (selected instanceof Map) return Array.from(selected.values());
  if (typeof selected === "object") return Object.values(selected);
  return [];
}

function setLoopIdOnNodes(loopId, nodes) {
  if (!loopId || !nodes?.length) return 0;
  let updated = 0;
  for (const node of nodes) {
    const widget = node?.widgets?.find((w) => w?.name === "loop_id");
    if (!widget) continue;
    widget.value = loopId;
    if (typeof widget.callback === "function") {
      try {
        widget.callback(loopId);
      } catch (err) {
        console.warn("[leMouf Loop] loop_id widget callback failed:", err);
      }
    }
    if (node?.properties && "loop_id" in node.properties) {
      node.properties.loop_id = loopId;
    }
    updated += 1;
  }
  return updated;
}

function badgeClassForDecision(decision) {
  const key = String(decision || "").toLowerCase();
  if (key.includes("approve")) return "approve";
  if (key.includes("reject")) return "reject";
  if (key.includes("replay") || key.includes("retry")) return "replay";
  if (key.includes("error") || key.includes("fail")) return "error";
  if (key.includes("run")) return "running";
  if (key.includes("queue")) return "queued";
  if (key.includes("return")) return "returned";
  return "pending";
}

function getLoopContextNode(loopId) {
  const comfyApp = getComfyApp();
  const nodes = comfyApp?.rootGraph?.nodes || comfyApp?.graph?.nodes || [];
  if (!nodes?.length) return null;
  const byLoopId = nodes.filter((node) =>
    node?.widgets?.some((w) => w?.name === "loop_id" && String(w?.value || "") === String(loopId || ""))
  );
  if (byLoopId.length) return byLoopId[0];
  const byType = nodes.find((node) => String(node?.type || "").includes("LoopContext"));
  if (byType) return byType;
  const byTitle = nodes.find((node) => String(node?.title || "").includes("Loop Context"));
  return byTitle || null;
}

function getWidgetValue(node, name) {
  return node?.widgets?.find((w) => w?.name === name)?.value;
}

function parseSeedValue(value) {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  const asString = String(value).trim();
  if (!asString) return 0n;
  try {
    return BigInt(asString);
  } catch {
    return 0n;
  }
}

async function computeSeed(loopId, cycleIndex, retryIndex, baseSeed, mode) {
  const base = parseSeedValue(baseSeed);
  const cycle = BigInt(Number.isFinite(cycleIndex) ? cycleIndex : 0);
  const retry = BigInt(Number.isFinite(retryIndex) ? retryIndex : 0);
  if (mode === "hash") {
    const payload = `${loopId}|${cycleIndex}|${retryIndex}|${baseSeed}`;
    const data = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < 8; i += 1) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return BigInt(`0x${hex}`).toString();
  }
  const mask = (1n << 64n) - 1n;
  if (mode === "cycle") {
    return ((base + cycle) & mask).toString();
  }
  return ((base + cycle * 100000n + retry) & mask).toString();
}

function shortId(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 12) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function buildImageSrc(image, preview = false) {
  if (!image) return "";
  const params = new URLSearchParams();
  if (image.filename) params.set("filename", image.filename);
  if (image.type) params.set("type", image.type);
  if (image.subfolder) params.set("subfolder", image.subfolder);
  if (preview) params.set("preview", "webp;90");
  return `/view?${params.toString()}`;
}

app.registerExtension({
  name: "lemouf.loop",
  async setup() {
    try {
    if (document.getElementById("lemouf-loop-panel")) {
      console.warn("[leMouf Loop] panel already exists, skipping setup");
      return;
    }
    injectStyles();

    const loopIdLabel = el("div", { class: "lemouf-loop-loopid", text: "No loop" });
    const statusBadge = el("span", { class: "lemouf-loop-badge", text: "idle" });
    const cycleBadge = el("span", { class: "lemouf-loop-badge", text: "cycle 0/0" });
    const retryBadge = el("span", { class: "lemouf-loop-badge", text: "r0" });
    const seedBadge = el("span", { class: "lemouf-loop-badge", text: "seed ?" });
    const overridesBox = el("textarea", { rows: 4 });
    const manifestBox = el("div", { class: "lemouf-loop-manifest" });
    const actionStatus = el("div", { class: "lemouf-loop-status", text: "" });
    const compatStatus = el("div", { class: "lemouf-loop-status", text: "" });
    const cyclesInput = el("input", { type: "number", min: 1, value: 1 });
    const autoSyncToggle = el("input", { type: "checkbox", checked: true });
    const autoSyncLabel = el("label", { text: "Auto-sync WF" });
    autoSyncLabel.style.display = "flex";
    autoSyncLabel.style.alignItems = "center";
    autoSyncLabel.style.gap = "6px";
    autoSyncLabel.prepend(autoSyncToggle);

    let lastWorkflowSignature = null;
    let workflowDirty = false;
    let workflowSyncInFlight = false;
    let lastValidationSignature = null;
    let validationInFlight = false;
    let validationRetryTimer = null;
    let validationRetries = 0;
    const VALIDATION_RETRY_MAX = 12;
    const VALIDATION_RETRY_DELAY = 900;
    let currentLoopId = "";
    let hasStarted = false;
    let lastStepPromptId = null;
    let autoRefreshTimer = null;
    let autoRefreshAttempts = 0;
    const AUTO_REFRESH_MAX = 180;
    let progressState = {
      promptId: null,
      value: 0,
      max: 0,
      node: "",
      status: "idle",
      loopPercent: null,
    };
    let panel = null;

    const progressNode = el("div", { class: "lemouf-loop-progress-node", text: "Idle" });
    const progressStateText = el("div", { class: "lemouf-loop-progress-state", text: "0%" });
    const progressBar = el("div", { class: "lemouf-loop-progress-bar" });
    const progressTrack = el("div", { class: "lemouf-loop-progress-track" }, [progressBar]);
    const progressWrap = el("div", { class: "lemouf-loop-progress" }, [
      el("div", { class: "lemouf-loop-progress-meta" }, [progressNode, progressStateText]),
      progressTrack,
    ]);


    const updateProgressUI = () => {
      const max = progressState.max || 0;
      const value = progressState.value || 0;
      const hasProgress = max > 0;
      const computed = hasProgress ? Math.min(100, Math.round((value / max) * 100)) : null;
      const fallback = typeof progressState.loopPercent === "number" ? progressState.loopPercent : null;
      const rawPercent = computed ?? fallback;
      const hasPercent = rawPercent !== null && rawPercent !== undefined;
      const percent = hasPercent ? Math.min(100, Math.max(0, Math.round(rawPercent))) : 0;
      const isIndeterminate = !hasProgress && progressState.status === "running" && fallback == null;
      progressWrap.classList.toggle("indeterminate", isIndeterminate);
      progressBar.style.width = isIndeterminate ? "0%" : `${percent}%`;
      progressNode.textContent = progressState.node || "Idle";
      if (hasProgress) {
        progressStateText.textContent = `${progressState.status} · exec ${percent}%`;
      } else if (fallback != null) {
        progressStateText.textContent = `${progressState.status} · loop ${percent}%`;
      } else {
        progressStateText.textContent = `${progressState.status}`;
      }
    };

    const lightbox = el("div", { class: "lemouf-loop-lightbox", id: "lemouf-loop-lightbox" }, [
      el("button", { text: "Close", onclick: () => lightbox.classList.remove("is-open") }),
      el("img", { src: "" }),
    ]);
    document.body.appendChild(lightbox);
    const lightboxImg = lightbox.querySelector("img");
    lightbox.addEventListener("click", (ev) => {
      if (ev.target === lightbox) lightbox.classList.remove("is-open");
    });

    const previewImg = el("img", { class: "lemouf-loop-preview-img", src: "" });
    const previewSpinner = el("div", { class: "lemouf-loop-spinner" });
    const previewEmpty = el("div", { class: "lemouf-loop-preview-empty", text: "No image yet." });
    const previewWrap = el("div", { class: "lemouf-loop-preview" }, [previewEmpty, previewImg, previewSpinner]);
    previewImg.addEventListener("click", () => {
      const full = previewImg.dataset.full || previewImg.src;
      if (!full) return;
      if (lightboxImg) {
        lightboxImg.src = full;
        lightbox.classList.add("is-open");
      } else {
        window.open(full, "_blank");
      }
    });
    previewImg.addEventListener("load", () => {
      previewWrap.classList.remove("is-loading");
    });
    previewImg.addEventListener("error", () => {
      previewWrap.classList.remove("is-loading");
    });

    const setStatus = (msg) => {
      actionStatus.textContent = msg || "";
    };

    const setCompatStatus = (msg) => {
      compatStatus.textContent = msg || "";
    };

    const setCurrentLoopId = (loopId) => {
      currentLoopId = loopId || "";
      loopIdLabel.textContent = currentLoopId ? `Loop ${shortId(currentLoopId)}` : "No loop";
    };

    const setStarted = (value) => {
      hasStarted = Boolean(value);
      if (postStartSection) {
        postStartSection.style.display = hasStarted ? "" : "none";
      }
      if (preStartSection) {
        preStartSection.style.display = hasStarted ? "none" : "";
      }
      if (panel) {
        panel.classList.toggle("lemouf-loop-started", hasStarted);
      }
    };

    const applyGutterWidth = (width) => {
      const clamped = Math.max(300, Math.min(720, Math.round(width)));
      document.documentElement.style.setProperty("--lemouf-gutter", `${clamped}px`);
      if (panel) panel.style.width = `var(--lemouf-gutter)`;
      const root = getGutterRoot();
      if (root) {
        root.style.boxSizing = "border-box";
        root.style.width = `calc(100% - ${clamped}px)`;
        root.style.maxWidth = `calc(100% - ${clamped}px)`;
        root.style.paddingRight = "0px";
        root.style.marginRight = "0px";
        root.style.transition = "width 120ms ease";
      }
      try {
        const comfyApp = getComfyApp();
        comfyApp?.canvas?.resize?.();
        comfyApp?.graph?.setDirtyCanvas?.(true, true);
      } catch {}
      return clamped;
    };

    const refreshLoops = async (selectLoopId = null) => {
      setStatus("Refreshing loops...");
      const data = await apiGet("/lemouf/loop/list");
      const loops = data?.loops || [];
      if (loops.length > 0) {
        const desired = selectLoopId && loops.some((l) => l.loop_id === selectLoopId) ? selectLoopId : loops[0].loop_id;
        setCurrentLoopId(desired);
        await refreshLoopDetail();
      } else {
        setCurrentLoopId("");
      }
      setStatus(loops.length ? "Loops refreshed." : "No loops found.");
    };

    const refreshLoopDetail = async () => {
      const loopId = currentLoopId;
      if (!loopId) return;
      setStatus("Loading loop detail...");
      const data = await apiGet(`/lemouf/loop/${loopId}`);
      if (!data) return;
      statusBadge.textContent = data.status || "idle";
      const total = Number(data.total_cycles || 0);
      const current = Number(data.current_cycle || 0);
      const displayCycle = total ? Math.min(current + 1, total) : current + 1;
      cycleBadge.textContent = total ? `cycle ${displayCycle}/${total}` : `cycle ${displayCycle}`;
      progressState.loopPercent = total ? Math.min(100, Math.round((current / total) * 100)) : null;
      const retry = Number(data.current_retry || 0);
      retryBadge.textContent = `r${retry}`;
      const ctxNode = getLoopContextNode(loopId);
      const baseSeed = getWidgetValue(ctxNode, "base_seed");
      const seedMode = getWidgetValue(ctxNode, "seed_mode") || "cycle+retry";
      try {
        const seed = await computeSeed(loopId, current, retry, baseSeed, seedMode);
        seedBadge.textContent = `seed ${seed}`;
      } catch {
        seedBadge.textContent = "seed ?";
      }
      cyclesInput.value = total || 1;
      if (data.status === "running" && progressState.status !== "running") {
        progressState.status = "running";
        progressState.node = progressState.node || "Running…";
        updateProgressUI();
      }
      if (data.status && data.status !== "running") {
        updateProgressUI();
      }
      overridesBox.value = JSON.stringify(data.overrides || {}, null, 2);
      manifestBox.innerHTML = "";
      const manifest = data.manifest || [];
      const pickLatest = (entries, currentCycle) => {
        let best = null;
        let bestTs = -1;
        for (const entry of entries) {
          if (currentCycle != null && entry.cycle_index !== currentCycle) continue;
          const images = entry.outputs?.images;
          if (!Array.isArray(images) || images.length === 0) continue;
          const ts = Number(entry.updated_at || entry.created_at || 0);
          if (ts >= bestTs) {
            best = { entry, image: images[0], ts };
            bestTs = ts;
          }
        }
        return best;
      };
      let latest = pickLatest(manifest, current);
      if (!latest) latest = pickLatest(manifest, null);
      if (latest?.image) {
        const fullSrc = buildImageSrc(latest.image, false);
        const thumbSrc = buildImageSrc(latest.image, true);
        previewWrap.classList.add("is-loading");
        previewImg.src = thumbSrc;
        previewImg.dataset.full = fullSrc;
        previewImg.style.display = "block";
        previewEmpty.style.display = "none";
      } else {
        previewImg.style.display = "none";
        previewEmpty.style.display = "block";
        previewWrap.classList.remove("is-loading");
      }
      if (!manifest.length) {
        manifestBox.textContent = "No cycles yet.";
      } else {
        const grouped = new Map();
        for (const entry of manifest) {
          const key = Number(entry.cycle_index ?? 0);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(entry);
        }
        const orderedCycles = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
        const totalCycles = Number(data.total_cycles || 0);
        for (const [cycleIndex, entries] of orderedCycles) {
          entries.sort((a, b) => Number(a.retry_index ?? 0) - Number(b.retry_index ?? 0));
          const cycleRow = el("div", { class: "lemouf-loop-cycle" });
          const headerText = totalCycles
            ? `cycle ${cycleIndex + 1}/${totalCycles}`
            : `cycle ${cycleIndex + 1}`;
          cycleRow.appendChild(el("div", { class: "lemouf-loop-cycle-header", text: headerText }));

          const strip = el("div", { class: "lemouf-loop-cycle-strip" });
          for (const entry of entries) {
            const decision = entry.decision || entry.status || "pending";
            const decisionLabel = String(decision || "pending").toUpperCase();
            const decisionClass = badgeClassForDecision(decision);
            const images = entry.outputs?.images;
            if (Array.isArray(images) && images.length > 0) {
              for (const image of images) {
                const card = el("div", { class: "lemouf-loop-result-card is-loading" });
                const spinner = el("div", { class: "lemouf-loop-spinner" });
                card.appendChild(
                  el("div", { class: `lemouf-loop-result-badge ${decisionClass}`, text: decisionLabel })
                );
                const fullSrc = buildImageSrc(image, false);
                const thumbSrc = buildImageSrc(image, true);
                const thumb = el("img", { class: "lemouf-loop-thumb", src: thumbSrc });
                const showQuickActions = decisionClass === "returned" || decisionClass === "replay";
                let actionOverlay = null;
                if (showQuickActions) {
                  const approveBtn = el("button", { class: "lemouf-loop-thumb-action approve", text: "✓" });
                  const rejectBtn = el("button", { class: "lemouf-loop-thumb-action reject", text: "✕" });
                  approveBtn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (card.classList.contains("is-deciding")) return;
                    card.classList.add("is-deciding");
                    rejectBtn.style.opacity = "0";
                    const buttonRect = approveBtn.getBoundingClientRect();
                    const cardRect = card.getBoundingClientRect();
                    const targetX = cardRect.left + cardRect.width / 2 - buttonRect.width / 2;
                    const targetY = cardRect.top + cardRect.height / 2 - buttonRect.height / 2;
                    const dx = targetX - buttonRect.left;
                    const dy = targetY - buttonRect.top;
                    approveBtn.animate(
                      [
                        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
                        { transform: `translate(${dx}px, ${dy}px) scale(1.35)`, opacity: 0 },
                      ],
                      { duration: 260, easing: "ease-out", fill: "forwards" }
                    );
                    decideEntry(entry.cycle_index ?? 0, entry.retry_index ?? 0, "approve", entry.status || "");
                  });
                  rejectBtn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (card.classList.contains("is-deciding")) return;
                    card.classList.add("is-deciding");
                    approveBtn.style.opacity = "0";
                    const buttonRect = rejectBtn.getBoundingClientRect();
                    const cardRect = card.getBoundingClientRect();
                    const targetX = cardRect.left + cardRect.width / 2 - buttonRect.width / 2;
                    const targetY = cardRect.top + cardRect.height / 2 - buttonRect.height / 2;
                    const dx = targetX - buttonRect.left;
                    const dy = targetY - buttonRect.top;
                    rejectBtn.animate(
                      [
                        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
                        { transform: `translate(${dx}px, ${dy}px) scale(1.35)`, opacity: 0 },
                      ],
                      { duration: 260, easing: "ease-out", fill: "forwards" }
                    );
                    decideEntry(entry.cycle_index ?? 0, entry.retry_index ?? 0, "reject", entry.status || "");
                  });
                  actionOverlay = el("div", { class: "lemouf-loop-thumb-actions" }, [rejectBtn, approveBtn]);
                  card.appendChild(actionOverlay);
                }
                thumb.addEventListener("load", () => {
                  card.classList.remove("is-loading");
                });
                thumb.addEventListener("error", () => {
                  card.classList.remove("is-loading");
                });
                thumb.addEventListener("click", () => {
                  if (lightboxImg) {
                    lightboxImg.src = fullSrc;
                    lightbox.classList.add("is-open");
                  } else {
                    window.open(fullSrc, "_blank");
                  }
                });
                card.appendChild(thumb);
                card.appendChild(spinner);
                strip.appendChild(card);
              }
            } else {
              const card = el("div", { class: "lemouf-loop-result-card" });
              const spinner = el("div", { class: "lemouf-loop-spinner" });
              card.appendChild(
                el("div", { class: `lemouf-loop-result-badge ${decisionClass}`, text: decisionLabel })
              );
              card.appendChild(el("div", { class: "lemouf-loop-result-placeholder", text: `r${entry.retry_index ?? 0}` }));
              if (decisionClass === "queued" || decisionClass === "running") {
                card.classList.add("is-loading");
                card.appendChild(spinner);
              }
              strip.appendChild(card);
            }
          }
          cycleRow.appendChild(strip);
          manifestBox.appendChild(cycleRow);
        }
      }
      setStatus("Loop detail loaded.");
      if (!hasStarted) {
        const manifest = data.manifest || [];
        if (manifest.length > 0 || data.status === "running" || data.status === "complete") {
          setStarted(true);
        }
      }
      const isComplete = data.status === "complete";
      exportBtn.style.display = isComplete ? "" : "none";
      exitBtn.style.display = isComplete ? "" : "none";
      headerExitBtn.style.display = hasStarted ? "" : "none";
      actionRow.style.display = isComplete ? "none" : "";
      if (isComplete) {
        setStatus("Loop complete ✅");
      }
      return data;
    };

    const createLoopInternal = async (desiredCycles) => {
      const res = await apiPost("/lemouf/loop/create", {});
      if (!res?.loop_id) {
        setStatus("Create failed (see console).");
        return null;
      }
      if (Number.isFinite(desiredCycles) && desiredCycles >= 1) {
        await apiPost("/lemouf/loop/config", { loop_id: res.loop_id, total_cycles: desiredCycles });
      }
      await refreshLoops(res.loop_id);
      setCurrentLoopId(res.loop_id);
      return res.loop_id;
    };

    const createLoop = async () => {
      setStatus("Creating loop...");
      const desiredCycles = Number(cyclesInput.value || 1);
      const loopId = await createLoopInternal(desiredCycles);
      if (loopId) {
        setStatus(`Loop created: ${loopId}`.trim());
      }
    };

    const setCurrentWorkflow = async ({ silent = false, force = false } = {}) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      if (!silent) setStatus("Reading current workflow...");
      const payload = await getCurrentPromptPayload();
      const prompt =
        payload?.output ??
        payload?.prompt ??
        (payload && typeof payload === "object" ? payload : null);
      if (!prompt || typeof prompt !== "object") {
        console.warn("[leMouf Loop] Unable to get prompt from current workflow");
        if (!silent) setStatus("Unable to read current workflow.");
        return;
      }
      const signature = signatureFromPrompt(prompt);
      if (!force && signature && signature === lastWorkflowSignature && !workflowDirty) {
        if (!silent) setStatus("Workflow unchanged.");
        return true;
      }
      if (!silent) setStatus("Sending workflow to loop...");
      workflowSyncInFlight = true;
      const res = await apiPost("/lemouf/loop/set_workflow", {
        loop_id: loopId,
        prompt,
        workflow: payload?.workflow,
      });
      workflowSyncInFlight = false;
      if (!res) {
        if (!silent) setStatus(lastApiError || "Set workflow failed (see console).");
        return;
      }
      lastWorkflowSignature = signature || lastWorkflowSignature;
      workflowDirty = false;
      await refreshLoopDetail();
      if (!silent) setStatus("Workflow loaded ✅");
      return true;
    };

    const setTotalCycles = async () => {
      const loopId = currentLoopId;
      if (!loopId) return;
      const total = Number(cyclesInput.value || 1);
      if (!Number.isFinite(total) || total < 1) {
        setStatus("Total cycles must be >= 1.");
        return;
      }
      setStatus("Saving total cycles...");
      const res = await apiPost("/lemouf/loop/config", { loop_id: loopId, total_cycles: total });
      if (!res) {
        setStatus("Failed to save cycles (see console).");
        return;
      }
      await refreshLoopDetail();
      setStatus(`Total cycles set to ${total}.`);
    };

    const injectLoopId = async () => {
      const loopId = currentLoopId;
      if (!loopId) return;
      const comfyApp = getComfyApp();
      const canvas = comfyApp?.canvas;
      const selected = getSelectedNodes(canvas);
      const targetNodes =
        selected.length > 0
          ? selected
          : comfyApp?.rootGraph?.nodes || comfyApp?.graph?.nodes || [];
      const updated = setLoopIdOnNodes(loopId, targetNodes);
      if (!updated) {
        setStatus("No nodes with loop_id found (select nodes or add Loop nodes).");
      } else {
        setStatus(`loop_id injected into ${updated} node(s).`);
      }
      try {
        canvas?.setDirty?.(true, true);
      } catch {}
    };

    const stepCycle = async ({ retryIndex = null, autoInject = false, forceSync = false } = {}) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      setStatus("Stepping cycle...");
      if (autoInject) {
        const updated = setLoopIdOnNodes(loopId, getSelectedNodes(getComfyApp()?.canvas).length
          ? getSelectedNodes(getComfyApp()?.canvas)
          : getComfyApp()?.rootGraph?.nodes || getComfyApp()?.graph?.nodes || []);
        if (updated) {
          workflowDirty = true;
        }
      }
      if (autoSyncToggle.checked && (workflowDirty || !lastWorkflowSignature || forceSync) && !workflowSyncInFlight) {
        const ok = await setCurrentWorkflow({ silent: true, force: forceSync });
        if (!ok) {
          setStatus(lastApiError || "Workflow sync failed.");
          return;
        }
      }
      const payload = { loop_id: loopId };
      if (Number.isFinite(retryIndex)) payload.retry_index = retryIndex;
      const res = await apiPost("/lemouf/loop/step", payload);
      if (!res) {
        setStatus(lastApiError || "Step failed (see console).");
        return;
      }
      lastStepPromptId = res.prompt_id || null;
      progressState = {
        promptId: lastStepPromptId,
        value: 0,
        max: 0,
        node: "Queued…",
        status: "queued",
      };
      updateProgressUI();
      await refreshLoopDetail();
      setStatus("Cycle queued.");
      setStarted(true);
      startAutoRefresh();
    };

    const decision = async (choice) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      const detail = await apiGet(`/lemouf/loop/${loopId}`);
      if (!detail) return;
      const cycleIndex = detail.current_cycle ?? 0;
      const retryIndex = detail.current_retry ?? 0;
      setStatus(`Decision: ${choice}...`);
      const res = await apiPost("/lemouf/loop/decision", {
        loop_id: loopId,
        cycle_index: cycleIndex,
        retry_index: retryIndex,
        decision: choice,
      });
      if (!res) {
        setStatus(lastApiError || "Decision failed (see console).");
        return;
      }
      const after = await refreshLoopDetail();
      setStatus(`Decision saved: ${choice}.`);
      if (choice === "replay" || choice === "reject") {
        const nextRetry = Number(detail?.current_retry ?? 0) + 1;
        await stepCycle({ retryIndex: nextRetry, autoInject: true, forceSync: true });
        return;
      }
      if (choice === "approve") {
        const total = Number(after?.total_cycles || 0);
        const current = Number(after?.current_cycle || 0);
        if (!total || current < total) {
          await stepCycle({ autoInject: true });
        }
      }
    };

    const decideEntry = async (cycleIndex, retryIndex, choice, entryStatus = "") => {
      const loopId = currentLoopId;
      if (!loopId) return;
      setStatus(`Decision: ${choice}...`);
      const res = await apiPost("/lemouf/loop/decision", {
        loop_id: loopId,
        cycle_index: cycleIndex,
        retry_index: retryIndex,
        decision: choice,
      });
      if (!res) {
        setStatus(lastApiError || "Decision failed (see console).");
        return;
      }
      const after = await refreshLoopDetail();
      setStatus(`Decision saved: ${choice}.`);
      const canAutoRun = String(entryStatus || "").toLowerCase() === "returned";
      if (canAutoRun) {
        if (choice === "replay" || choice === "reject") {
          const nextRetry = Number(retryIndex ?? 0) + 1;
          await stepCycle({ retryIndex: nextRetry, autoInject: true, forceSync: true });
          return;
        }
        if (choice === "approve") {
          const total = Number(after?.total_cycles || 0);
          const current = Number(after?.current_cycle || 0);
          if (!total || current < total) {
            await stepCycle({ autoInject: true });
          }
        }
      }
    };

    const applyOverrides = async () => {
      const loopId = currentLoopId;
      if (!loopId) return;
      let data = {};
      try {
        data = JSON.parse(overridesBox.value || "{}");
      } catch {
        setStatus("Overrides JSON invalid.");
        return;
      }
      setStatus("Applying overrides...");
      const res = await apiPost("/lemouf/loop/overrides", { loop_id: loopId, overrides: data });
      if (!res) {
        setStatus("Overrides failed (see console).");
        return;
      }
      await refreshLoopDetail();
      setStatus("Overrides applied.");
    };

    const exportApproved = async () => {
      const loopId = currentLoopId;
      if (!loopId) return;
      setStatus("Exporting approved images...");
      const res = await apiPost("/lemouf/loop/export_approved", { loop_id: loopId });
      if (!res) {
        setStatus(lastApiError || "Export failed.");
        return;
      }
      setStatus(`Exported ${res.count || 0} image(s) to ${res.folder || "output"}.`);
    };

    const resetToStart = async () => {
      setStatus("");
      setCompatStatus("");
      setStarted(false);
      const loopId = currentLoopId;
      if (loopId) {
        await apiPost("/lemouf/loop/reset", { loop_id: loopId, keep_workflow: true });
      }
      currentLoopId = "";
      loopIdLabel.textContent = "No loop";
      retryBadge.textContent = "r0";
      cycleBadge.textContent = "cycle 0/0";
      statusBadge.textContent = "idle";
      seedBadge.textContent = "seed ?";
      progressState = { promptId: null, value: 0, max: 0, node: "", status: "idle", loopPercent: null };
      updateProgressUI();
      previewImg.style.display = "none";
      previewEmpty.style.display = "block";
      manifestBox.innerHTML = "";
      await refreshLoops();
      await runValidation(true);
    };

    const formatValidationMessage = (result) => {
      if (!result) return "Validation failed.";
      const lines = [];
      if (result.errors?.length) {
        lines.push("Missing / errors:");
        for (const err of result.errors) lines.push(`- ${err}`);
      }
      if (result.warnings?.length) {
        lines.push("Warnings:");
        for (const warn of result.warnings) lines.push(`- ${warn}`);
      }
      return lines.join("\n");
    };

    const updateValidationUI = (result) => {
      if (!result) {
        setCompatStatus("Workflow not readable.");
        validateBtn.disabled = true;
        return;
      }
      if (result.ok) {
        setCompatStatus(result.warnings?.length ? formatValidationMessage(result) : "Workflow compatible.");
        validateBtn.disabled = false;
      } else {
        setCompatStatus(formatValidationMessage(result));
        validateBtn.disabled = true;
      }
    };

    const scheduleValidationRetry = () => {
      if (validationRetryTimer || validationRetries >= VALIDATION_RETRY_MAX) return;
      validationRetryTimer = setTimeout(async () => {
        validationRetryTimer = null;
        validationRetries += 1;
        await runValidation(true);
      }, VALIDATION_RETRY_DELAY);
    };

    const runValidation = async (force = false) => {
      if (validationInFlight) return null;
      validationInFlight = true;
      const payload = await getCurrentPromptPayload();
      const prompt =
        payload?.output ??
        payload?.prompt ??
        (payload && typeof payload === "object" ? payload : null);
      const workflowNodes = Array.isArray(payload?.workflow?.nodes) ? payload.workflow.nodes : null;
      const signature = signatureFromPrompt(prompt);
      if (!force && signature && signature === lastValidationSignature) {
        validationInFlight = false;
        return { ok: !validateBtn.disabled, errors: [], warnings: [] };
      }
      const validation = validateWorkflow(prompt, workflowNodes);
      lastValidationSignature = signature || lastValidationSignature;
      updateValidationUI(validation);
      validationInFlight = false;
      if (!validation.ok && validation.errors?.some((e) => e.includes("Workflow not readable"))) {
        scheduleValidationRetry();
      } else {
        validationRetries = 0;
      }
      return validation;
    };

    const validateAndStart = async () => {
      const validation = await runValidation();
      if (!validation?.ok) {
        setStatus("Workflow not compatible.");
        return;
      }
      const desiredCycles = Number(cyclesInput.value || 1);
      const loopId = await createLoopInternal(desiredCycles);
      if (!loopId) {
        setStatus("Unable to create loop.");
        return;
      }
      setCurrentLoopId(loopId);
      await refreshLoopDetail();
      setStatus("Injecting loop_id...");
      await injectLoopId();
      setStatus("Syncing workflow...");
      const ok = await setCurrentWorkflow({ force: true });
      if (!ok) {
        setStatus(lastApiError || "Workflow sync failed.");
        return;
      }
      setStatus("Starting cycle...");
      await stepCycle({ forceSync: false });
    };

    const stopAutoRefresh = () => {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
      autoRefreshAttempts = 0;
    };

    const startAutoRefresh = () => {
      stopAutoRefresh();
      autoRefreshTimer = setInterval(async () => {
        autoRefreshAttempts += 1;
        const data = await refreshLoopDetail();
        if (!data) return;
        const manifest = data.manifest || [];
        if (lastStepPromptId) {
          const entry = manifest.find((m) => m.prompt_id === lastStepPromptId);
          if (entry && (entry.status === "returned" || entry.outputs?.images?.length)) {
            setStatus("Cycle ready ✅");
            stopAutoRefresh();
            return;
          }
        }
        if (autoRefreshAttempts >= AUTO_REFRESH_MAX) {
          setStatus("Auto-refresh stopped (timeout).");
          stopAutoRefresh();
        }
      }, 900);
    };

    const resizer = el("div", { class: "lemouf-loop-resizer" });
    const validateBtn = el("button", { class: "lemouf-loop-btn alt", onclick: validateAndStart, text: "Validate & Start" });
    const preStartSection = el("div", { class: "lemouf-loop-prestart" });
    const postStartSection = el("div", { class: "lemouf-loop-poststart", style: "display:none;" });
    const postStartTop = el("div", { class: "lemouf-loop-poststart-top" });
    const postStartBottom = el("div", { class: "lemouf-loop-poststart-bottom" });
    const exportBtn = el("button", { class: "lemouf-loop-btn alt", text: "Export approved", onclick: exportApproved });
    const exitBtn = el("button", { class: "lemouf-loop-btn alt", text: "Exit loop", onclick: resetToStart });
    const headerExitBtn = el("button", { class: "lemouf-loop-header-btn", title: "Exit loop", text: "⏏" });
    headerExitBtn.addEventListener("click", resetToStart);
    exportBtn.style.display = "none";
    exitBtn.style.display = "none";
    headerExitBtn.style.display = "none";
    const actionRow = el("div", { class: "lemouf-loop-row" }, [
      el("button", { class: "lemouf-loop-btn lemouf-loop-action approve", onclick: () => decision("approve"), text: "Approve" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action reject", onclick: () => decision("reject"), text: "Reject" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action replay", onclick: () => decision("replay"), text: "Replay" }),
    ]);
    panel = el("div", { class: "lemouf-loop-panel", id: "lemouf-loop-panel" }, [
      resizer,
      el("div", { class: "lemouf-loop-header" }, [
        el("div", { class: "lemouf-loop-title", text: "leMouf Loop" }),
        headerExitBtn,
      ]),
      preStartSection,
      postStartSection,
    ]);

    preStartSection.append(
      el("div", { class: "lemouf-loop-inline" }, [
        el("label", { text: "Total cycles" }),
        cyclesInput,
        validateBtn,
      ]),
      el("div", { class: "lemouf-loop-field" }, [compatStatus]),
    );

    postStartSection.append(postStartTop, postStartBottom);

    postStartTop.append(
      progressWrap,
      previewWrap,
      actionRow,
      el("div", { class: "lemouf-loop-row" }, [exportBtn]),
      el("div", { class: "lemouf-loop-row" }, [exitBtn]),
      el("div", { class: "lemouf-loop-field", style: "display:none;" }, [el("div", { text: "Overrides (JSON map)" })]),
      el("div", { class: "lemouf-loop-field", style: "display:none;" }, [overridesBox]),
      el("div", { class: "lemouf-loop-row", style: "display:none;" }, [
        el("button", { class: "lemouf-loop-btn", onclick: applyOverrides, text: "Apply overrides" }),
      ]),
      el("div", { class: "lemouf-loop-field" }, [actionStatus]),
      el("div", { class: "lemouf-loop-field" }, [manifestBox]),
    );

    postStartBottom.append(
      el("details", { class: "lemouf-loop-accordion" }, [
        el("summary", { text: "Advanced controls" }),
        loopIdLabel,
        el("div", { class: "lemouf-loop-row" }, [statusBadge, cycleBadge, retryBadge, seedBadge]),
        el("div", { class: "lemouf-loop-row" }, [
          el("button", { class: "lemouf-loop-btn", onclick: createLoop, text: "Create" }),
          el("button", { class: "lemouf-loop-btn alt", onclick: refreshLoops, text: "Refresh" }),
          el("button", { class: "lemouf-loop-btn ghost", onclick: setTotalCycles, text: "Set cycles" }),
        ]),
        el("div", { class: "lemouf-loop-row" }, [
          autoSyncLabel,
          el("button", { class: "lemouf-loop-btn alt", onclick: () => setCurrentWorkflow({ force: true }), text: "Sync now" }),
        ]),
        el("div", { class: "lemouf-loop-row" }, [
          el("button", { class: "lemouf-loop-btn", onclick: setCurrentWorkflow, text: "Use current WF" }),
          el("button", { class: "lemouf-loop-btn", onclick: injectLoopId, text: "Inject loop_id" }),
          el("button", { class: "lemouf-loop-btn alt", onclick: stepCycle, text: "Step cycle" }),
        ]),
      ]),
    );

    document.body.appendChild(panel);
    let currentGutter = applyGutterWidth(
      Number(localStorage.getItem("lemoufLoopGutterWidth") || 420)
    );
    resizer.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startWidth = currentGutter;
      const onMove = (moveEv) => {
        const delta = startX - moveEv.clientX;
        currentGutter = applyGutterWidth(startWidth + delta);
      };
      const onUp = () => {
        localStorage.setItem("lemoufLoopGutterWidth", String(currentGutter));
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    try {
      api.addEventListener?.("graphChanged", () => {
        workflowDirty = true;
        runValidation(true);
      });
      api.addEventListener?.("graphLoaded", () => runValidation(true));
      api.addEventListener?.("workflowLoaded", () => runValidation(true));
      api.addEventListener?.("graphSerialized", () => runValidation(true));
      api.addEventListener?.("progress", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        if (progressState.promptId && !promptId) return;
        progressState.value = Number(detail.value ?? detail.current ?? 0);
        progressState.max = Number(detail.max ?? detail.total ?? 0);
        if (detail.node) progressState.node = String(detail.node);
        progressState.status = "running";
        updateProgressUI();
      });
      api.addEventListener?.("executing", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        if (detail.node) {
          progressState.node = String(detail.node);
          progressState.status = "running";
          updateProgressUI();
        }
      });
      api.addEventListener?.("execution_start", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "running";
        updateProgressUI();
      });
      api.addEventListener?.("execution_success", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "done";
        progressState.value = progressState.max || progressState.value;
        updateProgressUI();
        refreshLoopDetail();
      });
      api.addEventListener?.("execution_error", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "error";
        updateProgressUI();
      });
    } catch {}
    await refreshLoops();
    await runValidation(true);
    } catch (err) {
      console.error("[leMouf Loop] setup failed:", err);
    }
  },
});
