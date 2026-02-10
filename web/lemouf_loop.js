import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { el } from "./ui/dom.js";
import { injectStyles } from "./ui/styles.js";
import { createPayloadView } from "./ui/payload_view.js";
import { createPipelineGraphView } from "./ui/pipeline_graph.js";
import { createHomeScreen } from "./ui/home_screen.js";
import { createRunScreen } from "./ui/run_screen.js";

let lastApiError = "";

if (window.__lemoufLoopRegistered) {
  console.warn("[leMouf Loop] extension already registered, skipping");
} else {
  window.__lemoufLoopRegistered = true;
  console.log("[leMouf Loop] extension loaded");
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

function extractPipelineSteps(prompt) {
  if (!prompt || typeof prompt !== "object") return [];
  const steps = [];
  const incoming = new Map();
  const outgoing = new Map();
  for (const [nodeId, node] of Object.entries(prompt)) {
    if (String(node?.class_type || "") !== "LoopPipelineStep") continue;
    const inputs = node?.inputs || {};
    const rawIndex = Number(inputs.step_index);
    const fallbackIndex = Number.isFinite(rawIndex) ? rawIndex : Number(nodeId);
    const role = String(inputs.role || "");
    const workflow = String(inputs.workflow || "");
    const id = String(nodeId);
    steps.push({ id, role, workflow, stepIndex: Number.isFinite(rawIndex) ? rawIndex : fallbackIndex });
    const flow = inputs.flow;
    if (Array.isArray(flow) && flow.length >= 1) {
      const src = String(flow[0]);
      incoming.set(id, src);
      if (!outgoing.has(src)) outgoing.set(src, []);
      outgoing.get(src).push(id);
    }
  }

  if (!steps.length) return [];
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set();
  const order = [];
  const sortIds = (ids) =>
    ids.sort((a, b) => {
      const sa = stepMap.get(a);
      const sb = stepMap.get(b);
      if (sa && sb && sa.stepIndex !== sb.stepIndex) return sa.stepIndex - sb.stepIndex;
      return a.localeCompare(b);
    });

  const startIds = sortIds(steps.map((s) => s.id).filter((id) => !incoming.has(id)));
  const walk = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const step = stepMap.get(id);
    if (step) order.push(step);
    const nexts = outgoing.get(id) || [];
    sortIds(nexts);
    for (const nextId of nexts) walk(nextId);
  };
  for (const id of startIds) walk(id);
  if (order.length < steps.length) {
    const remaining = steps.filter((s) => !visited.has(s.id));
    remaining.sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
    order.push(...remaining);
  }
  return order;
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

  const hasLoopReturn = hasType(types, "LoopReturn") || hasType(types, "Loop Return");
  const hasLoopMap = hasType(types, "LoopMap") || hasType(types, "Loop Map");
  const hasPipelineStep =
    hasType(types, "LoopPipelineStep") || hasType(types, "Loop Pipeline Step");

  if (hasPipelineStep) {
    if (!hasLoopMap) errors.push("Missing Loop Map node (required for pipeline).");
    return { ok: errors.length === 0, errors, warnings };
  }

  if (!hasLoopReturn) errors.push("Missing Loop Return node.");
  if (!hasLoopMap) warnings.push("Loop Map node not found (payload mapping disabled).");

  if (prompt && typeof prompt === "object") {
    let returnHasPayload = false;
    const entries = Object.entries(prompt);
    const loopReturns = entries.filter(([, node]) => String(node?.class_type || "") === "LoopReturn");
    for (const [, node] of loopReturns) {
      const payloadInput = node?.inputs?.payload;
      if (Array.isArray(payloadInput)) {
        returnHasPayload = true;
        break;
      }
      if (payloadInput !== undefined && payloadInput !== null && payloadInput !== "") {
        returnHasPayload = true;
        break;
      }
    }
    if (!returnHasPayload) {
      warnings.push("Loop Return has no payload input linked.");
    }
  } else {
    warnings.push("Graph linkage checks require a synced workflow.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function getComfyApp() {
  return window?.comfyAPI?.app?.app || app || window?.app || null;
}

async function loadWorkflowData(data) {
  const comfyApp = getComfyApp();
  if (!comfyApp || !data) return false;
  try {
    if (typeof comfyApp.loadGraphData === "function") {
      await comfyApp.loadGraphData(data);
      return true;
    }
    if (typeof comfyApp.loadWorkflow === "function") {
      await comfyApp.loadWorkflow(data);
      return true;
    }
    if (comfyApp.graph && typeof comfyApp.graph.configure === "function") {
      comfyApp.graph.configure(data);
      comfyApp.graph.setDirtyCanvas?.(true, true);
      comfyApp.canvas?.resize?.();
      return true;
    }
  } catch (err) {
    console.warn("[leMouf Loop] load workflow failed:", err);
  }
  return false;
}

function getGutterRoot() {
  const first = document.body?.firstElementChild;
  if (first && first.tagName === "DIV") return first;
  return document.body;
}

function findMenuContainer() {
  return (
    document.querySelector("#comfyui-menu") ||
    document.querySelector(".comfy-menu") ||
    document.querySelector(".comfyui-menu") ||
    document.querySelector(".comfy-menu-list")
  );
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
    const overridesBox = el("textarea", { rows: 4 });
    const manifestBox = el("div", { class: "lemouf-loop-manifest" });
    const actionStatus = el("div", { class: "lemouf-loop-status", text: "" });
    const homeScreen = createHomeScreen();
    const {
      root: preStartSection,
      pipelineSelect,
      pipelineStatus,
      pipelineNav,
      pipelineLoadBtn,
      pipelineRefreshBtn,
      pipelineStartBtn,
      pipelineStartRow,
      cyclesRow,
      cyclesInput,
      validateBtn,
      compatStatus,
    } = homeScreen;
    const openLightbox = (src) => {
      if (!src) return;
      if (lightboxImg) {
        lightboxImg.src = src;
        lightbox.classList.add("is-open");
      } else {
        window.open(src, "_blank");
      }
    };
    const payloadView = createPayloadView({ buildImageSrc, openLightbox });
    const payloadSection = payloadView.root;
    const autoSyncToggle = el("input", { type: "checkbox", checked: true });
    const autoSyncLabel = el("label", { text: "Auto-sync WF" });
    autoSyncLabel.style.display = "flex";
    autoSyncLabel.style.alignItems = "center";
    autoSyncLabel.style.gap = "6px";
    autoSyncLabel.prepend(autoSyncToggle);

    let lastWorkflowSignature = null;
    let workflowDirty = false;
    let workflowSyncInFlight = false;
    let currentWorkflowName = null;
    let lastValidationSignature = null;
    let validationInFlight = false;
    let validationRetryTimer = null;
    let validationRetries = 0;
    const VALIDATION_RETRY_MAX = 12;
    const VALIDATION_RETRY_DELAY = 900;
    let currentLoopId = "";
    let hasStarted = false;
    let panelVisible = true;
    let menuToggleItem = null;
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
    const PANEL_VERSION = "0.2.0";
    let panel = null;
    let headerBackBtn = null;
    let headerMenu = null;
    let closeHeaderMenu = null;
    let pipelineActiveStepId = null;
    let pipelineSelectedStepId = null;
    const pipelineState = {
      steps: [],
      lastRun: null,
    };
    let pipelinePayloadEntry = null;
    let pipelineGraphView = null;
    let currentScreen = "home";
    let pendingScreen = null;

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
      openLightbox(full);
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

    const setPipelineStatus = (msg) => {
      pipelineStatus.textContent = msg || "";
    };

    const setPipelineGraphStatus = (msg) => {
      pipelineGraphView?.setStatus(msg || "");
    };

    const setPipelineLoaded = (loaded) => {
      const show = Boolean(loaded);
      pipelineNav.style.display = show ? "" : "none";
      pipelineStartRow.style.display = show ? "" : "none";
      compatStatus.style.display = show ? "" : "none";
    };

    const setCurrentLoopId = (loopId) => {
      currentLoopId = loopId || "";
      loopIdLabel.textContent = currentLoopId ? `Loop ${shortId(currentLoopId)}` : "No loop";
    };

    const setScreen = (name) => {
      currentScreen = name;
      if (!preStartSection || !payloadSection || !postStartSection) {
        pendingScreen = name;
        return;
      }
      if (preStartSection) preStartSection.style.display = name === "home" ? "" : "none";
      if (payloadSection) payloadSection.style.display = name === "payload" ? "" : "none";
      if (postStartSection) postStartSection.style.display = name === "run" ? "" : "none";
      hasStarted = name === "run";
      if (panel) panel.classList.toggle("lemouf-loop-started", hasStarted);
      if (headerBackBtn) headerBackBtn.style.display = name !== "home" ? "" : "none";
      if (typeof closeHeaderMenu === "function") closeHeaderMenu();
      if (name === "payload") updatePayloadSection();
      pendingScreen = null;
    };

    const setStarted = (value) => {
      setScreen(value ? "run" : "home");
    };

    const PIPELINE_KEY = "lemoufLoopPipelineName";
    let pipelineWorkflowList = [];
    const pipelineWorkflowCache = new Map();
    const refreshPipelineList = async ({ silent = false } = {}) => {
      const res = await apiGet("/lemouf/workflows/list");
      const list = res?.workflows;
      pipelineWorkflowList = Array.isArray(list) ? list.slice() : [];
      pipelineSelect.innerHTML = "";
      if (!Array.isArray(list) || list.length === 0) {
        pipelineSelect.appendChild(el("option", { value: "", text: "No workflows found" }));
        pipelineSelect.disabled = true;
        pipelineLoadBtn.disabled = true;
        const folder = res?.folder ? `Folder: ${res.folder}` : "Folder: workflows/";
        if (!silent) setPipelineStatus(`No workflows found. ${folder}`);
        return;
      }
      for (const name of list) {
        pipelineSelect.appendChild(el("option", { value: name, text: name }));
      }
      pipelineSelect.disabled = false;
      pipelineLoadBtn.disabled = false;
      const saved = localStorage.getItem(PIPELINE_KEY);
      if (saved && list.includes(saved)) pipelineSelect.value = saved;
      else pipelineSelect.value = list[0];
      if (!silent) setPipelineStatus("");
    };

    const loadPipelineWorkflow = async () => {
      const name = pipelineSelect.value;
      if (!name) {
        setPipelineStatus("Select a workflow first.");
        return;
      }
      localStorage.setItem(PIPELINE_KEY, name);
      setPipelineStatus("Loading pipeline...");
      const ok = await loadWorkflowByName(name);
      if (!ok) {
        setPipelineStatus("Failed to inject workflow into UI.");
        return;
      }
      setPipelineStatus(`Pipeline loaded: ${name}`);
      setPipelineLoaded(true);
      workflowDirty = true;
      setTimeout(() => {
        runValidation(true);
        setCurrentWorkflow({ force: true, silent: true });
      }, 250);
    };

    const loadWorkflowByName = async (name, { force = false, silent = false } = {}) => {
      if (!name) return false;
      if (!force && currentWorkflowName === name && !workflowDirty) {
        if (!silent) {
          setStatus(`Workflow already loaded: ${name}`);
        }
        try {
          const comfyApp = getComfyApp();
          comfyApp?.graph?.setDirtyCanvas?.(true, true);
          comfyApp?.canvas?.resize?.();
        } catch {}
        return true;
      }
      const res = await apiPost("/lemouf/workflows/load", { name });
      if (!res?.workflow) return false;
      const ok = await loadWorkflowData(res.workflow);
      if (ok) {
        currentWorkflowName = name;
        workflowDirty = false;
      }
      return ok;
    };

    const getWorkflowInfo = async (name) => {
      if (!name || name === "(none)") return { ok: false, error: "No workflow selected." };
      if (pipelineWorkflowCache.has(name)) return pipelineWorkflowCache.get(name);
      const res = await apiPost("/lemouf/workflows/load", { name });
      if (!res?.workflow) {
        const info = { ok: false, error: lastApiError || "Load failed." };
        pipelineWorkflowCache.set(name, info);
        return info;
      }
      const wf = res.workflow;
      const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
      const types = nodes.map((n) => String(n?.type || n?.class_type || ""));
      const info = {
        ok: true,
        hasLoopReturn: types.some((t) => t.includes("LoopReturn")),
        hasLoopMap: types.some((t) => t.includes("LoopMap")),
        hasLoopPayload: types.some((t) => t.includes("LoopPayload")),
        hasPipeline: types.some((t) => t.includes("LoopPipelineStep")),
      };
      pipelineWorkflowCache.set(name, info);
      return info;
    };

    const formatDuration = (ms) => {
      if (!ms || !Number.isFinite(ms)) return "";
      const s = ms / 1000;
      if (s < 60) return `${s.toFixed(1)}s`;
      const m = Math.floor(s / 60);
      const r = s - m * 60;
      return `${m}m ${r.toFixed(0)}s`;
    };

    const updatePayloadSection = () => {
      payloadView.setEntry(pipelinePayloadEntry);
    };

    pipelineGraphView = createPipelineGraphView({
      getWorkflowInfo,
      formatDuration,
      onNavigate: navigateToPipelineStep,
      getActiveStepId: () => pipelineActiveStepId,
      getSelectedStepId: () => pipelineSelectedStepId,
      getRunState: () => pipelineState.lastRun,
    });
    pipelineNav.append(pipelineGraphView.root, pipelineGraphView.status);

    const validatePipelineSteps = async (steps) => {
      if (!steps || steps.length === 0) return false;
      const executeStep = steps.find((s) => s.role === "execute");
      if (!executeStep) return false;
      for (const step of steps) {
        if (!step.workflow || step.workflow === "(none)") return false;
        const info = await getWorkflowInfo(step.workflow);
        if (!info.ok || !info.hasLoopReturn) return false;
      }
      return true;
    };

    const updatePipelineStep = (id, status, meta = {}) => {
      if (!pipelineState.lastRun) return;
      if (!pipelineState.lastRun.steps) pipelineState.lastRun.steps = {};
      const entry = pipelineState.lastRun.steps[id] || {};
      pipelineState.lastRun.steps[id] = { ...entry, status, ...meta };
    };

    const waitForManifest = async (predicate, { timeoutMs = 120000 } = {}) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const data = await refreshLoopDetail();
        if (data && predicate(data)) return data;
        await new Promise((r) => setTimeout(r, 800));
      }
      return null;
    };

    const renderPipelineGraph = async (steps) => {
      if (!pipelineGraphView) return;
      await pipelineGraphView.render(steps);
      updatePayloadSection();
    };

    async function navigateToPipelineStep(step) {
      if (!step || !step.workflow || step.workflow === "(none)") return;
      setStatus(`Loading workflow: ${step.workflow}`);
      const ok = await loadWorkflowByName(step.workflow);
      if (!ok) {
        setStatus(`Failed to load workflow: ${step.workflow}`);
        return;
      }
      pipelineSelectedStepId = step.id;
      await renderPipelineGraph(pipelineState.steps.length ? pipelineState.steps : [step]);
      workflowDirty = true;
      if (step.role === "execute") {
        setScreen("run");
        await setCurrentWorkflow({ force: true, silent: true });
        await refreshLoopDetail();
      } else {
        setScreen("payload");
        await runValidation(true);
      }
      setStatus(`Workflow loaded: ${step.workflow}`);
    }

    pipelineSelect.addEventListener("change", () => {
      const name = pipelineSelect.value;
      if (name) localStorage.setItem(PIPELINE_KEY, name);
    });
    pipelineLoadBtn.addEventListener("click", loadPipelineWorkflow);
    pipelineRefreshBtn.addEventListener("click", () => refreshPipelineList());
    pipelineStartBtn.addEventListener("click", () => validateAndStart());

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

    const clearGutter = () => {
      document.documentElement.style.removeProperty("--lemouf-gutter");
      const root = getGutterRoot();
      if (root) {
        root.style.width = "";
        root.style.maxWidth = "";
        root.style.paddingRight = "";
        root.style.marginRight = "";
        root.style.transition = "";
      }
      try {
        const comfyApp = getComfyApp();
        comfyApp?.canvas?.resize?.();
        comfyApp?.graph?.setDirtyCanvas?.(true, true);
      } catch {}
    };

    const updateToggleUI = () => {
      if (menuToggleItem) menuToggleItem.textContent = panelVisible ? "Hide leMouf Loop panel" : "Show leMouf Loop panel";
    };

    const setPanelVisible = (value) => {
      panelVisible = Boolean(value);
      if (panel) panel.style.display = panelVisible ? "" : "none";
      if (panelVisible) {
        applyGutterWidth(currentGutter);
      } else {
        clearGutter();
      }
      localStorage.setItem("lemoufLoopPanelVisible", panelVisible ? "1" : "0");
      updateToggleUI();
    };

    const togglePanel = () => {
      setPanelVisible(!panelVisible);
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
          setScreen("run");
        }
      }
      const isComplete = data.status === "complete";
      exportBtn.style.display = isComplete ? "" : "none";
      exitBtn.style.display = isComplete ? "" : "none";
      actionRow.style.display = isComplete ? "none" : "";
      if (isComplete) {
        setStatus("Loop complete ✅");
        if (pipelineState.lastRun && pipelineState.steps.length) {
          const execStep = pipelineState.steps.find((s) => s.role === "execute");
          if (execStep) {
            updatePipelineStep(execStep.id, "done", { endedAt: Date.now() });
            pipelineState.lastRun.endedAt = Date.now();
            renderPipelineGraph(pipelineState.steps);
          }
        }
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
      setScreen("run");
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
      setScreen("home");
      const loopId = currentLoopId;
      if (loopId) {
        await apiPost("/lemouf/loop/reset", { loop_id: loopId, keep_workflow: true });
      }
      currentLoopId = "";
      loopIdLabel.textContent = "No loop";
      retryBadge.textContent = "r0";
      cycleBadge.textContent = "cycle 0/0";
      statusBadge.textContent = "idle";
      progressState = { promptId: null, value: 0, max: 0, node: "", status: "idle", loopPercent: null };
      updateProgressUI();
      previewImg.style.display = "none";
      previewEmpty.style.display = "block";
      manifestBox.innerHTML = "";
      await refreshLoops();
      await runValidation(true);
    };

    const setupToggleControls = () => {
      if (!menuToggleItem) {
        const menu = findMenuContainer();
        if (menu) {
          menuToggleItem = el("button", { class: "lemouf-loop-menu-item", text: "Toggle leMouf Loop panel" });
          menuToggleItem.addEventListener("click", togglePanel);
          menu.appendChild(menuToggleItem);
        }
      }
      updateToggleUI();
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
      try {
        const payload = await getCurrentPromptPayload();
        const prompt =
          payload?.output ??
          payload?.prompt ??
          (payload && typeof payload === "object" ? payload : null);
        const workflowNodes = Array.isArray(payload?.workflow?.nodes) ? payload.workflow.nodes : null;
        const signature = signatureFromPrompt(prompt);
        if (!force && signature && signature === lastValidationSignature) {
          return { ok: !validateBtn.disabled, errors: [], warnings: [] };
        }
        const validation = validateWorkflow(prompt, workflowNodes);
        lastValidationSignature = signature || lastValidationSignature;
        const pipelineSteps = extractPipelineSteps(prompt);
        if (pipelineSteps.length) {
          pipelineState.steps = pipelineSteps;
          setPipelineLoaded(true);
          await renderPipelineGraph(pipelineSteps);
          const pipelineOk = await validatePipelineSteps(pipelineSteps);
          pipelineStartBtn.disabled = !pipelineOk;
          setCompatStatus(pipelineOk ? "Pipeline ready ✅" : "Pipeline incomplete or invalid.");
        } else if (pipelineState.steps.length) {
          setPipelineLoaded(true);
          await renderPipelineGraph(pipelineState.steps);
          const pipelineOk = await validatePipelineSteps(pipelineState.steps);
          pipelineStartBtn.disabled = !pipelineOk;
          setCompatStatus(pipelineOk ? "Pipeline ready ✅ (cached)" : "Pipeline incomplete or invalid.");
        } else {
          setPipelineLoaded(false);
          updateValidationUI(validation);
          pipelineGraphView?.root?.replaceChildren();
          setPipelineGraphStatus("Pipeline graph will appear here once loaded.");
          pipelineStartBtn.disabled = true;
        }
        if (!validation.ok && validation.errors?.some((e) => e.includes("Workflow not readable"))) {
          scheduleValidationRetry();
        } else {
          validationRetries = 0;
        }
        return validation;
      } finally {
        validationInFlight = false;
      }
    };

    const runPipeline = async (prompt) => {
      const steps = extractPipelineSteps(prompt);
      if (!steps.length) {
        setStatus("No pipeline steps found.");
        return false;
      }
      const generateStep = steps.find((s) => s.role === "generate");
      const executeStep = steps.find((s) => s.role === "execute");
      if (!executeStep) {
        setStatus("Pipeline missing execute step.");
        return false;
      }

      pipelineState.steps = steps;
      pipelinePayloadEntry = null;
      pipelineState.lastRun = {
        startedAt: Date.now(),
        endedAt: null,
        steps: Object.fromEntries(steps.map((s) => [s.id, { status: "pending" }])),
      };
      await renderPipelineGraph(steps);

      const desiredCycles = Number(cyclesInput.value || 1);
      const loopId = await createLoopInternal(desiredCycles);
      if (!loopId) return false;
      setCurrentLoopId(loopId);
      await refreshLoopDetail();

      setStatus("Syncing pipeline config...");
      await setCurrentWorkflow({ force: true, silent: true });

      let payloadCount = null;
      if (generateStep && generateStep.workflow && generateStep.workflow !== "(none)") {
        pipelineActiveStepId = generateStep.id;
        pipelineSelectedStepId = generateStep.id;
        updatePipelineStep(generateStep.id, "running", { startedAt: Date.now() });
        await renderPipelineGraph(steps);
        setStatus(`Loading payload workflow: ${generateStep.workflow}`);
        const ok = await loadWorkflowByName(generateStep.workflow);
        if (!ok) {
          updatePipelineStep(generateStep.id, "error", { endedAt: Date.now() });
          pipelineState.lastRun.endedAt = Date.now();
          await renderPipelineGraph(steps);
          setStatus("Failed to load payload workflow.");
          return false;
        }
        await injectLoopId();
        await setCurrentWorkflow({ force: true, silent: true });
        setStatus("Generating payload...");
        await stepCycle({ forceSync: false });
        const payloadData = await waitForManifest((data) => {
          const entry = data?.manifest?.find((m) => m.prompt_id === lastStepPromptId);
          return entry && entry.status === "returned" && Array.isArray(entry.outputs?.json);
        });
        if (!payloadData) {
          updatePipelineStep(generateStep.id, "error", { endedAt: Date.now() });
          pipelineState.lastRun.endedAt = Date.now();
          await renderPipelineGraph(steps);
          setStatus("Payload generation timed out.");
          return false;
        }
        const entry = payloadData.manifest?.find((m) => m.prompt_id === lastStepPromptId);
        if (entry && Array.isArray(entry.outputs?.json)) {
          payloadCount = entry.outputs.json.length;
        }
        if (entry) {
          pipelinePayloadEntry = entry;
        }
        await apiPost("/lemouf/loop/reset", { loop_id: loopId, keep_workflow: true });
        updatePipelineStep(generateStep.id, "done", { endedAt: Date.now() });
        pipelineActiveStepId = null;
        await renderPipelineGraph(steps);
      }

      pipelineActiveStepId = executeStep.id;
      pipelineSelectedStepId = executeStep.id;
      updatePipelineStep(executeStep.id, "running", { startedAt: Date.now() });
      await renderPipelineGraph(steps);
      if (payloadCount && Number.isFinite(payloadCount)) {
        cyclesInput.value = String(payloadCount);
        await apiPost("/lemouf/loop/config", { loop_id: loopId, total_cycles: payloadCount });
      }
      setStatus(`Loading execute workflow: ${executeStep.workflow}`);
      const ok = await loadWorkflowByName(executeStep.workflow);
      if (!ok) {
        setStatus("Failed to load execute workflow.");
        return false;
      }
      await injectLoopId();
      await setCurrentWorkflow({ force: true, silent: true });
      setStatus("Starting cycle...");
      await stepCycle({ forceSync: false });
      pipelineActiveStepId = null;
      await renderPipelineGraph(steps);
      return true;
    };

    const validateAndStart = async () => {
      const validation = await runValidation();
      if (!validation?.ok) {
        setStatus("Workflow not compatible.");
        return;
      }
      const payload = await getCurrentPromptPayload();
      const prompt =
        payload?.output ??
        payload?.prompt ??
        (payload && typeof payload === "object" ? payload : null);
      const pipelineSteps = extractPipelineSteps(prompt);
      if (pipelineSteps.length) {
        await runPipeline(prompt);
        return;
      }
      if (pipelineState.steps.length && pipelineSelect.value) {
        setStatus("Loading pipeline workflow...");
        const ok = await loadWorkflowByName(pipelineSelect.value);
        if (ok) {
          const payload2 = await getCurrentPromptPayload();
          const prompt2 =
            payload2?.output ??
            payload2?.prompt ??
            (payload2 && typeof payload2 === "object" ? payload2 : null);
          const steps2 = extractPipelineSteps(prompt2);
          if (steps2.length) {
            await runPipeline(prompt2);
            return;
          }
        }
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
    const exportBtn = el("button", { class: "lemouf-loop-btn alt", text: "Export approved", onclick: exportApproved });
    const exitBtn = el("button", { class: "lemouf-loop-btn alt", text: "Exit loop", onclick: resetToStart });
    headerBackBtn = el("button", { class: "lemouf-loop-header-btn", title: "Back to home", text: "←" });
    headerMenu = el("div", { class: "lemouf-loop-header-menu" });
    const headerMenuHome = el("button", { class: "lemouf-loop-header-menu-btn", text: "Go to home" });
    const headerMenuExit = el("button", { class: "lemouf-loop-header-menu-btn", text: "Exit loop" });
    headerMenu.append(headerMenuHome, headerMenuExit);
    const headerActions = el("div", { class: "lemouf-loop-header-actions" }, [headerBackBtn, headerMenu]);
    closeHeaderMenu = () => headerMenu.classList.remove("is-open");
    const toggleHeaderMenu = () => headerMenu.classList.toggle("is-open");
    headerBackBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const hasLoop = Boolean(currentLoopId);
      if (!hasLoop) {
        setScreen("home");
        return;
      }
      toggleHeaderMenu();
    });
    headerMenuHome.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeHeaderMenu();
      setScreen("home");
    });
    headerMenuExit.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeHeaderMenu();
      resetToStart();
    });
    exportBtn.style.display = "none";
    exitBtn.style.display = "none";
    headerBackBtn.style.display = "none";
    const actionRow = el("div", { class: "lemouf-loop-row" }, [
      el("button", { class: "lemouf-loop-btn lemouf-loop-action approve", onclick: () => decision("approve"), text: "Approve" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action reject", onclick: () => decision("reject"), text: "Reject" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action replay", onclick: () => decision("replay"), text: "Replay" }),
    ]);
    const runScreen = createRunScreen({
      progressWrap,
      previewWrap,
      actionRow,
      exportBtn,
      exitBtn,
      overridesBox,
      actionStatus,
      manifestBox,
      loopIdLabel,
      statusBadge,
      cycleBadge,
      retryBadge,
      autoSyncLabel,
    });
    const postStartSection = runScreen.root;
    const postStartTop = runScreen.postStartTop;
    const postStartBottom = runScreen.postStartBottom;
    runScreen.overridesApplyBtn.addEventListener("click", applyOverrides);
    runScreen.createBtn.addEventListener("click", createLoop);
    runScreen.refreshBtn.addEventListener("click", refreshLoops);
    runScreen.setCyclesBtn.addEventListener("click", setTotalCycles);
    runScreen.syncBtn.addEventListener("click", () => setCurrentWorkflow({ force: true }));
    runScreen.useCurrentBtn.addEventListener("click", setCurrentWorkflow);
    runScreen.injectBtn.addEventListener("click", injectLoopId);
    runScreen.stepBtn.addEventListener("click", stepCycle);
    panel = el("div", { class: "lemouf-loop-panel", id: "lemouf-loop-panel" }, [
      resizer,
      el("div", { class: "lemouf-loop-header" }, [
        el("div", { class: "lemouf-loop-title", text: "LEMOUF EXTENSION" }),
        headerActions,
      ]),
      preStartSection,
      payloadSection,
      postStartSection,
      el("div", { class: "lemouf-loop-footer", text: `LEMOUF EXTENSION · ${PANEL_VERSION}` }),
    ]);

    validateBtn.addEventListener("click", validateAndStart);
    setPipelineLoaded(false);

    document.body.appendChild(panel);
    document.addEventListener("click", () => {
      if (typeof closeHeaderMenu === "function") closeHeaderMenu();
    });
    setScreen(pendingScreen || "home");
    let currentGutter = Number(localStorage.getItem("lemoufLoopGutterWidth") || 420);
    applyGutterWidth(currentGutter);
    const savedVisible = localStorage.getItem("lemoufLoopPanelVisible");
    if (savedVisible === "0") {
      setPanelVisible(false);
    }
    setupToggleControls();
    refreshPipelineList({ silent: true });
    const toggleObserver = new MutationObserver(() => setupToggleControls());
    toggleObserver.observe(document.body, { childList: true, subtree: true });
    resizer.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startWidth = currentGutter;
      const onMove = (moveEv) => {
        const delta = startX - moveEv.clientX;
        if (!panelVisible) return;
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
    window.addEventListener("keydown", (ev) => {
      if (ev.altKey && !ev.shiftKey && !ev.ctrlKey && ev.code === "KeyL") {
        ev.preventDefault();
        togglePanel();
      }
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
