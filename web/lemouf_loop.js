import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { el } from "./ui/dom.js";
import { injectStyles } from "./ui/styles.js";
import { createPayloadView } from "./ui/payload_view.js";
import { createPipelineGraphView } from "./ui/pipeline_graph.js";
import { createHomeScreen } from "./ui/home_screen.js";
import { createRunScreen } from "./ui/run_screen.js";
import { clearSong2DawStudioView, renderSong2DawStudioView } from "./ui/song2daw/studio_view.js";
import { clearLoopCompositionStudioView, renderLoopCompositionStudioView } from "./ui/loop_composition_view.js";

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

function formatErrorDetail(detail, fallback = "Unknown error") {
  if (detail === null || detail === undefined) return fallback;
  if (typeof detail === "string") {
    const text = detail.trim();
    return text || fallback;
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => formatErrorDetail(item, ""))
      .map((item) => item.trim())
      .filter(Boolean);
    return parts.length ? parts.join(" | ") : fallback;
  }
  if (typeof detail === "object") {
    const preferredKeys = ["detail", "message", "error", "reason", "type", "status"];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(detail, key)) {
        const value = formatErrorDetail(detail[key], "");
        if (value) return value;
      }
    }
    try {
      const text = JSON.stringify(detail);
      if (!text) return fallback;
      return text.length > 280 ? `${text.slice(0, 280)}...` : text;
    } catch {
      return fallback;
    }
  }
  return fallback;
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
          detail = formatErrorDetail(parsed?.error ?? parsed?.message ?? parsed, text);
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
          detail = formatErrorDetail(parsed?.error ?? parsed?.message ?? parsed, text);
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
  if (!prompt || typeof prompt !== "object") return null;
  try {
    const keys = Object.keys(prompt);
    let signature = `${keys.length}`;
    for (const key of keys) {
      const node = prompt[key];
      signature += `|${key}:${node?.class_type || node?.type || ""}`;
    }
    return hashString(signature);
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

function extractPipelineStepsFromWorkflowGraph(workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const links = Array.isArray(workflow.links) ? workflow.links : [];
  if (!nodes.length) return [];

  const linkById = new Map();
  for (const rawLink of links) {
    if (!Array.isArray(rawLink) || rawLink.length < 5) continue;
    const linkId = Number(rawLink[0]);
    const originId = String(rawLink[1]);
    const targetId = String(rawLink[3]);
    if (!Number.isFinite(linkId)) continue;
    linkById.set(linkId, { originId, targetId });
  }

  const steps = [];
  const incoming = new Map();
  const outgoing = new Map();
  for (const node of nodes) {
    if (String(node?.type || node?.class_type || "") !== "LoopPipelineStep") continue;
    const nodeId = String(node?.id ?? "");
    if (!nodeId) continue;
    const widgets = Array.isArray(node?.widgets_values) ? node.widgets_values : [];
    const role = String(widgets?.[0] ?? "");
    const workflowName = String(widgets?.[1] ?? "");
    const rawOrder = Number(node?.order);
    const rawId = Number(node?.id);
    const stepIndex = Number.isFinite(rawOrder)
      ? rawOrder
      : (Number.isFinite(rawId) ? rawId : steps.length);
    steps.push({
      id: nodeId,
      role,
      workflow: workflowName,
      stepIndex,
    });

    const inputs = Array.isArray(node?.inputs) ? node.inputs : [];
    const flowInput = inputs.find((entry) => String(entry?.name || "") === "flow");
    const flowLinkId = Number(flowInput?.link);
    if (Number.isFinite(flowLinkId)) {
      const link = linkById.get(flowLinkId);
      if (link?.originId) {
        incoming.set(nodeId, String(link.originId));
        if (!outgoing.has(String(link.originId))) outgoing.set(String(link.originId), []);
        outgoing.get(String(link.originId)).push(nodeId);
      }
    }
  }
  if (!steps.length) return [];

  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set();
  const ordered = [];
  const sortIds = (ids) =>
    ids.sort((a, b) => {
      const sa = stepMap.get(a);
      const sb = stepMap.get(b);
      if (sa && sb && sa.stepIndex !== sb.stepIndex) return sa.stepIndex - sb.stepIndex;
      return String(a).localeCompare(String(b));
    });
  const startIds = sortIds(steps.map((s) => s.id).filter((id) => !incoming.has(id)));
  const walk = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const step = stepMap.get(id);
    if (step) ordered.push(step);
    const next = outgoing.get(id) || [];
    sortIds(next);
    for (const nextId of next) walk(nextId);
  };
  for (const id of startIds) walk(id);
  if (ordered.length < steps.length) {
    const remaining = steps.filter((s) => !visited.has(s.id));
    remaining.sort((a, b) => Number(a.stepIndex || 0) - Number(b.stepIndex || 0));
    ordered.push(...remaining);
  }
  return ordered;
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
  if (key.includes("discard")) return "discard";
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

const WORKFLOW_PROFILE_NODE_TYPE = "LeMoufWorkflowProfile";
const LOOP_ID_KEY = "lemoufLoopId";
const PIPELINE_RUNTIME_KEY = "lemoufLoopPipelineRuntimeV1";
const WORKFLOW_PROFILE_DEFAULT = Object.freeze({
  profile_id: "generic_loop",
  profile_version: "0.1.0",
  ui_contract_version: "1.0.0",
  workflow_kind: "master",
});
const WORKFLOW_PROFILE_ADAPTERS = Object.freeze({
  generic_loop: Object.freeze({
    id: "generic_loop",
    label: "Generic loop",
    ui_contract_major: 1,
    default_profile_version: "0.1.0",
  }),
  song2daw: Object.freeze({
    id: "song2daw",
    label: "song2daw",
    ui_contract_major: 1,
    default_profile_version: "0.1.0",
  }),
});

function normalizeProfileId(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return text;
}

function normalizeSemver(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d+\.\d+\.\d+$/.test(text)) return text;
  return fallback;
}

function normalizeWorkflowKind(value, fallback = "master") {
  const text = String(value || "").trim().toLowerCase();
  if (text === "master" || text === "branch") return text;
  return fallback;
}

function semverMajor(value) {
  const match = /^(\d+)\./.exec(String(value || "").trim());
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

function scalarProfileInput(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return "";
  return String(value).trim();
}

function coalesceProfileId(profileIdRaw, profileCustomRaw) {
  const profileId = normalizeProfileId(profileIdRaw);
  const custom = normalizeProfileId(profileCustomRaw);
  if (profileId === "custom" || profileId === "other") {
    return custom || "";
  }
  return profileId || custom || "";
}

function finalizeWorkflowProfile(rawProfile, source = "fallback") {
  const raw = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  const profileId = coalesceProfileId(raw.profile_id, raw.profile_id_custom) || WORKFLOW_PROFILE_DEFAULT.profile_id;
  const known = Object.prototype.hasOwnProperty.call(WORKFLOW_PROFILE_ADAPTERS, profileId);
  const adapter = known ? WORKFLOW_PROFILE_ADAPTERS[profileId] : WORKFLOW_PROFILE_ADAPTERS.generic_loop;
  const profileVersion = normalizeSemver(
    raw.profile_version,
    known ? adapter.default_profile_version : WORKFLOW_PROFILE_DEFAULT.profile_version
  );
  const uiContractVersion = normalizeSemver(raw.ui_contract_version, WORKFLOW_PROFILE_DEFAULT.ui_contract_version);
  const workflowKind = normalizeWorkflowKind(raw.workflow_kind, WORKFLOW_PROFILE_DEFAULT.workflow_kind);
  const uiMajor = semverMajor(uiContractVersion);
  const compatible = Boolean(known && uiMajor !== null && uiMajor === adapter.ui_contract_major);
  return {
    profile_id: profileId,
    profile_version: profileVersion,
    ui_contract_version: uiContractVersion,
    adapter_id: adapter.id,
    adapter_label: adapter.label,
    workflow_kind: workflowKind,
    known_profile: known,
    compatible,
    source: String(raw.source || source || "fallback"),
  };
}

function extractWorkflowProfileFromPrompt(prompt) {
  if (!prompt || typeof prompt !== "object") return null;
  for (const node of Object.values(prompt)) {
    if (!node || typeof node !== "object") continue;
    const classType = String(node.class_type || node.type || "").trim();
    if (classType !== WORKFLOW_PROFILE_NODE_TYPE) continue;
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
    return finalizeWorkflowProfile(
      {
        profile_id: scalarProfileInput(inputs.profile_id),
        profile_id_custom: scalarProfileInput(inputs.profile_id_custom),
        profile_version: scalarProfileInput(inputs.profile_version),
        ui_contract_version: scalarProfileInput(inputs.ui_contract_version),
        workflow_kind: scalarProfileInput(inputs.workflow_kind),
        source: "prompt_node",
      },
      "prompt_node"
    );
  }
  return null;
}

function extractWorkflowProfileFromWorkflow(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const classType = String(node.type || node.class_type || "").trim();
    if (classType !== WORKFLOW_PROFILE_NODE_TYPE) continue;
    const directInputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
    const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    const hasCustomField = widgetValues.length >= 4;
    const hasKindField = widgetValues.length >= 5;
    const profileId = scalarProfileInput(directInputs.profile_id || widgetValues[0]);
    const profileIdCustom = scalarProfileInput(
      directInputs.profile_id_custom || (hasCustomField ? widgetValues[1] : "")
    );
    const profileVersion = scalarProfileInput(
      directInputs.profile_version || (hasCustomField ? widgetValues[2] : widgetValues[1])
    );
    const uiContractVersion = scalarProfileInput(
      directInputs.ui_contract_version || (hasCustomField ? widgetValues[3] : widgetValues[2])
    );
    const workflowKind = scalarProfileInput(
      directInputs.workflow_kind || (hasKindField ? widgetValues[4] : "")
    );
    return finalizeWorkflowProfile(
      {
        profile_id: profileId,
        profile_id_custom: profileIdCustom,
        profile_version: profileVersion,
        ui_contract_version: uiContractVersion,
        workflow_kind: workflowKind,
        source: "workflow_node",
      },
      "workflow_node"
    );
  }
  return null;
}

function resolveWorkflowProfile({ workflow, prompt, workflowProfile } = {}) {
  if (workflowProfile && typeof workflowProfile === "object") {
    return finalizeWorkflowProfile({ ...workflowProfile, source: workflowProfile.source || "api" }, "api");
  }
  const fromPrompt = extractWorkflowProfileFromPrompt(prompt);
  if (fromPrompt) return fromPrompt;
  const fromWorkflow = extractWorkflowProfileFromWorkflow(workflow);
  if (fromWorkflow) return fromWorkflow;

  const promptTypes = extractTypesFromPrompt(prompt);
  const workflowTypes = extractTypesFromWorkflowNodes(Array.isArray(workflow?.nodes) ? workflow.nodes : []);
  const types = promptTypes.length ? promptTypes : workflowTypes;
  if (hasType(types, "Song2DawRun") || hasType(types, "song2daw")) {
    return finalizeWorkflowProfile({ profile_id: "song2daw", source: "heuristic_song2daw" }, "heuristic_song2daw");
  }
  return finalizeWorkflowProfile({ profile_id: "generic_loop", source: "fallback_generic" }, "fallback_generic");
}

function formatWorkflowProfileStatus(profile) {
  const base = `Workflow profile: ${profile.profile_id} v${profile.profile_version} · UI ${profile.ui_contract_version} · ${profile.workflow_kind}`;
  const source = profile.source ? ` (${profile.source})` : "";
  if (!profile.known_profile) return `${base}${source} · unknown profile, fallback UI`;
  if (!profile.compatible) return `${base}${source} · incompatible contract, fallback UI`;
  return `${base}${source}`;
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
      pipelineList,
      pipelineStatus,
      pipelineNav,
      pipelineRefreshBtn,
      pipelineLoadBtn,
      pipelineRunBtn,
      workflowUseCurrentBtn,
      cyclesRow,
      cyclesInput,
      validateBtn,
      compatStatus,
      workflowDiagnosticsPanel,
      workflowDiagnosticsSummaryState,
      song2dawSelect,
      song2dawBlock,
      workflowProfileStatus,
      song2dawStatus,
      song2dawRefreshBtn,
      song2dawClearBtn,
      song2dawLoadBtn,
      song2dawPrimaryLoadRow,
      song2dawOpenDirBtn,
      song2dawDockToggleBtn,
      song2dawDockExpandBtn,
      song2dawRunDetailBlock,
      song2dawAudioPreviewAsset,
      song2dawAudioPreviewPlayer,
      song2dawOverview,
      song2dawStepPanel,
      song2dawStepTitle,
      song2dawStepDetail,
      song2dawStudioPanel,
      song2dawStudioTimelineBtn,
      song2dawStudioTracksBtn,
      song2dawStudioSpectrumBtn,
      song2dawStudioBody,
      song2dawDetail,
    } = homeScreen;
    let openLoopLightboxImpl = null;
    const openLightbox = (src, context = null) => {
      if (!src) return;
      if (typeof openLoopLightboxImpl === "function") {
        void openLoopLightboxImpl(src, context);
        return;
      }
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
    let menuObserver = null;
    let menuContainer = null;
    let lastStepPromptId = null;
    let autoRefreshTimer = null;
    let autoRefreshAttempts = 0;
    const AUTO_REFRESH_MAX = 180;
    const SONG2DAW_DOCK_MIN_HEIGHT = 140;
    const SONG2DAW_DOCK_MAX_HEIGHT = 560;
    const SONG2DAW_DOCK_DEFAULT_HEIGHT = 230;
    let progressState = {
      promptId: null,
      value: 0,
      max: 0,
      node: "",
      status: "idle",
      loopPercent: null,
    };
    const PANEL_VERSION = "0.3.1";
    let panel = null;
    let headerBackBtn = null;
    let headerMenu = null;
    let headerMenuHomeBtn = null;
    let headerMenuExitBtn = null;
    let manifestRunBtn = null;
    let loopRuntimeStatus = "idle";
    let selectedManifestCycleIndex = null;
    let pendingRetryCandidate = null;
    let manifestAutoCollapsedForCompletion = false;
    let manifestBusyGuardUntil = 0;
    const MANIFEST_BUSY_GUARD_MS = 900;
    const LOOP_LAUNCH_GUARD_MS = 15000;
    let pendingLoopLaunch = null;
    let lastManifestCycleIndices = [];
    let lastManifestCycleEntries = new Map();
    let closeHeaderMenu = null;
    let song2dawDetailSection = null;
    let song2dawDetailLayout = null;
    let song2dawRunSummaryPanel = null;
    let song2dawDetailHeaderTitle = null;
    let song2dawDetailHeaderMeta = null;
    let song2dawDetailPrevBtn = null;
    let song2dawDetailNextBtn = null;
    let song2dawDetailBalanceRaf = 0;
    let pipelineActiveStepId = null;
    let pipelineSelectedStepId = null;
    const pipelineState = {
      steps: [],
      lastRun: null,
    };
    let song2dawRuns = [];
    let currentSong2DawRun = null;
    let selectedSong2DawStepIndex = 0;
    let song2dawStudioMode = "timeline";
    let currentWorkflowProfile = finalizeWorkflowProfile({ profile_id: "generic_loop", source: "init" }, "init");
    let song2dawDockVisible = true;
    let song2dawDockUserVisible = true;
    let song2dawDockExpanded = false;
    let song2dawDock = null;
    let song2dawDockTitle = null;
    let song2dawDockHeaderToggleBtn = null;
    let song2dawDockHeaderExpandBtn = null;
    let dockContentMode = "song2daw";
    let loopCompositionRequested = false;
    let loopCompositionPanel = null;
    let loopCompositionBody = null;
    let currentLoopDetail = null;
    let currentGutter = Number(localStorage.getItem("lemoufLoopGutterWidth") || 420);
    if (!Number.isFinite(currentGutter)) currentGutter = 420;
    let currentSong2DawDockHeight = Number(
      localStorage.getItem("lemoufSong2DawDockHeight") || SONG2DAW_DOCK_DEFAULT_HEIGHT
    );
    if (!Number.isFinite(currentSong2DawDockHeight)) {
      currentSong2DawDockHeight = SONG2DAW_DOCK_DEFAULT_HEIGHT;
    }
    let song2dawDockRestoreHeight = currentSong2DawDockHeight;
    song2dawDockVisible = localStorage.getItem("lemoufSong2DawDockVisible") !== "0";
    song2dawDockUserVisible = song2dawDockVisible;
    song2dawDockExpanded = localStorage.getItem("lemoufSong2DawDockExpanded") === "1";
    let pipelinePayloadEntry = null;
    let pipelineGraphView = null;
    let pipelineHydrationInFlight = false;
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

    const lightboxCycleLabel = el("div", { class: "lemouf-loop-lightbox-cycle", text: "Preview" });
    const lightboxCycleSelect = el("select", {
      class: "lemouf-loop-lightbox-cycle-select",
      style: "display:none;",
    });
    const lightboxStatusBadge = el("span", {
      class: "lemouf-loop-result-badge pending lemouf-loop-lightbox-status",
      text: "PENDING",
    });
    const lightboxEntryMeta = el("div", { class: "lemouf-loop-lightbox-meta", text: "" });
    const lightboxPrevBtn = el("button", { class: "lemouf-loop-btn alt", text: "Prev", type: "button" });
    const lightboxNextBtn = el("button", { class: "lemouf-loop-btn alt", text: "Next", type: "button" });
    const lightboxApproveBtn = el("button", { class: "lemouf-loop-btn lemouf-loop-action approve", text: "Approve", type: "button" });
    const lightboxRejectBtn = el("button", { class: "lemouf-loop-btn lemouf-loop-action reject", text: "Reject", type: "button" });
    const lightboxReplayBtn = el("button", { class: "lemouf-loop-btn lemouf-loop-action replay", text: "Replay", type: "button" });
    const lightboxImg = el("img", { src: "", alt: "Preview" });
    const lightboxSkeleton = el("div", {
      class: "lemouf-loop-result-skeleton lemouf-loop-lightbox-skeleton",
      text: "Generating preview...",
      style: "display:none;",
    });
    const lightboxCloseBtn = el("button", { class: "lemouf-loop-lightbox-close", text: "Close", type: "button" });
    const lightboxHeadTitle = el("div", { class: "lemouf-loop-lightbox-head-title" }, [
      lightboxCycleLabel,
      lightboxCycleSelect,
      lightboxStatusBadge,
    ]);
    const lightboxPanel = el("div", { class: "lemouf-loop-lightbox-panel" }, [
      lightboxCloseBtn,
      el("div", { class: "lemouf-loop-lightbox-head" }, [
        lightboxHeadTitle,
        el("div", { class: "lemouf-loop-lightbox-nav" }, [lightboxPrevBtn, lightboxNextBtn]),
      ]),
      el("div", { class: "lemouf-loop-lightbox-stage" }, [lightboxImg, lightboxSkeleton]),
      el("div", { class: "lemouf-loop-lightbox-foot" }, [
        el("div", { class: "lemouf-loop-lightbox-badges" }, [lightboxEntryMeta]),
        el("div", { class: "lemouf-loop-lightbox-actions" }, [lightboxApproveBtn, lightboxRejectBtn, lightboxReplayBtn]),
      ]),
    ]);
    const lightbox = el("div", { class: "lemouf-loop-lightbox", id: "lemouf-loop-lightbox" }, [lightboxPanel]);
    document.body.appendChild(lightbox);
    const lightboxState = {
      mode: "generic",
      src: "",
      cycleIndex: null,
      lockedCycleIndex: null,
      sessionId: 0,
      totalCycles: 0,
      cycleItems: [],
      itemIndex: 0,
      pendingCycleIndex: null,
      pendingRetryIndex: null,
      pendingReason: "",
      actionBusy: false,
    };
    let lightboxPollTimer = null;
    const closeLightbox = () => {
      lightbox.classList.remove("is-open");
      lightboxState.actionBusy = false;
      lightboxState.pendingCycleIndex = null;
      lightboxState.pendingRetryIndex = null;
      lightboxState.pendingReason = "";
      lightboxState.lockedCycleIndex = null;
      lightboxState.sessionId += 1;
      if (lightboxPollTimer) {
        clearInterval(lightboxPollTimer);
        lightboxPollTimer = null;
      }
      if (String(currentLoopDetail?.status || "").toLowerCase() === "complete") {
        previewImg.style.display = "none";
        previewEmpty.style.display = "none";
        previewWrap.classList.remove("is-loading");
      }
    };
    lightboxCloseBtn.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (ev) => {
      if (ev.target === lightbox) closeLightbox();
    });
    lightboxPanel.addEventListener("click", (ev) => ev.stopPropagation());

    const previewImg = el("img", { class: "lemouf-loop-preview-img", src: "" });
    const previewSpinner = el("div", { class: "lemouf-loop-spinner" });
    const previewEmpty = el("div", { class: "lemouf-loop-preview-empty", text: "No image yet." });
    const previewCompleteTitle = el("div", {
      class: "lemouf-loop-preview-complete-title",
      text: "Approved highlights",
    });
    const previewCompleteStats = el("div", {
      class: "lemouf-loop-preview-complete-stats",
      text: "",
    });
    const previewCompleteBody = el("div", {
      class: "lemouf-loop-preview-complete-body",
      text: "",
    });
    const previewCompleteActions = el("div", {
      class: "lemouf-loop-preview-complete-actions",
      style: "display:none;",
    });
    const previewCompleteSection = el("div", {
      class: "lemouf-loop-preview-complete",
      style: "display:none;",
    }, [previewCompleteTitle, previewCompleteStats, previewCompleteBody, previewCompleteActions]);
    const previewWrap = el("div", { class: "lemouf-loop-preview" }, [
      previewEmpty,
      previewImg,
      previewSpinner,
      previewCompleteSection,
    ]);
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
      setWorkflowDiagnosticsSummary();
    };

    const setWorkflowDiagnosticsSummary = () => {
      if (!workflowDiagnosticsSummaryState) return;
      const profile = currentWorkflowProfile && typeof currentWorkflowProfile === "object"
        ? currentWorkflowProfile
        : finalizeWorkflowProfile({ profile_id: "generic_loop", source: "fallback_generic" }, "fallback_generic");
      const profileShort = String(profile.profile_id || "workflow").replaceAll("_", " ").toUpperCase();
      const kindShort = String(profile.workflow_kind || "master").toUpperCase();
      const compatRaw = String(compatStatus?.textContent || "").trim();
      const compatLower = compatRaw.toLowerCase();

      let tone = "neutral";
      let stateLabel = "Awaiting check";
      if (compatRaw) {
        stateLabel = "Review";
        tone = "warning";
      }
      if (compatLower.includes("ready") || compatLower.includes("compatible")) {
        tone = "ok";
        stateLabel = "Ready";
      }
      if (
        compatLower.includes("not readable") ||
        compatLower.includes("invalid") ||
        compatLower.includes("missing") ||
        compatLower.includes("error") ||
        compatLower.includes("failed")
      ) {
        tone = "error";
        stateLabel = "Issue";
      }
      if (!profile.compatible || !profile.known_profile) {
        if (tone === "ok") tone = "warning";
        if (!compatRaw) stateLabel = "Fallback UI";
      }

      workflowDiagnosticsSummaryState.textContent = `${profileShort} · ${kindShort} · ${stateLabel}`;
      workflowDiagnosticsSummaryState.classList.remove("is-neutral", "is-ok", "is-warning", "is-error");
      workflowDiagnosticsSummaryState.classList.add(`is-${tone}`);
      workflowDiagnosticsSummaryState.title = [
        formatWorkflowProfileStatus(profile),
        compatRaw,
      ].filter(Boolean).join("\n");
    };

    const setPipelineStatus = (msg) => {
      pipelineStatus.textContent = msg || "";
    };

    const setSong2DawStatus = (msg) => {
      song2dawStatus.textContent = msg || "";
    };

    const setManifestRunButtonVisibility = (status = "") => {
      if (!manifestRunBtn) return;
      const normalized = String(status || loopRuntimeStatus || "idle").toLowerCase();
      if (status) loopRuntimeStatus = normalized;
      const show =
        normalized === "idle" ||
        normalized === "error" ||
        normalized === "failed";
      manifestRunBtn.style.display = show ? "" : "none";
      manifestRunBtn.disabled = !show;
    };

    let manifestGridObserver = null;
    const MANIFEST_GRID_MIN_COLS = 1;
    const MANIFEST_GRID_MAX_COLS = 4;
    const MANIFEST_GRID_MIN_ITEM_WIDTH = 112;
    const manifestTierFromCols = (cols) => {
      if (cols >= 4) return "big";
      if (cols === 3) return "intermediary";
      if (cols === 2) return "medium";
      return "small";
    };
    const computeManifestCols = (width) => {
      const w = Math.max(0, Number(width) || 0);
      const byWidth = Math.floor(w / MANIFEST_GRID_MIN_ITEM_WIDTH);
      return Math.max(MANIFEST_GRID_MIN_COLS, Math.min(MANIFEST_GRID_MAX_COLS, byWidth || 1));
    };
    const updateManifestGridLayout = () => {
      if (!manifestBox) return;
      const width = Math.max(0, manifestBox.clientWidth - 12);
      const cols = computeManifestCols(width);
      manifestBox.style.setProperty("--lemouf-cycle-cols", String(cols));
      manifestBox.dataset.gridCols = String(cols);
      manifestBox.dataset.gridTier = manifestTierFromCols(cols);
    };

    let manifestStickToBottom = true;
    const manifestNearBottom = () => {
      const gap = manifestBox.scrollHeight - (manifestBox.scrollTop + manifestBox.clientHeight);
      return gap <= 24;
    };
    const scrollManifestToBottom = () => {
      manifestBox.scrollTop = Math.max(0, manifestBox.scrollHeight - manifestBox.clientHeight);
    };
    manifestBox.addEventListener("scroll", () => {
      manifestStickToBottom = manifestNearBottom();
    });

    const computeNextRetryIndex = (entries = []) => {
      let maxRetry = -1;
      for (const entry of entries) {
        const retryValue = Number(entry?.retry_index);
        if (Number.isFinite(retryValue)) {
          maxRetry = Math.max(maxRetry, retryValue);
        }
      }
      return Math.max(0, maxRetry + 1);
    };

    const entryIsApproved = (entry) => {
      const decision = String(entry?.decision || "").toLowerCase();
      const status = String(entry?.status || "").toLowerCase();
      return (
        decision === "approve" ||
        decision === "approved" ||
        status === "approve" ||
        status === "approved"
      );
    };

    const entryIsFailed = (entry) => {
      const decision = String(entry?.decision || "").toLowerCase();
      const status = String(entry?.status || "").toLowerCase();
      return (
        decision.includes("fail") ||
        decision.includes("error") ||
        status.includes("fail") ||
        status.includes("error")
      );
    };

    const entryIsActionable = (entry) => {
      const status = String(entry?.status || "").toLowerCase();
      const decision = String(entry?.decision || "").toLowerCase();
      if (status === "queued" || status === "running") return true;
      if (status !== "returned") return false;
      return decision !== "reject" && decision !== "replay" && decision !== "discard";
    };

    const collectApprovedSummary = (detail) => {
      const manifest = Array.isArray(detail?.manifest) ? detail.manifest : [];
      const approvedByCycle = new Map();
      for (const entry of manifest) {
        if (!entryIsApproved(entry)) continue;
        const cycle = Number(entry?.cycle_index);
        if (!Number.isFinite(cycle) || cycle < 0) continue;
        const previous = approvedByCycle.get(cycle);
        const currentTs = Number(entry?.updated_at ?? entry?.created_at ?? 0);
        const prevTs = previous ? Number(previous?.updated_at ?? previous?.created_at ?? 0) : -1;
        if (!previous || currentTs >= prevTs) approvedByCycle.set(cycle, entry);
      }
      const totalCycles = Math.max(1, Number(detail?.total_cycles || approvedByCycle.size || 1));
      const approvedCount = approvedByCycle.size;
      const items = Array.from(approvedByCycle.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([cycleIndex, entry]) => {
          const retryIndex = Number(entry?.retry_index);
          const images = Array.isArray(entry?.outputs?.images) ? entry.outputs.images : [];
          const firstImage = images[0] || null;
          const imageCount = images.length;
          return {
            cycleIndex,
            retryIndex: Number.isFinite(retryIndex) ? retryIndex : 0,
            imageCount,
            firstImage,
            entry,
          };
        });
      const totalImages = items.reduce((acc, item) => acc + Number(item.imageCount || 0), 0);
      return {
        totalCycles,
        approvedCount,
        totalImages,
        items,
      };
    };

    const renderApprovedSummary = (detail) => {
      const summary = collectApprovedSummary(detail);
      const cycleLabel = `${summary.approvedCount}/${summary.totalCycles} cycles approved`;
      const imageLabel = `${summary.totalImages} image${summary.totalImages === 1 ? "" : "s"}`;
      previewCompleteStats.innerHTML = "";
      previewCompleteStats.append(
        el("span", { class: "lemouf-loop-preview-stat", text: cycleLabel }),
        el("span", { class: "lemouf-loop-preview-stat", text: imageLabel })
      );
      previewCompleteBody.innerHTML = "";
      if (!summary.items.length) {
        previewCompleteBody.appendChild(
          el("div", {
            class: "lemouf-loop-summary-empty",
            text: "No approved results yet.",
          })
        );
        return;
      }
      const grid = el("div", { class: "lemouf-loop-summary-grid" });
      for (const item of summary.items) {
        const cycleText = `Cycle ${Number(item.cycleIndex) + 1}`;
        const retryText = `r${Number(item.retryIndex)}`;
        const card = el("div", { class: "lemouf-loop-summary-card" });
        const head = el("div", { class: "lemouf-loop-summary-head" }, [
          el("span", { class: "lemouf-loop-summary-cycle", text: cycleText }),
          el("span", { class: "lemouf-loop-summary-retry", text: retryText }),
        ]);
        const media = el("div", { class: "lemouf-loop-summary-media" });
        if (item.firstImage) {
          const fullSrc = buildImageSrc(item.firstImage, false);
          const thumbSrc = buildImageSrc(item.firstImage, true);
          const thumb = el("img", { class: "lemouf-loop-summary-thumb", src: thumbSrc, alt: `${cycleText} approved` });
          thumb.title = "Open detail";
          thumb.addEventListener("click", () => {
            openLightbox(fullSrc, {
              mode: "cycle",
              cycleIndex: Number(item.cycleIndex),
              retryIndex: Number(item.retryIndex),
              imageIndex: 0,
            });
          });
          media.appendChild(thumb);
        } else {
          media.appendChild(el("div", { class: "lemouf-loop-summary-no-media", text: "No preview" }));
        }
        card.append(head, media);
        grid.appendChild(card);
      }
      previewCompleteBody.appendChild(grid);
    };

    const findFirstIncompleteCycleIndex = (detail) => {
      const manifest = Array.isArray(detail?.manifest) ? detail.manifest : [];
      const maxCycleInManifest = manifest.reduce((acc, entry) => {
        const value = Number(entry?.cycle_index);
        if (!Number.isFinite(value)) return acc;
        return Math.max(acc, value);
      }, -1);
      const totalCyclesRaw = Number(detail?.total_cycles);
      const totalCycles = Number.isFinite(totalCyclesRaw) && totalCyclesRaw > 0
        ? Math.round(totalCyclesRaw)
        : Math.max(0, maxCycleInManifest + 1);
      if (!totalCycles) return null;
      for (let cycle = 0; cycle < totalCycles; cycle += 1) {
        const entries = manifest.filter((entry) => Number(entry?.cycle_index) === cycle);
        if (!entries.some(entryIsApproved)) return cycle;
      }
      return null;
    };

    const resolveApproveFocusCycle = (detail, decisionResult, fallbackCycle = null) => {
      const normalizedStatus = String(detail?.status || "").toLowerCase();
      if (normalizedStatus === "complete") return null;
      const nextFromDecision = Number(decisionResult?.next_cycle_index);
      if (Number.isFinite(nextFromDecision) && nextFromDecision >= 0) {
        return Math.round(nextFromDecision);
      }
      const inferred = findFirstIncompleteCycleIndex(detail);
      if (Number.isFinite(inferred) && inferred >= 0) return inferred;
      const current = Number(detail?.current_cycle);
      if (Number.isFinite(current) && current >= 0) return Math.round(current);
      if (Number.isFinite(Number(fallbackCycle)) && Number(fallbackCycle) >= 0) {
        return Math.round(Number(fallbackCycle));
      }
      return null;
    };

    const resolveLoopUiRuntimeState = ({ runtimeState = "", progressStatus = "", manifestHasPending = false } = {}) => {
      const runtime = String(runtimeState || "").toLowerCase();
      if (runtime === "complete") return "complete";
      if (runtime === "error" || runtime === "failed") return "error";
      if (runtime === "queued") return "queued";
      if (runtime === "running") {
        // Backend can briefly report running while no pending entries remain.
        return manifestHasPending ? "running" : "idle";
      }
      if (runtime === "idle") return manifestHasPending ? "running" : "idle";
      if (manifestHasPending) return "running";
      const progress = String(progressStatus || "").toLowerCase();
      if (progress === "queued") return "queued";
      return "idle";
    };

    const syncProgressStateFromLoopRuntime = (uiRuntimeState, { keepPromptId = false } = {}) => {
      const next = String(uiRuntimeState || "idle").toLowerCase();
      const mapped =
        next === "queued"
          ? "queued"
          : (next === "running"
            ? "running"
            : (next === "complete" ? "done" : (next === "error" ? "error" : "idle")));
      const current = String(progressState?.status || "").toLowerCase();
      if (mapped === current) return false;
      progressState.status = mapped;
      if (!keepPromptId && mapped !== "running" && mapped !== "queued") {
        progressState.promptId = null;
      }
      updateProgressUI();
      return true;
    };
    const hasFiniteCycleIndex = (value) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value));
    const normalizeCycleIndex = (value) =>
      hasFiniteCycleIndex(value) ? Math.max(0, Math.round(Number(value))) : null;

    const armReplayCandidateForCycle = async (cycleIndex, detailAfterDecision = null) => {
      const nextCycle = Math.max(0, Math.round(Number(cycleIndex) || 0));
      const cycleManifest = Array.isArray(detailAfterDecision?.manifest)
        ? detailAfterDecision.manifest.filter((entry) => Number(entry?.cycle_index) === nextCycle)
        : [];
      const nextRetry = computeNextRetryIndex(cycleManifest);
      selectedManifestCycleIndex = nextCycle;
      pendingRetryCandidate = { cycleIndex: nextCycle, retryIndex: nextRetry };
      await refreshLoopDetail({ quiet: true });
      return { nextCycle, nextRetry };
    };

    const beginPendingLoopLaunch = (cycleIndex = null, retryIndex = null) => {
      const cycle = Number(cycleIndex);
      const retry = Number(retryIndex);
      pendingLoopLaunch = {
        cycleIndex: Number.isFinite(cycle) ? cycle : null,
        retryIndex: Number.isFinite(retry) ? retry : null,
        promptId: null,
        startedAt: Date.now(),
        expiresAt: Date.now() + LOOP_LAUNCH_GUARD_MS,
      };
    };

    const handleDecisionPostState = async ({
      choice,
      decisionResult,
      detailAfterDecision,
      targetCycle,
      targetRetry = null,
      entryStatus = "",
      autoRunOnlyReturned = false,
    }) => {
      const normalizedChoice = String(choice || "").toLowerCase();
      if (normalizedChoice === "approve") {
        pendingRetryCandidate = null;
        const nextFocus = resolveApproveFocusCycle(detailAfterDecision, decisionResult, targetCycle);
        selectedManifestCycleIndex = normalizeCycleIndex(nextFocus);
        await refreshLoopDetail({ quiet: true });
      }
      if (normalizedChoice === "reject") {
        const nextCycle = Math.max(0, Math.round(Number(targetCycle) || 0));
        const cycleManifest = Array.isArray(detailAfterDecision?.manifest)
          ? detailAfterDecision.manifest.filter((entry) => Number(entry?.cycle_index) === nextCycle)
          : [];
        const hasApproved = cycleManifest.some(entryIsApproved);
        const hasPending = cycleManifest.some((entry) => {
          const status = String(entry?.status || "").toLowerCase();
          return status === "queued" || status === "running";
        });
        let maxRetry = -1;
        for (const entry of cycleManifest) {
          const retry = Number(entry?.retry_index);
          if (Number.isFinite(retry)) maxRetry = Math.max(maxRetry, retry);
        }
        const rejectedRetry = Number(targetRetry);
        const rejectedIsLatest = Number.isFinite(rejectedRetry) ? rejectedRetry >= maxRetry : true;
        const targetWasReturned = String(entryStatus || "").toLowerCase() === "returned";
        const shouldAutoReplay =
          !hasApproved &&
          !hasPending &&
          (targetWasReturned || rejectedIsLatest);
        if (shouldAutoReplay) {
          const nextRetry = Math.max(0, maxRetry + 1);
          setStatus(`Decision saved: reject. Launching replay r${nextRetry}...`);
          await launchReplayForCycle(nextCycle, nextRetry, cycleManifest);
          return;
        }
        const armed = await armReplayCandidateForCycle(nextCycle, detailAfterDecision);
        setStatus(`Decision saved: reject. Replay r${armed.nextRetry} ready on cycle ${armed.nextCycle + 1}.`);
        return;
      }
      const canAutoRun = autoRunOnlyReturned
        ? String(entryStatus || "").toLowerCase() === "returned"
        : true;
      if (canAutoRun) {
        await maybeAutoRunNextNeededCycle(decisionResult, detailAfterDecision);
      }
    };

    const loopBusyForRetry = () => {
      const runtime = String(loopRuntimeStatus || "").toLowerCase();
      return runtime === "running" || runtime === "queued";
    };

    const paintManifestSelection = () => {
      if (!manifestBox) return;
      const selected = normalizeCycleIndex(selectedManifestCycleIndex);
      const rows = manifestBox.querySelectorAll(".lemouf-loop-cycle");
      for (const row of rows) {
        const rowIndex = Number(row.getAttribute("data-cycle-index"));
        row.classList.toggle("is-selected", selected !== null && rowIndex === selected);
      }
      const headers = manifestBox.querySelectorAll(".lemouf-loop-cycle-header");
      for (const header of headers) {
        const headerIndex = Number(header.getAttribute("data-cycle-index"));
        header.classList.toggle("is-selected", selected !== null && headerIndex === selected);
      }
    };

    const primeRetryCandidateForCycle = (cycleIndex) => {
      if (!Number.isFinite(Number(cycleIndex))) return false;
      const normalizedCycle = Math.max(0, Math.round(Number(cycleIndex)));
      const entries = lastManifestCycleEntries.get(normalizedCycle) || [];
      const nextRetry = computeNextRetryIndex(entries);
      selectedManifestCycleIndex = normalizedCycle;
      pendingRetryCandidate = { cycleIndex: normalizedCycle, retryIndex: nextRetry };
      setStatus(`Cycle ${normalizedCycle + 1} selected. Click replay slot to launch r${nextRetry}.`);
      return true;
    };

    const lightboxIsOpen = () => lightbox.classList.contains("is-open");

    const lightboxCollectCycleItems = (detail, cycleIndex) => {
      const manifest = Array.isArray(detail?.manifest) ? detail.manifest : [];
      const items = [];
      const inCycle = manifest.filter((entry) => Number(entry?.cycle_index) === Number(cycleIndex));
      inCycle.sort((a, b) => {
        const retryDelta = Number(a?.retry_index ?? 0) - Number(b?.retry_index ?? 0);
        if (retryDelta !== 0) return retryDelta;
        return Number(a?.updated_at ?? a?.created_at ?? 0) - Number(b?.updated_at ?? b?.created_at ?? 0);
      });
      for (const entry of inCycle) {
        const images = Array.isArray(entry?.outputs?.images) ? entry.outputs.images : [];
        for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
          const image = images[imageIndex];
          items.push({
            cycleIndex: Number(entry?.cycle_index ?? cycleIndex),
            retryIndex: Number(entry?.retry_index ?? 0),
            entryStatus: String(entry?.status || ""),
            decisionRaw: String(entry?.decision || entry?.status || "pending"),
            decisionClass: badgeClassForDecision(entry?.decision || entry?.status || "pending"),
            imageIndex,
            fullSrc: buildImageSrc(image, false),
            thumbSrc: buildImageSrc(image, true),
            updatedAt: Number(entry?.updated_at ?? entry?.created_at ?? 0),
          });
        }
      }
      return { items, inCycle };
    };

    const lightboxCycleHasPending = (entries = []) =>
      entries.some((entry) => {
        const status = String(entry?.status || "").toLowerCase();
        return status === "queued" || status === "running";
      });

    const lightboxResolveCycleIndex = (detail, preferredCycle = null) => {
      const total = Math.max(0, Number(detail?.total_cycles || 0));
      if (Number.isFinite(Number(preferredCycle))) {
        const safePreferred = Math.max(0, Math.round(Number(preferredCycle)));
        if (!total || safePreferred < total) return safePreferred;
      }
      const firstIncomplete = findFirstIncompleteCycleIndex(detail);
      if (Number.isFinite(Number(firstIncomplete))) return Math.max(0, Number(firstIncomplete));
      const currentCycle = Number(detail?.current_cycle);
      if (Number.isFinite(currentCycle) && currentCycle >= 0) {
        if (!total || currentCycle < total) return Math.round(currentCycle);
      }
      if (total > 0) return total - 1;
      return 0;
    };

    const lightboxRender = () => {
      const isCycleMode = lightboxState.mode === "cycle";
      const hasItems = Array.isArray(lightboxState.cycleItems) && lightboxState.cycleItems.length > 0;
      const itemCount = hasItems ? lightboxState.cycleItems.length : 0;
      const boundedIndex = hasItems
        ? Math.max(0, Math.min(itemCount - 1, Number(lightboxState.itemIndex || 0)))
        : 0;
      if (hasItems) lightboxState.itemIndex = boundedIndex;
      const item = hasItems ? lightboxState.cycleItems[boundedIndex] : null;

      lightboxPanel.classList.toggle("is-cycle-mode", isCycleMode);
      lightboxPrevBtn.style.display = isCycleMode ? "" : "none";
      lightboxNextBtn.style.display = isCycleMode ? "" : "none";
      lightboxApproveBtn.style.display = isCycleMode ? "" : "none";
      lightboxRejectBtn.style.display = isCycleMode ? "" : "none";
      lightboxReplayBtn.style.display = isCycleMode ? "" : "none";
      lightboxStatusBadge.style.display = isCycleMode ? "" : "none";
      lightboxEntryMeta.style.display = isCycleMode ? "" : "none";
      lightboxCycleSelect.style.display = isCycleMode ? "" : "none";
      lightboxCycleLabel.style.display = isCycleMode ? "none" : "";

      if (!isCycleMode) {
        lightboxCycleLabel.textContent = "Preview";
        lightboxImg.src = lightboxState.src || "";
        lightboxImg.style.display = lightboxState.src ? "block" : "none";
        lightboxSkeleton.style.display = lightboxState.src ? "none" : "flex";
        lightboxSkeleton.textContent = "No preview";
        lightboxStatusBadge.textContent = "";
        lightboxStatusBadge.className = "lemouf-loop-result-badge pending lemouf-loop-lightbox-status";
        lightboxEntryMeta.textContent = "";
        lightboxPrevBtn.disabled = true;
        lightboxNextBtn.disabled = true;
        lightboxApproveBtn.disabled = true;
        lightboxRejectBtn.disabled = true;
        lightboxReplayBtn.disabled = true;
        return;
      }

      const cycleDisplay = Number.isFinite(Number(lightboxState.cycleIndex))
        ? Number(lightboxState.cycleIndex) + 1
        : 1;
      const cycleTotal = Math.max(1, Number(lightboxState.totalCycles || 1));
      lightboxCycleLabel.textContent = `Cycle ${cycleDisplay}/${cycleTotal}`;
      lightboxCycleSelect.disabled = lightboxState.actionBusy;
      if (String(lightboxCycleSelect.dataset.count || "") !== String(cycleTotal)) {
        lightboxCycleSelect.innerHTML = "";
        for (let idx = 0; idx < cycleTotal; idx += 1) {
          lightboxCycleSelect.appendChild(
            el("option", {
              value: String(idx),
              text: `Cycle ${idx + 1}/${cycleTotal}`,
            })
          );
        }
        lightboxCycleSelect.dataset.count = String(cycleTotal);
      }
      const safeCycleValue = String(Math.max(0, Math.min(cycleTotal - 1, cycleDisplay - 1)));
      if (lightboxCycleSelect.value !== safeCycleValue) {
        lightboxCycleSelect.value = safeCycleValue;
      }

      const itemStatusLower = String(item?.entryStatus || "").toLowerCase();
      const itemIsPending = itemStatusLower === "queued" || itemStatusLower === "running";
      const explicitPending =
        Boolean(String(lightboxState.pendingReason || "").trim()) &&
        Number(lightboxState.pendingCycleIndex) === Number(lightboxState.cycleIndex);
      const pendingRetry = Number(lightboxState.pendingRetryIndex);
      const pendingRetryVisible =
        Number.isFinite(pendingRetry) &&
        hasItems &&
        lightboxState.cycleItems.some((entry) => Number(entry?.retryIndex) === pendingRetry);
      const hasPending = explicitPending && !pendingRetryVisible;
      const showSkeleton = !item || itemIsPending || hasPending;
      if (showSkeleton) {
        lightboxImg.style.display = "none";
        lightboxSkeleton.style.display = "flex";
        const reason = String(lightboxState.pendingReason || "").toLowerCase();
        lightboxSkeleton.textContent = reason === "reject"
          ? "Rejected · generating next replay..."
          : (reason === "replay" ? "Replay queued..." : "Generating preview...");
      } else {
        lightboxImg.src = item.fullSrc || item.thumbSrc || "";
        lightboxImg.style.display = "block";
        lightboxSkeleton.style.display = "none";
      }

      const decisionText = item
        ? String(item.decisionRaw || item.entryStatus || "pending").toUpperCase()
        : (hasPending ? "QUEUED" : "PENDING");
      const decisionClass = item?.decisionClass || (hasPending ? "queued" : "pending");
      lightboxStatusBadge.textContent = decisionText;
      lightboxStatusBadge.className = `lemouf-loop-result-badge ${decisionClass} lemouf-loop-lightbox-status`;

      const retryText = item ? `r${Number(item.retryIndex || 0)}` : "r?";
      const itemText = item ? `${boundedIndex + 1}/${itemCount}` : "0/0";
      const statusText = item ? String(item.entryStatus || "").toLowerCase() : "queued";
      lightboxEntryMeta.textContent = `${retryText} · ${itemText} · ${statusText}`;

      lightboxPrevBtn.disabled = lightboxState.actionBusy || !hasItems || boundedIndex <= 0;
      lightboxNextBtn.disabled = lightboxState.actionBusy || !hasItems || boundedIndex >= itemCount - 1;

      const statusLower = String(item?.entryStatus || "").toLowerCase();
      const decisionLower = String(item?.decisionRaw || "").toLowerCase();
      const itemActionable =
        Boolean(item) &&
        (
          statusLower === "returned" &&
          decisionLower !== "approve" &&
          decisionLower !== "approved" &&
          decisionLower !== "reject" &&
          decisionLower !== "discard"
        );
      const disableActions = lightboxState.actionBusy || itemIsPending || hasPending || !itemActionable;
      lightboxApproveBtn.disabled = disableActions;
      lightboxRejectBtn.disabled = disableActions;
      lightboxReplayBtn.disabled = lightboxState.actionBusy || itemIsPending || hasPending || !item;
    };

    const lightboxStopPolling = () => {
      if (!lightboxPollTimer) return;
      clearInterval(lightboxPollTimer);
      lightboxPollTimer = null;
    };

    const lightboxStartPolling = () => {
      if (lightboxPollTimer) return;
      const sessionAtStart = Number(lightboxState.sessionId || 0);
      lightboxPollTimer = setInterval(async () => {
        if (!lightboxIsOpen() || lightboxState.mode !== "cycle") {
          lightboxStopPolling();
          return;
        }
        if (Number(lightboxState.sessionId || 0) !== sessionAtStart) {
          lightboxStopPolling();
          return;
        }
        const data = await refreshLoopDetail({ quiet: true });
        if (!data) return;
        // refreshLoopDetail keeps currentLoopDetail in sync; render from latest state.
        lightboxSyncFromDetail(data, { preserveSelection: true });
      }, 900);
    };

    const lightboxSyncFromDetail = (
      detail,
      {
        preserveSelection = false,
        preferredCycle = null,
        preferredRetry = null,
        preferredImageIndex = null,
        strictPreferredCycle = false,
      } = {}
    ) => {
      if (!detail || typeof detail !== "object") return;
      lightboxState.totalCycles = Math.max(1, Number(detail?.total_cycles || 1));
      const preferredCycleCandidate = hasFiniteCycleIndex(preferredCycle)
        ? Number(normalizeCycleIndex(preferredCycle))
        : (
          hasFiniteCycleIndex(lightboxState.lockedCycleIndex)
            ? Number(normalizeCycleIndex(lightboxState.lockedCycleIndex))
            : Number(normalizeCycleIndex(lightboxState.cycleIndex))
        );
      const cycleIndex =
        strictPreferredCycle && Number.isFinite(Number(preferredCycleCandidate))
          ? (
            Math.max(
              0,
              Math.min(
                lightboxState.totalCycles > 0 ? lightboxState.totalCycles - 1 : Number(preferredCycleCandidate),
                Math.round(Number(preferredCycleCandidate))
              )
            )
          )
          : lightboxResolveCycleIndex(
            detail,
            preferredCycleCandidate
          );
      lightboxState.cycleIndex = cycleIndex;
      const { items, inCycle } = lightboxCollectCycleItems(detail, cycleIndex);
      lightboxState.cycleItems = items;

      const cycleHasPending = lightboxCycleHasPending(inCycle);
      let cyclePendingRetry = null;
      if (Number(lightboxState.pendingCycleIndex) === cycleIndex) {
        const pendingRetry = Number(lightboxState.pendingRetryIndex);
        if (Number.isFinite(pendingRetry)) cyclePendingRetry = pendingRetry;
        const pendingEntry = Number.isFinite(pendingRetry)
          ? inCycle.find((entry) => Number(entry?.retry_index) === pendingRetry)
          : null;
        const pendingStatus = String(pendingEntry?.status || "").toLowerCase();
        const pendingVisible = Boolean(pendingEntry);
        const pendingTerminal =
          pendingVisible && pendingStatus !== "queued" && pendingStatus !== "running";
        const runtimeStatus = String(detail?.status || "").toLowerCase();
        const runtimeFailed = runtimeStatus.includes("fail") || runtimeStatus.includes("error");
        if (
          !Number.isFinite(pendingRetry) ||
          pendingTerminal ||
          (runtimeFailed && !cycleHasPending && !pendingVisible)
        ) {
          lightboxState.pendingCycleIndex = null;
          lightboxState.pendingRetryIndex = null;
          lightboxState.pendingReason = "";
        }
      }

      let nextIndex = 0;
      if (preserveSelection && Number.isFinite(Number(lightboxState.itemIndex))) {
        nextIndex = Math.max(0, Math.min(Math.max(0, items.length - 1), Number(lightboxState.itemIndex)));
      }
      const hasPreferredRetry = hasFiniteCycleIndex(preferredRetry);
      const hasPreferredImage = hasFiniteCycleIndex(preferredImageIndex);
      const pendingPreferredRetry =
        cyclePendingRetry !== null
          ? Number(Math.round(Number(cyclePendingRetry)))
          : null;
      const targetRetry = hasPreferredRetry
        ? Number(Math.round(Number(preferredRetry)))
        : pendingPreferredRetry;
      const targetImage = hasPreferredImage ? Number(Math.round(Number(preferredImageIndex))) : null;
      if (targetRetry !== null || targetImage !== null) {
        const exactIndex = items.findIndex((entry) => {
          const retryOk = targetRetry !== null ? Number(entry.retryIndex) === targetRetry : true;
          const imageOk = targetImage !== null ? Number(entry.imageIndex) === targetImage : true;
          return retryOk && imageOk;
        });
        if (exactIndex >= 0) nextIndex = exactIndex;
      }
      if (!Number.isFinite(Number(nextIndex))) nextIndex = 0;
      lightboxState.itemIndex = Math.max(0, Math.min(Math.max(0, items.length - 1), nextIndex));
      lightboxRender();
    };

    const lightboxFocusNextIncompleteCycle = (detail, fallbackCycle = 0) => {
      const nextCycle = lightboxResolveCycleIndex(detail, findFirstIncompleteCycleIndex(detail));
      lightboxState.lockedCycleIndex = hasFiniteCycleIndex(nextCycle)
        ? Number(normalizeCycleIndex(nextCycle))
        : Number(normalizeCycleIndex(fallbackCycle));
      lightboxSyncFromDetail(detail, {
        preserveSelection: false,
        preferredCycle: Number.isFinite(Number(nextCycle)) ? Number(nextCycle) : fallbackCycle,
        preferredRetry: null,
        preferredImageIndex: 0,
      });
    };

    const lightboxOpenCycle = async ({ cycleIndex = null, retryIndex = null, imageIndex = null, src = "" } = {}) => {
      lightboxStopPolling();
      lightboxState.sessionId += 1;
      const sessionAtOpen = Number(lightboxState.sessionId || 0);
      lightboxState.mode = "cycle";
      lightboxState.src = "";
      lightboxState.lockedCycleIndex = normalizeCycleIndex(cycleIndex);
      lightbox.classList.add("is-open");
      lightboxState.actionBusy = false;
      let detail = currentLoopDetail;
      if (!detail) detail = await refreshLoopDetail({ quiet: true });
      if (!detail) {
        lightboxSkeleton.style.display = "flex";
        lightboxSkeleton.textContent = "Unable to load cycle detail.";
        lightboxImg.style.display = "none";
        lightboxRender();
        return;
      }
      lightboxSyncFromDetail(detail, {
        preserveSelection: false,
        preferredCycle: cycleIndex,
        preferredRetry: retryIndex,
        preferredImageIndex: imageIndex,
        strictPreferredCycle: true,
      });
      if (Number(lightboxState.sessionId || 0) !== sessionAtOpen) return;
      if (src && !lightboxState.cycleItems.length) {
        lightboxImg.src = src;
        lightboxImg.style.display = "block";
        lightboxSkeleton.style.display = "none";
      }
      lightboxStartPolling();
    };

    const lightboxNavigate = (delta) => {
      if (lightboxState.mode !== "cycle") return;
      const items = Array.isArray(lightboxState.cycleItems) ? lightboxState.cycleItems : [];
      if (!items.length) return;
      const bounded = Math.max(0, Math.min(items.length - 1, Number(lightboxState.itemIndex || 0) + delta));
      if (bounded === Number(lightboxState.itemIndex || 0)) return;
      lightboxState.itemIndex = bounded;
      lightboxRender();
    };

    const lightboxJumpToCycle = async (cycleIndex) => {
      if (lightboxState.mode !== "cycle") return;
      const normalizedCycle = Math.max(0, Math.round(Number(cycleIndex) || 0));
      lightboxState.lockedCycleIndex = normalizedCycle;
      const detail = currentLoopDetail || await refreshLoopDetail({ quiet: true });
      if (!detail) return;
      lightboxSyncFromDetail(detail, {
        preserveSelection: false,
        preferredCycle: normalizedCycle,
        preferredRetry: null,
        preferredImageIndex: 0,
        strictPreferredCycle: true,
      });
    };

    const lightboxQueueGenerationSkeleton = (cycleIndex, retryIndex, reason = "replay") => {
      lightboxState.pendingCycleIndex = Number(cycleIndex);
      lightboxState.pendingRetryIndex = Number(retryIndex);
      lightboxState.pendingReason = String(reason || "replay");
      lightboxRender();
      lightboxStartPolling();
    };

    const lightboxApproveCurrent = async () => {
      if (lightboxState.mode !== "cycle" || lightboxState.actionBusy) return;
      const items = Array.isArray(lightboxState.cycleItems) ? lightboxState.cycleItems : [];
      const item = items[Math.max(0, Math.min(items.length - 1, Number(lightboxState.itemIndex || 0)))];
      if (!item) return;
      lightboxState.actionBusy = true;
      lightboxRender();
      await decideEntry(item.cycleIndex, item.retryIndex, "approve", item.entryStatus || "");
      const after = currentLoopDetail || await refreshLoopDetail({ quiet: true });
      if (after) {
        const manifest = Array.isArray(after?.manifest) ? after.manifest : [];
        const cycleEntries = manifest.filter((entry) => Number(entry?.cycle_index) === Number(item.cycleIndex));
        const cycleCompleted = cycleEntries.some(entryIsApproved);
        if (cycleCompleted) {
          lightboxState.actionBusy = false;
          closeLightbox();
          return;
        }
        lightboxFocusNextIncompleteCycle(after, item.cycleIndex + 1);
      }
      lightboxState.actionBusy = false;
      lightboxRender();
    };

    const lightboxRejectCurrent = async () => {
      if (lightboxState.mode !== "cycle" || lightboxState.actionBusy) return;
      const items = Array.isArray(lightboxState.cycleItems) ? lightboxState.cycleItems : [];
      const item = items[Math.max(0, Math.min(items.length - 1, Number(lightboxState.itemIndex || 0)))];
      if (!item) return;
      const cycleEntries = lastManifestCycleEntries.get(Number(item.cycleIndex)) || [];
      const nextRetry = Math.max(computeNextRetryIndex(cycleEntries), Number(item.retryIndex) + 1);
      lightboxState.actionBusy = true;
      lightboxQueueGenerationSkeleton(item.cycleIndex, nextRetry, "reject");
      await decideEntry(item.cycleIndex, item.retryIndex, "reject", item.entryStatus || "");
      const after = currentLoopDetail || await refreshLoopDetail({ quiet: true });
      if (after) {
        lightboxSyncFromDetail(after, {
          preserveSelection: true,
          preferredCycle: item.cycleIndex,
          preferredRetry: nextRetry,
          preferredImageIndex: 0,
        });
      }
      lightboxState.actionBusy = false;
      lightboxRender();
    };

    const lightboxReplayCurrent = async () => {
      if (lightboxState.mode !== "cycle" || lightboxState.actionBusy) return;
      const items = Array.isArray(lightboxState.cycleItems) ? lightboxState.cycleItems : [];
      const item = items[Math.max(0, Math.min(items.length - 1, Number(lightboxState.itemIndex || 0)))];
      if (!item) return;
      const cycleEntries = lastManifestCycleEntries.get(Number(item.cycleIndex)) || [];
      const nextRetry = Math.max(computeNextRetryIndex(cycleEntries), Number(item.retryIndex) + 1);
      lightboxState.actionBusy = true;
      lightboxQueueGenerationSkeleton(item.cycleIndex, nextRetry, "replay");
      await launchReplayForCycle(item.cycleIndex, nextRetry, cycleEntries);
      const after = currentLoopDetail || await refreshLoopDetail({ quiet: true });
      if (after) {
        lightboxSyncFromDetail(after, {
          preserveSelection: true,
          preferredCycle: item.cycleIndex,
          preferredRetry: nextRetry,
          preferredImageIndex: 0,
        });
      }
      lightboxState.actionBusy = false;
      lightboxRender();
    };

    openLoopLightboxImpl = async (src, context = null) => {
      const ctx = context && typeof context === "object" ? context : null;
      if (ctx?.mode === "cycle" && currentLoopId) {
        await lightboxOpenCycle({
          cycleIndex: Number(ctx.cycleIndex),
          retryIndex: Number(ctx.retryIndex),
          imageIndex: Number(ctx.imageIndex),
          src,
        });
        return;
      }
      lightboxState.mode = "generic";
      lightboxState.src = src;
      lightboxState.cycleIndex = null;
      lightboxState.lockedCycleIndex = null;
      lightboxState.sessionId += 1;
      lightboxState.totalCycles = 0;
      lightboxState.cycleItems = [];
      lightboxState.itemIndex = 0;
      lightboxState.pendingCycleIndex = null;
      lightboxState.pendingRetryIndex = null;
      lightboxState.pendingReason = "";
      lightboxState.actionBusy = false;
      lightboxStopPolling();
      lightbox.classList.add("is-open");
      lightboxRender();
    };

    lightboxPrevBtn.addEventListener("click", () => lightboxNavigate(-1));
    lightboxNextBtn.addEventListener("click", () => lightboxNavigate(1));
    lightboxCycleSelect.addEventListener("change", () => {
      const cycleIndex = Number(lightboxCycleSelect.value);
      if (!Number.isFinite(cycleIndex)) return;
      void lightboxJumpToCycle(cycleIndex);
    });
    lightboxApproveBtn.addEventListener("click", () => {
      void lightboxApproveCurrent();
    });
    lightboxRejectBtn.addEventListener("click", () => {
      void lightboxRejectCurrent();
    });
    lightboxReplayBtn.addEventListener("click", () => {
      void lightboxReplayCurrent();
    });

    const isTextLikeTarget = (target) => {
      if (!target || typeof target !== "object") return false;
      const element = target;
      if (element.isContentEditable) return true;
      const tag = String(element.tagName || "").toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const hasSong2DawStepDetail = () =>
      Boolean(currentSong2DawRun) &&
      Array.isArray(currentSong2DawRun?.summary?.steps) &&
      currentSong2DawRun.summary.steps.length > 0;

    const updateSong2DawDetailHeader = () => {
      const steps = Array.isArray(currentSong2DawRun?.summary?.steps) ? currentSong2DawRun.summary.steps : [];
      const total = steps.length;
      const hasSteps = total > 0;
      const boundedIndex = hasSteps
        ? Math.max(0, Math.min(total - 1, Math.round(Number(selectedSong2DawStepIndex) || 0)))
        : 0;
      if (hasSteps) selectedSong2DawStepIndex = boundedIndex;
      const step = hasSteps ? (steps[boundedIndex] || {}) : null;
      const stepName = String(step?.name || "Step detail");
      const stepVersion = String(step?.version || "");
      if (song2dawDetailHeaderTitle) {
        song2dawDetailHeaderTitle.textContent = hasSteps
          ? `${stepName}${stepVersion ? ` v${stepVersion}` : ""}`
          : "No step detail";
      }
      if (song2dawDetailHeaderMeta) {
        song2dawDetailHeaderMeta.textContent = hasSteps
          ? `Step ${boundedIndex + 1}/${total}`
          : "Step 0/0";
      }
      if (song2dawDetailPrevBtn) {
        song2dawDetailPrevBtn.disabled = !hasSteps || boundedIndex <= 0;
      }
      if (song2dawDetailNextBtn) {
        song2dawDetailNextBtn.disabled = !hasSteps || boundedIndex >= total - 1;
      }
    };

    const clampPanelHeight = (value, minValue, maxValue) =>
      Math.max(minValue, Math.min(maxValue, value));

    const balanceSong2DawDetailPanels = () => {
      if (!song2dawDetailLayout || !song2dawStepPanel || !song2dawRunSummaryPanel || !song2dawStepDetail || !song2dawDetail) {
        return;
      }
      if (currentScreen !== "song2daw_detail") return;

      const head = song2dawDetailLayout.querySelector(".lemouf-song2daw-detail-head");
      const headHeight = head ? head.offsetHeight : 0;
      const layoutStyle = window.getComputedStyle(song2dawDetailLayout);
      const gapRaw = Number.parseFloat(layoutStyle.gap || layoutStyle.rowGap || "0");
      const gap = Number.isFinite(gapRaw) ? gapRaw : 0;
      const padTop = Number.parseFloat(layoutStyle.paddingTop || "0") || 0;
      const padBottom = Number.parseFloat(layoutStyle.paddingBottom || "0") || 0;
      const available = Math.max(
        180,
        Math.floor(song2dawDetailLayout.clientHeight - headHeight - padTop - padBottom - gap * 2)
      );

      const minPanel = 110;
      if (available <= minPanel * 2) {
        const half = Math.max(80, Math.floor(available / 2));
        song2dawStepPanel.style.flex = `0 0 ${half}px`;
        song2dawRunSummaryPanel.style.flex = `0 0 ${Math.max(80, available - half)}px`;
        return;
      }

      const contentChrome = Math.max(28, song2dawStepPanel.offsetHeight - song2dawStepDetail.clientHeight);
      const summaryChrome = Math.max(28, song2dawRunSummaryPanel.offsetHeight - song2dawDetail.clientHeight);
      const contentNeed = Math.max(minPanel, Math.ceil(song2dawStepDetail.scrollHeight + contentChrome));
      const summaryNeed = Math.max(minPanel, Math.ceil(song2dawDetail.scrollHeight + summaryChrome));
      const half = Math.floor(available / 2);

      let contentTarget = half;
      let summaryTarget = available - contentTarget;
      if (!(contentNeed <= half && summaryNeed <= half)) {
        const needTotal = Math.max(1, contentNeed + summaryNeed);
        contentTarget = Math.floor((available * contentNeed) / needTotal);
        summaryTarget = available - contentTarget;

        contentTarget = clampPanelHeight(contentTarget, minPanel, available - minPanel);
        summaryTarget = clampPanelHeight(summaryTarget, minPanel, available - minPanel);

        let used = contentTarget + summaryTarget;
        if (used > available) {
          const overflow = used - available;
          if (contentTarget >= summaryTarget) contentTarget -= overflow;
          else summaryTarget -= overflow;
        } else if (used < available) {
          const extra = available - used;
          if (contentNeed - contentTarget >= summaryNeed - summaryTarget) contentTarget += extra;
          else summaryTarget += extra;
        }

        const contentCap = clampPanelHeight(contentNeed, minPanel, available - minPanel);
        const summaryCap = clampPanelHeight(summaryNeed, minPanel, available - minPanel);
        if (contentTarget > contentCap && summaryTarget < summaryNeed) {
          const delta = Math.min(contentTarget - contentCap, (available - minPanel) - summaryTarget);
          contentTarget -= delta;
          summaryTarget += delta;
        }
        if (summaryTarget > summaryCap && contentTarget < contentNeed) {
          const delta = Math.min(summaryTarget - summaryCap, (available - minPanel) - contentTarget);
          summaryTarget -= delta;
          contentTarget += delta;
        }
      }

      song2dawStepPanel.style.flex = `0 0 ${Math.max(minPanel, contentTarget)}px`;
      song2dawRunSummaryPanel.style.flex = `0 0 ${Math.max(minPanel, summaryTarget)}px`;
    };

    const scheduleSong2DawDetailBalance = () => {
      if (song2dawDetailBalanceRaf) cancelAnimationFrame(song2dawDetailBalanceRaf);
      song2dawDetailBalanceRaf = requestAnimationFrame(() => {
        song2dawDetailBalanceRaf = 0;
        balanceSong2DawDetailPanels();
      });
    };

    const stepSong2DawDetailBy = (delta) => {
      const steps = Array.isArray(currentSong2DawRun?.summary?.steps) ? currentSong2DawRun.summary.steps : [];
      if (!steps.length) return;
      const next = Math.max(0, Math.min(steps.length - 1, selectedSong2DawStepIndex + delta));
      if (next === selectedSong2DawStepIndex) return;
      selectedSong2DawStepIndex = next;
      renderSong2DawStepViews(currentSong2DawRun);
      if (song2dawStepDetail) song2dawStepDetail.scrollTop = 0;
      setSong2DawStatus(`Detail view: step ${next + 1}/${steps.length}`);
    };

    const openSong2DawStepDetailScreen = () => {
      if (!hasSong2DawStepDetail()) {
        setSong2DawStatus("No step detail available.");
        return;
      }
      updateSong2DawDetailHeader();
      setScreen("song2daw_detail");
      scheduleSong2DawDetailBalance();
    };

    const ensureSong2DawHomeScreen = () => {
      if (currentScreen === "song2daw_detail") setScreen("home");
    };

    const setWorkflowProfileStatus = (profile) => {
      if (!workflowProfileStatus) return;
      const effective = profile && typeof profile === "object"
        ? profile
        : finalizeWorkflowProfile({ profile_id: "generic_loop", source: "fallback_generic" }, "fallback_generic");
      workflowProfileStatus.textContent = formatWorkflowProfileStatus(effective);
      const warning = !effective.compatible || !effective.known_profile;
      workflowProfileStatus.classList.toggle("is-warning", warning);
      workflowProfileStatus.classList.toggle("is-ok", !warning);
      setWorkflowDiagnosticsSummary();
    };

    const setWorkflowDiagnosticsVisible = (visible) => {
      workflowDiagnosticsVisible = Boolean(visible);
      if (workflowDiagnosticsPanel) {
        workflowDiagnosticsPanel.style.display = "";
      }
    };

    const workflowProfileIcon = (profile) => {
      const p = profile && typeof profile === "object" ? profile : null;
      const profileId = String(p?.profile_id || "").toLowerCase();
      const kind = String(p?.workflow_kind || "master").toLowerCase();
      if (profileId === "song2daw") return kind === "master" ? "[S2D*]" : "[S2D]";
      if (profileId === "generic_loop") return kind === "master" ? "[LOOP*]" : "[LOOP]";
      return kind === "master" ? "[WF*]" : "[WF]";
    };

    const setPipelineGraphStatus = (msg) => {
      pipelineGraphView?.setStatus(msg || "");
    };

    const syncPipelineNavVisibility = () => {
      const isGenericLoopProfile = currentWorkflowProfile?.adapter_id === "generic_loop";
      const showPipelineGraph = pipelineLoadedState && isGenericLoopProfile;
      const hasLoadedSelection =
        Boolean(currentWorkflowName) &&
        String(currentWorkflowName) === String(pipelineSelect?.value || "");
      const showPipeline = showPipelineGraph || hasLoadedSelection;
      pipelineNav.style.display = showPipeline ? "" : "none";
      if (pipelineGraphView?.root) pipelineGraphView.root.style.display = showPipelineGraph ? "" : "none";
      if (pipelineGraphView?.status) pipelineGraphView.status.style.display = showPipelineGraph ? "" : "none";
    };

    const setPipelineLoaded = (loaded) => {
      pipelineLoadedState = Boolean(loaded);
      syncPipelineNavVisibility();
    };

    const toMsTimestamp = (value, fallback = Date.now()) => {
      const raw = Number(value);
      if (!Number.isFinite(raw) || raw <= 0) return Math.round(fallback);
      if (raw > 10_000_000_000) return Math.round(raw);
      return Math.round(raw * 1000);
    };

    const sanitizePipelineSteps = (steps) => {
      if (!Array.isArray(steps)) return [];
      const seen = new Set();
      const normalized = [];
      for (const step of steps) {
        const id = String(step?.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const role = String(step?.role ?? "");
        const workflow = String(step?.workflow ?? "");
        const rawIndex = Number(step?.stepIndex);
        normalized.push({
          id,
          role,
          workflow,
          stepIndex: Number.isFinite(rawIndex) ? rawIndex : normalized.length,
        });
      }
      normalized.sort((a, b) => Number(a.stepIndex || 0) - Number(b.stepIndex || 0));
      return normalized;
    };

    const buildPipelineRunStateFromLoopDetail = (detail, steps) => {
      const list = sanitizePipelineSteps(steps);
      if (!list.length) return null;
      const now = Date.now();
      const status = String(detail?.status || "").toLowerCase();
      const manifest = Array.isArray(detail?.manifest) ? detail.manifest : [];
      const hasManifest = manifest.length > 0;
      const hasPendingManifest = manifest.some((entry) => {
        const entryStatus = String(entry?.status || "").toLowerCase();
        return entryStatus === "queued" || entryStatus === "running";
      });
      const runStartedAt = toMsTimestamp(detail?.created_at, now);
      const runUpdatedAt = toMsTimestamp(detail?.updated_at, now);
      const stepsState = {};
      for (const step of list) {
        const role = String(step?.role || "").toLowerCase();
        let stepStatus = "pending";
        if (role === "generate") {
          if (hasManifest) stepStatus = "done";
          else if (status === "running" || status === "queued") stepStatus = "running";
        } else if (role === "execute") {
          if (status === "complete") stepStatus = "done";
          else if (hasManifest || status === "running" || status === "queued" || hasPendingManifest) stepStatus = "running";
        } else if (role === "composition") {
          if (status === "complete") stepStatus = "waiting";
        }
        const doneLike = stepStatus === "done";
        stepsState[step.id] = {
          status: stepStatus,
          startedAt: runStartedAt,
          ...(doneLike ? { endedAt: runUpdatedAt } : {}),
        };
      }
      const hasComposition = list.some((step) => String(step?.role || "").toLowerCase() === "composition");
      const endedAt = status === "complete" && !hasComposition ? runUpdatedAt : null;
      return {
        startedAt: runStartedAt,
        endedAt,
        steps: stepsState,
      };
    };

    const persistPipelineRuntimeState = () => {
      try {
        if (!currentLoopId) {
          localStorage.removeItem(PIPELINE_RUNTIME_KEY);
          return;
        }
        const steps = sanitizePipelineSteps(pipelineState.steps);
        if (!steps.length) {
          localStorage.removeItem(PIPELINE_RUNTIME_KEY);
          return;
        }
        const payload = {
          version: 1,
          loopId: String(currentLoopId),
          workflowName: String(selectedPipelineWorkflowName || pipelineSelect?.value || ""),
          steps,
          lastRun: pipelineState.lastRun && typeof pipelineState.lastRun === "object"
            ? pipelineState.lastRun
            : null,
          activeStepId: pipelineActiveStepId || null,
          selectedStepId: pipelineSelectedStepId || null,
          savedAt: Date.now(),
        };
        localStorage.setItem(PIPELINE_RUNTIME_KEY, JSON.stringify(payload));
      } catch {}
    };

    const restorePipelineRuntimeState = (loopId) => {
      const targetLoopId = String(loopId || "").trim();
      if (!targetLoopId) return false;
      try {
        const raw = localStorage.getItem(PIPELINE_RUNTIME_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || String(payload.loopId || "") !== targetLoopId) return false;
        const steps = sanitizePipelineSteps(payload.steps);
        if (!steps.length) return false;
        pipelineState.steps = steps;
        pipelineState.lastRun = payload.lastRun && typeof payload.lastRun === "object"
          ? payload.lastRun
          : null;
        const stepIds = new Set(steps.map((step) => step.id));
        const activeId = String(payload.activeStepId || "");
        const selectedId = String(payload.selectedStepId || "");
        pipelineActiveStepId = stepIds.has(activeId) ? activeId : null;
        pipelineSelectedStepId = stepIds.has(selectedId)
          ? selectedId
          : (pipelineActiveStepId || steps[0]?.id || null);
        setPipelineLoaded(true);
        return true;
      } catch {
        return false;
      }
    };

    const hydratePipelineStateFromSelection = async (detail) => {
      if (pipelineHydrationInFlight) return false;
      const selectedName = String(selectedPipelineWorkflowName || pipelineSelect?.value || "").trim();
      if (!selectedName) return false;
      const profile = profileForWorkflowName(selectedName, "catalog_hydrate");
      if (String(profile?.adapter_id || "") !== "generic_loop") return false;
      pipelineHydrationInFlight = true;
      try {
        const res = await apiPost("/lemouf/workflows/load", { name: selectedName });
        const workflow = res?.workflow;
        if (!workflow || typeof workflow !== "object") return false;
        let steps = extractPipelineSteps(workflow?.output ?? workflow?.prompt ?? null);
        if (!steps.length) steps = extractPipelineStepsFromWorkflowGraph(workflow);
        steps = sanitizePipelineSteps(steps);
        if (!steps.length) return false;
        pipelineState.steps = steps;
        pipelineState.lastRun = buildPipelineRunStateFromLoopDetail(detail, steps);
        const activeStep = steps.find((step) => {
          const status = String(pipelineState.lastRun?.steps?.[step.id]?.status || "").toLowerCase();
          return status === "running" || status === "waiting";
        });
        pipelineActiveStepId = activeStep?.id || null;
        pipelineSelectedStepId = pipelineActiveStepId || steps[0]?.id || null;
        setPipelineLoaded(true);
        persistPipelineRuntimeState();
        return true;
      } finally {
        pipelineHydrationInFlight = false;
      }
    };

    const ensurePipelineRuntimeState = async (detail = null) => {
      if (!currentLoopId) return false;
      if (Array.isArray(pipelineState.steps) && pipelineState.steps.length) return true;
      if (restorePipelineRuntimeState(currentLoopId)) return true;
      return hydratePipelineStateFromSelection(detail);
    };

    const setCurrentLoopId = (loopId) => {
      currentLoopId = loopId || "";
      if (currentLoopId) {
        localStorage.setItem(LOOP_ID_KEY, currentLoopId);
        if (!pipelineState.steps.length) {
          const restored = restorePipelineRuntimeState(currentLoopId);
          if (restored && Array.isArray(pipelineState.steps) && pipelineState.steps.length) {
            void renderPipelineGraph(pipelineState.steps);
          }
        }
      } else {
        localStorage.removeItem(LOOP_ID_KEY);
        localStorage.removeItem(PIPELINE_RUNTIME_KEY);
      }
      currentLoopDetail = null;
      loopIdLabel.textContent = currentLoopId ? `Loop ${shortId(currentLoopId)}` : "No loop";
      if (!currentLoopId) {
        loopCompositionRequested = false;
        clearLoopCompositionStudio();
        setDockContentMode("song2daw");
      }
    };

    const updateHeaderMenuForContext = () => {
      const isSong2DawProfile = currentWorkflowProfile?.adapter_id === "song2daw";
      if (headerMenuExitBtn) {
        headerMenuExitBtn.style.display = isSong2DawProfile ? "none" : "";
      }
    };

    const setScreen = (name) => {
      currentScreen = name;
      if (!preStartSection || !payloadSection || !postStartSection || !song2dawDetailSection) {
        pendingScreen = name;
        return;
      }
      if (preStartSection) preStartSection.style.display = name === "home" ? "" : "none";
      if (song2dawDetailSection) song2dawDetailSection.style.display = name === "song2daw_detail" ? "" : "none";
      if (payloadSection) payloadSection.style.display = name === "payload" ? "" : "none";
      if (postStartSection) postStartSection.style.display = name === "run" ? "" : "none";
      hasStarted = name === "run";
      if (panel) panel.classList.toggle("lemouf-loop-started", hasStarted);
      if (headerBackBtn) headerBackBtn.style.display = name !== "home" ? "" : "none";
      updateHeaderMenuForContext();
      if (typeof closeHeaderMenu === "function") closeHeaderMenu();
      if (name === "payload") updatePayloadSection();
      if (name === "song2daw_detail") scheduleSong2DawDetailBalance();
      pendingScreen = null;
    };

    const setStarted = (value) => {
      setScreen(value ? "run" : "home");
    };

    const PIPELINE_KEY = "lemoufLoopPipelineName";
    let pipelineWorkflowList = [];
    let pipelineWorkflowProfiles = {};
    let selectedPipelineWorkflowName = "";
    let workflowDiagnosticsVisible = false;
    let pipelineLoadedState = false;
    const pipelineWorkflowCache = new Map();
    const profileForWorkflowName = (name, source = "catalog") => {
      const key = String(name || "");
      const rawProfile = key && pipelineWorkflowProfiles && typeof pipelineWorkflowProfiles === "object"
        ? pipelineWorkflowProfiles[key]
        : null;
      return finalizeWorkflowProfile(rawProfile, source);
    };
    const resetSong2DawUiStateForWorkflowSwitch = () => {
      song2dawRuns = [];
      selectedSong2DawStepIndex = 0;
      currentSong2DawRun = null;
      renderSong2DawRunOptions();
      clearSong2DawStepViews();
      song2dawDetail.textContent = "";
      updateSong2DawOpenButton();
      setSong2DawStatus("Workflow switched. Run pipeline or refresh runs.");
    };
    const applyPipelineWorkflowSelection = (name, { userInitiated = false } = {}) => {
      const nextName = String(name || "");
      const prevName = String(selectedPipelineWorkflowName || "");
      if (nextName) {
        pipelineSelect.value = nextName;
        localStorage.setItem(PIPELINE_KEY, nextName);
      }
      const changed = Boolean(prevName && nextName && prevName !== nextName);
      selectedPipelineWorkflowName = nextName;
      if (changed && userInitiated) {
        const prevProfile = profileForWorkflowName(prevName, "catalog_prev");
        const nextProfile = profileForWorkflowName(nextName, "catalog_next");
        lastValidationSignature = null;
        pipelinePayloadEntry = null;
        pipelineState.steps = [];
        pipelineState.lastRun = null;
        pipelineActiveStepId = null;
        pipelineSelectedStepId = null;
        pipelineWorkflowCache.clear();
        setPipelineLoaded(false);
        pipelineGraphView?.root?.replaceChildren();
        setPipelineGraphStatus("Pipeline graph will appear here once loaded.");
        if (prevProfile.adapter_id === "song2daw" || nextProfile.adapter_id === "song2daw") {
          resetSong2DawUiStateForWorkflowSwitch();
        }
        persistPipelineRuntimeState();
      }
      renderPipelineWorkflowList();
      updateSelectedWorkflowProfilePreview();
    };
    const workflowProfileBadge = (profile) => String(workflowProfileIcon(profile) || "[WF]").replaceAll("[", "").replaceAll("]", "");
    const renderPipelineWorkflowList = () => {
      if (!pipelineList) return;
      pipelineList.innerHTML = "";
      if (!pipelineWorkflowList.length) {
        pipelineList.appendChild(el("div", { class: "lemouf-workflow-empty", text: "No master workflows found." }));
        return;
      }
      const selectedName = String(pipelineSelect.value || "");
      for (const name of pipelineWorkflowList) {
        const rawProfile = pipelineWorkflowProfiles && typeof pipelineWorkflowProfiles === "object"
          ? pipelineWorkflowProfiles[name]
          : null;
        const profile = finalizeWorkflowProfile(rawProfile, "catalog");
        const item = el("button", { class: "lemouf-workflow-item", type: "button" }, [
          el("span", { class: "lemouf-workflow-item-icon", text: workflowProfileBadge(profile) }),
          el("span", { class: "lemouf-workflow-item-name", text: name }),
        ]);
        item.classList.toggle("is-selected", name === selectedName);
        item.addEventListener("click", () => {
          if (pipelineSelect.value === name) return;
          applyPipelineWorkflowSelection(name, { userInitiated: true });
        });
        pipelineList.appendChild(item);
      }
    };
    const updateSelectedWorkflowProfilePreview = () => {
      const name = String(pipelineSelect.value || "");
      if (!name) {
        applyWorkflowProfile(
          finalizeWorkflowProfile({ profile_id: "generic_loop", source: "catalog_empty" }, "catalog_empty"),
          { sourceHint: "catalog_empty" }
        );
        return;
      }
      const rawProfile = pipelineWorkflowProfiles && typeof pipelineWorkflowProfiles === "object"
        ? pipelineWorkflowProfiles[name]
        : null;
      const profile = finalizeWorkflowProfile(
        {
          ...(rawProfile && typeof rawProfile === "object" ? rawProfile : {}),
          source: (rawProfile && rawProfile.source) ? rawProfile.source : "catalog",
        },
        "catalog"
      );
      applyWorkflowProfile(profile, { sourceHint: profile.source || "catalog" });
    };
    const refreshPipelineList = async ({ silent = false, preserveSelection = true } = {}) => {
      const res = await apiGet("/lemouf/workflows/list");
      if (!res || typeof res !== "object") {
        if (!silent) setPipelineStatus(lastApiError || "Failed to refresh workflows.");
        return;
      }
      const all = Array.isArray(res?.workflows) ? res.workflows : [];
      const masters = Array.isArray(res?.master_workflows) ? res.master_workflows : [];
      const list = masters.length ? masters : all;
      pipelineWorkflowProfiles = res?.workflow_profiles && typeof res.workflow_profiles === "object"
        ? res.workflow_profiles
        : {};
      pipelineWorkflowList = Array.isArray(list) ? list.slice() : [];
      pipelineSelect.innerHTML = "";
      if (!Array.isArray(list) || list.length === 0) {
        pipelineSelect.appendChild(el("option", { value: "", text: "No workflows found" }));
        pipelineSelect.disabled = true;
        pipelineLoadBtn.disabled = true;
        pipelineRunBtn.disabled = true;
        renderPipelineWorkflowList();
        updateSelectedWorkflowProfilePreview();
        const folder = res?.folder ? `Folder: ${res.folder}` : "Folder: workflows/";
        if (!silent) setPipelineStatus(`No master workflows found. ${folder}`);
        return;
      }
      for (const name of list) {
        const rawProfile = pipelineWorkflowProfiles[name];
        const profile = finalizeWorkflowProfile(rawProfile, "catalog");
        const label = `${profile.adapter_label} · ${name}`;
        pipelineSelect.appendChild(el("option", { value: name, text: label }));
      }
      pipelineSelect.disabled = false;
      pipelineLoadBtn.disabled = false;
      pipelineRunBtn.disabled = false;
      const previousSelected = String(pipelineSelect.value || selectedPipelineWorkflowName || "");
      const saved = localStorage.getItem(PIPELINE_KEY);
      let selected = "";
      if (preserveSelection && previousSelected && list.includes(previousSelected)) {
        selected = previousSelected;
      } else if (saved && list.includes(saved)) {
        selected = saved;
      } else {
        selected = list[0];
      }
      applyPipelineWorkflowSelection(selected, { userInitiated: false });
      if (!silent) {
        const allCount = all.length;
        const masterCount = list.length;
        const suffix = allCount > masterCount ? ` (${masterCount}/${allCount} master)` : "";
        setPipelineStatus(`Master workflows loaded${suffix}.`);
      }
    };

    const renderSong2DawRunOptions = () => {
      const setSong2DawRunDetailVisible = (visible) => {
        if (!song2dawRunDetailBlock) return;
        song2dawRunDetailBlock.style.display = visible ? "" : "none";
      };
      const setSong2DawPrimaryLoadVisible = (visible) => {
        if (!song2dawPrimaryLoadRow) return;
        song2dawPrimaryLoadRow.style.display = visible ? "" : "none";
      };
      song2dawSelect.innerHTML = "";
      if (!song2dawRuns.length) {
        ensureSong2DawHomeScreen();
        setSong2DawRunDetailVisible(false);
        setSong2DawPrimaryLoadVisible(false);
        song2dawSelect.appendChild(el("option", { value: "", text: "No song2daw runs" }));
        song2dawSelect.disabled = true;
        song2dawLoadBtn.disabled = true;
        song2dawOpenDirBtn.disabled = true;
        currentSong2DawRun = null;
        clearSong2DawStepViews();
        song2dawDetail.textContent = "";
        return;
      }
      setSong2DawRunDetailVisible(true);
      setSong2DawPrimaryLoadVisible(true);
      for (const run of song2dawRuns) {
        const runId = String(run?.run_id || "");
        const status = String(run?.status || "unknown");
        const stepCount = Number(run?.summary?.step_count || 0);
        const label = `${shortId(runId)} · ${status} · ${stepCount} steps`;
        song2dawSelect.appendChild(el("option", { value: runId, text: label }));
      }
      song2dawSelect.disabled = false;
      song2dawLoadBtn.disabled = false;
      song2dawOpenDirBtn.disabled = true;
    };

    const clearSong2DawStepViews = () => {
      ensureSong2DawHomeScreen();
      song2dawOverview.innerHTML = "";
      song2dawStepTitle.textContent = "Step outputs (JSON)";
      song2dawStepDetail.textContent = "";
      if (song2dawAudioPreviewPlayer) {
        try {
          song2dawAudioPreviewPlayer.pause();
        } catch {}
        song2dawAudioPreviewPlayer.removeAttribute("src");
        try {
          song2dawAudioPreviewPlayer.load();
        } catch {}
      }
      if (song2dawAudioPreviewAsset) {
        song2dawAudioPreviewAsset.innerHTML = "";
        song2dawAudioPreviewAsset.appendChild(el("option", { value: "", text: "No source preview" }));
        song2dawAudioPreviewAsset.disabled = true;
      }
      clearSong2DawStudio();
      updateSong2DawDetailHeader();
    };

    const compactList = (items, maxItems = 4) => {
      if (!Array.isArray(items) || !items.length) return "(none)";
      const values = items.map((v) => String(v || "")).filter(Boolean);
      if (!values.length) return "(none)";
      if (values.length <= maxItems) return values.join(", ");
      return `${values.slice(0, maxItems).join(", ")}, +${values.length - maxItems}`;
    };

    const compactJson = (value, maxChars = 1600) => {
      try {
        const text = JSON.stringify(value, null, 2);
        if (text.length <= maxChars) return text;
        return `${text.slice(0, maxChars)}\n... (truncated)`;
      } catch {
        return String(value ?? "");
      }
    };

    const clearSong2DawStudio = () => {
      clearSong2DawStudioView({
        mode: song2dawStudioMode,
        body: song2dawStudioBody,
        timelineBtn: song2dawStudioTimelineBtn,
        tracksBtn: song2dawStudioTracksBtn,
        spectrumBtn: song2dawStudioSpectrumBtn,
      });
    };

    const clearLoopCompositionStudio = () => {
      clearLoopCompositionStudioView({ panelBody: loopCompositionBody });
    };

    const getCompositionPipelineState = () => {
      if (!pipelineState.lastRun || !Array.isArray(pipelineState.steps) || !pipelineState.steps.length) {
        return null;
      }
      const step = pipelineState.steps.find(
        (entry) => String(entry?.role || "").toLowerCase() === "composition"
      );
      if (!step) return null;
      const runEntry = pipelineState.lastRun.steps?.[step.id] || {};
      return { step, runEntry };
    };

    const completeCompositionPipelineStep = async () => {
      const state = getCompositionPipelineState();
      if (!state) return false;
      const { step, runEntry } = state;
      if (runEntry.status === "done") return true;
      const now = Date.now();
      updatePipelineStep(step.id, "done", {
        startedAt: runEntry.startedAt || now,
        endedAt: now,
      });
      pipelineActiveStepId = null;
      pipelineSelectedStepId = step.id;
      if (pipelineState.lastRun && !pipelineState.lastRun.endedAt) {
        pipelineState.lastRun.endedAt = now;
      }
      await renderPipelineGraph(pipelineState.steps);
      setStatus("Composition step validated.");
      return true;
    };

    const renderLoopCompositionStudio = (detail) => {
      if (!loopCompositionBody) return;
      const compositionState = getCompositionPipelineState();
      const gateStatus = String(compositionState?.runEntry?.status || "").toLowerCase();
      const isGatePending = gateStatus === "waiting" || gateStatus === "running";
      renderLoopCompositionStudioView({
        detail,
        panelBody: loopCompositionBody,
        dockExpanded: song2dawDockExpanded,
        onOpenAsset: (src, context = null) => openLightbox(src, context),
        compositionGate: {
          enabled: Boolean(compositionState && isGatePending),
          status: gateStatus || "idle",
          onComplete: async () => {
            await completeCompositionPipelineStep();
          },
        },
      });
    };
    const buildMinimalCompositionDetail = () => ({
      loop_id: selectedPipelineWorkflowName
        ? `composition:${String(selectedPipelineWorkflowName)}`
        : "composition:manual",
      status: "idle",
      total_cycles: 1,
      current_cycle: 0,
      current_retry: 0,
      manifest: [],
    });

    const setDockContentMode = (mode) => {
      const nextMode = mode === "loop_composition" ? "loop_composition" : "song2daw";
      dockContentMode = nextMode;
      if (song2dawStudioPanel) {
        song2dawStudioPanel.style.display = nextMode === "song2daw" ? "" : "none";
      }
      if (loopCompositionPanel) {
        loopCompositionPanel.style.display = nextMode === "loop_composition" ? "" : "none";
      }
      if (song2dawDockTitle) {
        song2dawDockTitle.textContent = nextMode === "loop_composition"
          ? "Composition Studio"
          : "Song2DAW Studio";
      }
    };

    const getSong2DawAudioResolver = (runData) => {
      const SOURCE_FALLBACK_ASSET = "__source_audio";
      const audioAssets = runData?.audio_assets && typeof runData.audio_assets === "object" ? runData.audio_assets : {};
      const availableAudioAssetKeys = Object.keys(audioAssets).filter((key) => String(audioAssets[key] || "").trim());
      const sourcePathHint = String(runData?.audio_path || "").trim();
      const sourceFallbackEnabled = Boolean(sourcePathHint);
      const sourcePathNormalized = sourcePathHint.replaceAll("\\", "/").replace(/^\/+/, "");
      const sourceParts = sourcePathNormalized.split("/").filter(Boolean);
      const sourceFilename = sourceParts.length ? sourceParts[sourceParts.length - 1] : "";
      const sourceSubfolder = sourceParts.length > 1 ? sourceParts.slice(0, -1).join("/") : "";
      const sourceViewUrl = (() => {
        if (!sourceFilename) return "";
        const params = new URLSearchParams();
        params.set("filename", sourceFilename);
        params.set("type", "input");
        if (sourceSubfolder) params.set("subfolder", sourceSubfolder);
        return `/view?${params.toString()}`;
      })();
      const exposedAudioAssetKeys = availableAudioAssetKeys.length
        ? availableAudioAssetKeys
        : (sourceFallbackEnabled ? [SOURCE_FALLBACK_ASSET] : []);
      const preferredAudioAsset = exposedAudioAssetKeys.includes("mix")
        ? "mix"
        : (exposedAudioAssetKeys[0] || "");
      const resolveAudioUrl = (asset = "mix") => {
        const requested = String(asset || "mix");
        const resolvedAsset = exposedAudioAssetKeys.includes(requested) ? requested : preferredAudioAsset;
        if (!resolvedAsset) return "";
        if (resolvedAsset === SOURCE_FALLBACK_ASSET && sourceViewUrl) return sourceViewUrl;
        const runId = String(runData?.run_id || "");
        if (!runId) return sourceViewUrl || "";
        const params = new URLSearchParams();
        params.set("asset", resolvedAsset);
        return `/lemouf/song2daw/runs/${encodeURIComponent(runId)}/audio?${params.toString()}`;
      };
      return { audioAssets, availableAudioAssetKeys: exposedAudioAssetKeys, preferredAudioAsset, resolveAudioUrl };
    };

    const renderSong2DawAudioPreview = (runData) => {
      if (!song2dawAudioPreviewAsset || !song2dawAudioPreviewPlayer) return;
      const { availableAudioAssetKeys, preferredAudioAsset, resolveAudioUrl } = getSong2DawAudioResolver(runData);
      const previousAsset = String(song2dawAudioPreviewAsset.value || "");
      const selectedAsset = availableAudioAssetKeys.includes(previousAsset)
        ? previousAsset
        : (preferredAudioAsset || "");

      song2dawAudioPreviewAsset.innerHTML = "";
      if (!availableAudioAssetKeys.length) {
        song2dawAudioPreviewAsset.appendChild(el("option", { value: "", text: "No source preview" }));
        song2dawAudioPreviewAsset.disabled = true;
        try {
          song2dawAudioPreviewPlayer.pause();
        } catch {}
        song2dawAudioPreviewPlayer.removeAttribute("src");
        try {
          song2dawAudioPreviewPlayer.load();
        } catch {}
        return;
      }

      for (const assetKey of availableAudioAssetKeys) {
        const label = assetKey === "__source_audio" ? "Workflow source" : (assetKey === "mix" ? "Mix" : assetKey);
        song2dawAudioPreviewAsset.appendChild(el("option", { value: assetKey, text: label }));
      }
      song2dawAudioPreviewAsset.disabled = false;
      song2dawAudioPreviewAsset.value = selectedAsset;
      song2dawAudioPreviewAsset.onchange = () => {
        const nextAsset = String(song2dawAudioPreviewAsset.value || "");
        const src = resolveAudioUrl(nextAsset);
        if (src) {
          song2dawAudioPreviewPlayer.src = src;
          song2dawAudioPreviewPlayer.load();
        } else {
          song2dawAudioPreviewPlayer.removeAttribute("src");
          song2dawAudioPreviewPlayer.load();
        }
      };

      const src = resolveAudioUrl(selectedAsset);
      if (src && song2dawAudioPreviewPlayer.src !== src) {
        song2dawAudioPreviewPlayer.src = src;
        song2dawAudioPreviewPlayer.load();
      } else if (!src) {
        song2dawAudioPreviewPlayer.removeAttribute("src");
        song2dawAudioPreviewPlayer.load();
      }
    };

    const renderSong2DawStudio = (runData) => {
      const { resolveAudioUrl } = getSong2DawAudioResolver(runData);
      const jumpToStep = (stepIndex) => {
        const summarySteps = Array.isArray(runData?.summary?.steps) ? runData.summary.steps : [];
        if (!summarySteps.length) return;
        const bounded = Math.max(0, Math.min(summarySteps.length - 1, Math.round(Number(stepIndex) || 0)));
        selectedSong2DawStepIndex = bounded;
        renderSong2DawStepViews(runData);
        song2dawStepDetail.scrollTop = 0;
        setSong2DawStatus(`Inspector jump: step ${bounded + 1}/${summarySteps.length}`);
      };
      renderSong2DawStudioView({
        runData,
        mode: song2dawStudioMode,
        dockExpanded: song2dawDockExpanded,
        body: song2dawStudioBody,
        timelineBtn: song2dawStudioTimelineBtn,
        tracksBtn: song2dawStudioTracksBtn,
        spectrumBtn: song2dawStudioSpectrumBtn,
        onJumpToStep: jumpToStep,
        onOpenRunDir: () => openSong2DawRunDir(),
        onResolveAudioUrl: resolveAudioUrl,
      });
    };

    const setSong2DawStudioMode = (mode) => {
      const nextMode = mode === "tracks" ? "tracks" : (mode === "spectrum3d" ? "spectrum3d" : "timeline");
      if (song2dawStudioMode === nextMode && currentSong2DawRun) {
        renderSong2DawStudio(currentSong2DawRun);
        return;
      }
      song2dawStudioMode = nextMode;
      if (currentSong2DawRun) renderSong2DawStudio(currentSong2DawRun);
      else clearSong2DawStudio();
    };

    const selectedSong2DawRunId = () => String(song2dawSelect.value || "");

    const selectedSong2DawRunMeta = () => {
      const runId = selectedSong2DawRunId();
      return song2dawRuns.find((run) => String(run?.run_id || "") === runId) || null;
    };

    const updateSong2DawOpenButton = () => {
      const runId = selectedSong2DawRunId();
      const detailMatches = currentSong2DawRun && String(currentSong2DawRun.run_id || "") === runId;
      const runDir = detailMatches ? currentSong2DawRun?.run_dir : selectedSong2DawRunMeta()?.run_dir;
      song2dawOpenDirBtn.disabled = !String(runDir || "").trim();
    };

    const renderSong2DawStepViews = (runData) => {
      const summarySteps = Array.isArray(runData?.summary?.steps) ? runData.summary.steps : [];
      const rawSteps = Array.isArray(runData?.result?.steps) ? runData.result.steps : [];
      song2dawOverview.innerHTML = "";

      if (!summarySteps.length) {
        ensureSong2DawHomeScreen();
        song2dawOverview.appendChild(
          el("div", { class: "lemouf-song2daw-step-empty", text: "No step summary in this run." })
        );
        song2dawStepTitle.textContent = "Step outputs (JSON)";
        song2dawStepDetail.textContent = "";
        updateSong2DawDetailHeader();
        return;
      }

      if (selectedSong2DawStepIndex < 0 || selectedSong2DawStepIndex >= summarySteps.length) {
        selectedSong2DawStepIndex = 0;
      }

      const flow = el("div", { class: "lemouf-step-flow lemouf-step-flow-song2daw" });
      for (let i = 0; i < summarySteps.length; i += 1) {
        const step = summarySteps[i] || {};
        const rawStep = rawSteps[i] || {};
        const name = String(step?.name || `step_${i + 1}`);
        const version = String(step?.version || "");
        const outputs = Array.isArray(step?.outputs) ? step.outputs : [];
        const rawOutputs =
          rawStep && typeof rawStep.outputs === "object" && rawStep.outputs
            ? Object.keys(rawStep.outputs).length
            : outputs.length;
        const cacheKey = step?.cache_key ? shortId(step.cache_key) : "n/a";
        const selectedClass = i === selectedSong2DawStepIndex ? " is-selected" : "";
        const runStatus = String(runData?.status || "ok").toLowerCase() === "ok" ? "ok" : "error";
        const card = el("button", {
          class: `lemouf-step-flow-card${selectedClass}`,
          type: "button",
        });
        card.append(
          el("div", { class: "lemouf-step-flow-head" }, [
            el("span", { class: `lemouf-step-flow-badge ${runStatus}`, text: runStatus }),
            el("span", { class: "lemouf-step-flow-index", text: `Step ${i + 1}` }),
          ]),
          el("div", { class: "lemouf-step-flow-title", text: name }),
          el("div", {
            class: "lemouf-step-flow-sub",
            text: `${version ? `v${version}` : "v?"} · ${rawOutputs} output(s)`,
          }),
          el("div", { class: "lemouf-step-flow-meta", text: `cache ${cacheKey}` }),
        );
        card.addEventListener("click", () => {
          selectedSong2DawStepIndex = i;
          renderSong2DawStepViews(runData);
        });
        card.addEventListener("dblclick", () => {
          selectedSong2DawStepIndex = i;
          renderSong2DawStepViews(runData);
          openSong2DawStepDetailScreen();
          setSong2DawStatus(`Detail view: step ${i + 1}/${summarySteps.length}`);
        });
        flow.appendChild(card);
        if (i < summarySteps.length - 1) {
          flow.appendChild(el("div", { class: "lemouf-step-flow-arrow", text: "↓" }));
        }
      }
      song2dawOverview.appendChild(flow);
      const selectedCard = flow.querySelector(".lemouf-step-flow-card.is-selected");
      if (selectedCard) selectedCard.scrollIntoView({ block: "nearest" });

      const step = summarySteps[selectedSong2DawStepIndex] || {};
      const rawStep = rawSteps[selectedSong2DawStepIndex] || {};
      const outputs = Array.isArray(step?.outputs) ? step.outputs : [];
      song2dawStepTitle.textContent = "Step outputs (JSON)";

      const detailLines = [];
      detailLines.push(`cache_key: ${String(step?.cache_key || "n/a")}`);
      detailLines.push(`declared_outputs: ${compactList(outputs, 10)}`);
      if (rawStep && typeof rawStep === "object") {
        if (Number.isFinite(rawStep.index)) detailLines.push(`index: ${rawStep.index}`);
        detailLines.push("");
        detailLines.push("outputs_json:");
        detailLines.push(compactJson(rawStep.outputs ?? {}, 1800));
      }
      song2dawStepDetail.textContent = detailLines.join("\n");
      updateSong2DawDetailHeader();
      scheduleSong2DawDetailBalance();
    };

    const refreshSong2DawRuns = async ({ silent = false, selectRunId = null, autoLoad = false } = {}) => {
      const data = await apiGet("/lemouf/song2daw/runs");
      const runs = Array.isArray(data?.runs) ? data.runs.slice() : [];
      song2dawRuns = runs;
      renderSong2DawRunOptions();
      if (selectRunId && runs.some((run) => String(run?.run_id || "") === selectRunId)) {
        song2dawSelect.value = selectRunId;
      }
      if (!silent) {
        setSong2DawStatus(runs.length ? `Loaded ${runs.length} run(s).` : "No song2daw runs yet.");
      }
      if (runs.length && !selectRunId) {
        song2dawSelect.value = String(runs[0]?.run_id || "");
      }
      updateSong2DawOpenButton();
      if (autoLoad && runs.length) {
        await loadSong2DawRunDetail(String(song2dawSelect.value || ""));
      }
      if (!runs.length) {
        clearSong2DawStepViews();
        song2dawDetail.textContent = "";
        currentSong2DawRun = null;
      }
    };

    const loadSong2DawRunDetail = async (runIdOverride = "") => {
      const override =
        typeof runIdOverride === "string" || typeof runIdOverride === "number"
          ? String(runIdOverride)
          : "";
      const runId = String(override || song2dawSelect.value || "");
      if (!runId) {
        setSong2DawStatus("Select a run first.");
        return;
      }
      song2dawSelect.value = runId;
      setSong2DawStatus("Loading song2daw step view...");
      const data = await apiGet(`/lemouf/song2daw/runs/${runId}`);
      if (!data) {
        setSong2DawStatus(lastApiError || "Failed to load run detail.");
        return;
      }
      const uiViewPayload = await apiGet(`/lemouf/song2daw/runs/${runId}/ui_view`);
      if (uiViewPayload?.ui_view && typeof uiViewPayload.ui_view === "object") {
        data.ui_view = uiViewPayload.ui_view;
        data.ui_view_valid = Boolean(uiViewPayload.valid);
      }
      const previousRunId = String(currentSong2DawRun?.run_id || "");
      if (previousRunId !== runId) selectedSong2DawStepIndex = 0;
      currentSong2DawRun = data;
      updateSong2DawOpenButton();
      renderSong2DawAudioPreview(data);
      renderSong2DawStepViews(data);
      renderSong2DawStudio(data);
      const lines = [];
      lines.push(`run ${shortId(data.run_id || "")}  ·  ${data.status || "unknown"}`);
      lines.push(`audio: ${data.audio_path || ""}`);
      lines.push(`stems: ${data.stems_dir || ""}`);
      if (data.run_dir) lines.push(`dir: ${data.run_dir}`);
      if (data.error) lines.push(`error: ${data.error}`);
      lines.push("");
      lines.push("steps:");
      const steps = Array.isArray(data?.summary?.steps) ? data.summary.steps : [];
      if (!steps.length) {
        lines.push("  (none)");
      } else {
        for (let i = 0; i < steps.length; i += 1) {
          const step = steps[i];
          const name = step?.name || "unknown";
          const version = step?.version || "";
          const cacheKey = step?.cache_key ? shortId(step.cache_key) : "n/a";
          const outputs = compactList(step?.outputs, 4);
          lines.push(`  ${i + 1}. ${name} v${version} · ${cacheKey}`);
          lines.push(`     -> ${outputs}`);
        }
      }
      const artifactKeys = Array.isArray(data?.summary?.artifact_keys) ? data.summary.artifact_keys : [];
      lines.push("");
      lines.push(`artifacts (${artifactKeys.length}): ${compactList(artifactKeys, 6)}`);
      const audioAssets = data?.audio_assets && typeof data.audio_assets === "object" ? data.audio_assets : {};
      const audioAssetKeys = Object.keys(audioAssets).filter((key) => String(audioAssets[key] || "").trim());
      lines.push(`audio_assets (${audioAssetKeys.length}): ${audioAssetKeys.length ? audioAssetKeys.join(", ") : "(none)"}`);
      if (data.ui_view) {
        lines.push(`ui_view: ${data.ui_view_valid ? "valid" : "invalid"}`);
      }
      song2dawDetail.textContent = lines.join("\n");
      scheduleSong2DawDetailBalance();
      setSong2DawStatus(`Step view loaded: ${shortId(runId)}`);
    };

    const clearSong2DawRuns = async () => {
      setSong2DawStatus("Clearing song2daw runs...");
      const res = await apiPost("/lemouf/song2daw/runs/clear", {});
      if (!res?.ok) {
        setSong2DawStatus(lastApiError || "Failed to clear runs.");
        return;
      }
      song2dawRuns = [];
      renderSong2DawRunOptions();
      clearSong2DawStepViews();
      setSong2DawStatus("Runs cleared.");
    };

    const openSong2DawRunDir = async () => {
      const runId = selectedSong2DawRunId();
      if (!runId) {
        setSong2DawStatus("Select a run first.");
        return;
      }
      setSong2DawStatus("Opening run_dir...");
      const res = await apiPost("/lemouf/song2daw/runs/open", { run_id: runId });
      if (!res?.ok) {
        setSong2DawStatus(lastApiError || "Failed to open run_dir.");
        return;
      }
      setSong2DawStatus(`Opened: ${shortId(runId)}`);
    };

    const useCurrentWorkflow = async () => {
      setWorkflowDiagnosticsVisible(true);
      setPipelineStatus("Evaluating current workflow...");
      const validation = await runValidation(true);
      if (!validation) {
        setPipelineStatus("Current workflow not readable.");
        return;
      }
      setPipelineStatus(validation.ok ? "Current workflow ready." : "Current workflow has issues.");
    };

    const queueCurrentWorkflow = async () => {
      const payload = await getCurrentPromptPayload();
      const prompt =
        payload?.output ??
        payload?.prompt ??
        (payload && typeof payload === "object" ? payload : null);
      if (!prompt || typeof prompt !== "object" || !Object.keys(prompt).length) {
        setPipelineStatus("No loaded workflow to run.");
        return false;
      }
      const workflow = payload?.workflow && typeof payload.workflow === "object" ? payload.workflow : null;
      const body = {
        prompt,
        client_id: api.clientId,
      };
      if (workflow) {
        body.extra_data = { extra_pnginfo: { workflow } };
      }
      setPipelineStatus("Queueing loaded workflow...");
      const res = await api.fetchApi("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payloadErr = await safeJson(res);
        const detail = formatErrorDetail(
          payloadErr?.error ?? payloadErr?.message ?? payloadErr,
          `HTTP ${res.status}`
        );
        setPipelineStatus(`Run failed: ${detail}`);
        return false;
      }
      const queued = await safeJson(res);
      const promptId = String(queued?.prompt_id || "");
      progressState = {
        promptId: promptId || null,
        value: 0,
        max: 0,
        node: "",
        status: "queued",
        loopPercent: null,
      };
      updateProgressUI();
      setPipelineStatus(promptId ? `Workflow queued: ${shortId(promptId)}` : "Workflow queued.");
      return true;
    };

    const loadSelectedPipeline = async ({ silent = false } = {}) => {
      const selectedName = String(pipelineSelect.value || "");
      if (!selectedName) {
        if (!silent) setPipelineStatus("Select a workflow first.");
        return false;
      }
      if (currentWorkflowName !== selectedName || workflowDirty) {
        if (!silent) setPipelineStatus("Loading selected workflow...");
        const loaded = await loadWorkflowByName(selectedName, { silent: true });
        if (!loaded) {
          if (!silent) setPipelineStatus(lastApiError || "Failed to load selected workflow.");
          return false;
        }
      }
      await runValidation(true);
      const selectedRawProfile = pipelineWorkflowProfiles && typeof pipelineWorkflowProfiles === "object"
        ? pipelineWorkflowProfiles[selectedName]
        : null;
      const selectedProfile = finalizeWorkflowProfile(selectedRawProfile, "catalog");
      if (!silent) {
        if (selectedProfile.adapter_id === "generic_loop" && pipelineState.steps.length) {
          setPipelineStatus("Pipeline loaded. Ready to run.");
        } else {
          setPipelineStatus("Workflow loaded.");
        }
      }
      return true;
    };

    const runLoadedWorkflow = async () => {
      const ready = await loadSelectedPipeline({ silent: false });
      if (!ready) return;
      const selectedName = String(pipelineSelect.value || "");
      const selectedRawProfile = pipelineWorkflowProfiles && typeof pipelineWorkflowProfiles === "object"
        ? pipelineWorkflowProfiles[selectedName]
        : null;
      const selectedProfile = finalizeWorkflowProfile(selectedRawProfile, "catalog");
      if (selectedProfile.adapter_id === "generic_loop") {
        setPipelineStatus("Running pipeline orchestration...");
        await validateAndStart();
        return;
      }
      setWorkflowDiagnosticsVisible(true);
      await queueCurrentWorkflow();
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
      const loadedProfile = resolveWorkflowProfile({
        workflow: res.workflow,
        workflowProfile: res.workflow_profile,
      });
      applyWorkflowProfile(loadedProfile, { sourceHint: loadedProfile.source || "workflow_load" });
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
      onSelect: selectPipelineStep,
      getActiveStepId: () => pipelineActiveStepId,
      getSelectedStepId: () => pipelineSelectedStepId,
      getRunState: () => pipelineState.lastRun,
    });
    const pipelineCompactActions = el("div", { class: "lemouf-loop-row tight" }, [pipelineRunBtn]);
    pipelineNav.append(pipelineCompactActions, pipelineGraphView.root, pipelineGraphView.status);

    const validatePipelineSteps = async (steps) => {
      if (!steps || steps.length === 0) return false;
      const executeStep = steps.find((s) => s.role === "execute");
      if (!executeStep) return false;
      for (const step of steps) {
        const role = String(step?.role || "").toLowerCase();
        const workflow = String(step?.workflow || "");
        if (role === "composition") continue;
        if (!workflow || workflow === "(none)") return false;
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
      persistPipelineRuntimeState();
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
      const list = Array.isArray(steps) ? steps : [];
      if (!list.length) {
        pipelineSelectedStepId = null;
      } else if (!list.some((step) => step && step.id === pipelineSelectedStepId)) {
        pipelineSelectedStepId = list[0]?.id ?? null;
      }
      await pipelineGraphView.render(list);
      updatePayloadSection();
      persistPipelineRuntimeState();
    };

    async function selectPipelineStep(step) {
      if (!step || !step.id) return;
      const list = Array.isArray(pipelineState.steps) && pipelineState.steps.length ? pipelineState.steps : [step];
      if (!list.some((entry) => entry && entry.id === step.id)) return;
      pipelineSelectedStepId = step.id;
      await renderPipelineGraph(list);
    }

    async function stepPipelineSelectionBy(delta) {
      const steps = Array.isArray(pipelineState.steps) ? pipelineState.steps : [];
      if (!steps.length) return;
      let index = steps.findIndex((entry) => entry && entry.id === pipelineSelectedStepId);
      if (index < 0) index = 0;
      const next = Math.max(0, Math.min(steps.length - 1, index + delta));
      if (next === index && steps[index]?.id === pipelineSelectedStepId) return;
      pipelineSelectedStepId = steps[next]?.id ?? pipelineSelectedStepId;
      await renderPipelineGraph(steps);
    }

    async function openSelectedPipelineStep() {
      const steps = Array.isArray(pipelineState.steps) ? pipelineState.steps : [];
      if (!steps.length) return;
      const selected =
        steps.find((entry) => entry && entry.id === pipelineSelectedStepId) ||
        steps[0];
      if (!selected) return;
      await navigateToPipelineStep(selected);
    }

    async function navigateToPipelineStep(step) {
      if (!step) return;
      const role = String(step?.role || "").toLowerCase();
      if (role === "composition") {
        pipelineSelectedStepId = step.id;
        if (pipelineState.lastRun) {
          const current = pipelineState.lastRun.steps?.[step.id] || {};
          if (current.status !== "done") {
            updatePipelineStep(step.id, "running", { startedAt: current.startedAt || Date.now() });
            pipelineActiveStepId = step.id;
          } else {
            pipelineActiveStepId = null;
          }
        }
        await renderPipelineGraph(pipelineState.steps.length ? pipelineState.steps : [step]);
        await openLoopEditPanel();
        setStatus("Composition studio opened.");
        return;
      }
      if (!step.workflow || step.workflow === "(none)") return;
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
      applyPipelineWorkflowSelection(pipelineSelect.value, { userInitiated: true });
    });
    workflowUseCurrentBtn.addEventListener("click", useCurrentWorkflow);
    pipelineRefreshBtn.addEventListener("click", () => refreshPipelineList());
    pipelineLoadBtn.addEventListener("click", () => loadSelectedPipeline({ silent: false }));
    pipelineRunBtn.addEventListener("click", runLoadedWorkflow);
    song2dawRefreshBtn.addEventListener("click", () => refreshSong2DawRuns());
    song2dawClearBtn.addEventListener("click", clearSong2DawRuns);
    song2dawLoadBtn.addEventListener("click", () => loadSong2DawRunDetail());
    song2dawOpenDirBtn.addEventListener("click", openSong2DawRunDir);
    song2dawStudioTimelineBtn.addEventListener("click", () => setSong2DawStudioMode("timeline"));
    song2dawStudioTracksBtn.addEventListener("click", () => setSong2DawStudioMode("tracks"));
    song2dawStudioSpectrumBtn.addEventListener("click", () => setSong2DawStudioMode("spectrum3d"));
    song2dawSelect.addEventListener("change", async () => {
      currentSong2DawRun = null;
      selectedSong2DawStepIndex = 0;
      ensureSong2DawHomeScreen();
      clearSong2DawStepViews();
      updateSong2DawOpenButton();
      await loadSong2DawRunDetail(selectedSong2DawRunId());
    });
    clearSong2DawStudio();
    ensureSong2DawHomeScreen();

    const song2DawDockViewportMaxHeight = () => {
      const viewportHeight = Math.max(
        320,
        Number(window.innerHeight || document.documentElement?.clientHeight || 720)
      );
      return Math.max(SONG2DAW_DOCK_MIN_HEIGHT, viewportHeight - 28);
    };

    const clampSong2DawDockHeight = (height) =>
      Math.max(
        SONG2DAW_DOCK_MIN_HEIGHT,
        Math.min(
          Math.min(SONG2DAW_DOCK_MAX_HEIGHT, song2DawDockViewportMaxHeight()),
          Math.round(height)
        )
      );

    const effectiveSong2DawDockHeight = () => {
      if (!song2dawDockVisible) return 0;
      if (song2dawDockExpanded) return song2DawDockViewportMaxHeight();
      return clampSong2DawDockHeight(currentSong2DawDockHeight);
    };

    const updateSong2DawDockToggle = () => {
      if (song2dawDockHeaderToggleBtn) {
        song2dawDockHeaderToggleBtn.textContent = song2dawDockVisible ? "Hide" : "Show";
        song2dawDockHeaderToggleBtn.classList.toggle("is-active", song2dawDockVisible);
      }
      if (song2dawDockToggleBtn) {
        song2dawDockToggleBtn.textContent = song2dawDockVisible ? "Hide studio" : "Show studio";
        song2dawDockToggleBtn.classList.toggle("is-active", song2dawDockVisible);
      }
      const expandText = song2dawDockExpanded ? "Restore studio" : "Max studio";
      if (song2dawDockExpandBtn) {
        song2dawDockExpandBtn.textContent = expandText;
        song2dawDockExpandBtn.classList.toggle("is-active", song2dawDockExpanded);
      }
      if (song2dawDockHeaderExpandBtn) {
        song2dawDockHeaderExpandBtn.textContent = song2dawDockExpanded ? "Restore" : "Max";
        song2dawDockHeaderExpandBtn.classList.toggle("is-active", song2dawDockExpanded);
      }
    };

    const applyWorkspaceLayout = () => {
      const dockHeight = effectiveSong2DawDockHeight();
      const rightInset = panelVisible ? currentGutter : 0;
      if (panelVisible) {
        document.documentElement.style.setProperty("--lemouf-gutter", `${rightInset}px`);
        if (panel) {
          panel.style.width = "var(--lemouf-gutter)";
          panel.style.top = "";
        }
      } else {
        document.documentElement.style.removeProperty("--lemouf-gutter");
        if (panel) {
          panel.style.width = "";
          panel.style.top = "";
        }
      }

      if (song2dawDock) {
        song2dawDock.style.right = `${rightInset}px`;
        song2dawDock.style.height = `${dockHeight}px`;
        song2dawDock.style.display = song2dawDockVisible ? "" : "none";
      }

      const root = getGutterRoot();
      if (root) {
        root.style.boxSizing = "border-box";
        root.style.width = panelVisible ? `calc(100% - ${rightInset}px)` : "";
        root.style.maxWidth = panelVisible ? `calc(100% - ${rightInset}px)` : "";
        root.style.paddingRight = panelVisible ? "0px" : "";
        root.style.marginRight = panelVisible ? "0px" : "";
        root.style.paddingBottom = song2dawDockVisible ? `${dockHeight}px` : "0px";
        root.style.transition = "width 120ms ease, padding-bottom 120ms ease";
      }
      try {
        const comfyApp = getComfyApp();
        comfyApp?.canvas?.resize?.();
        comfyApp?.graph?.setDirtyCanvas?.(true, true);
      } catch {}
    };

    const applyGutterWidth = (width) => {
      currentGutter = Math.max(300, Math.min(720, Math.round(width)));
      applyWorkspaceLayout();
      return currentGutter;
    };

    const clearGutter = () => {
      applyWorkspaceLayout();
    };

    const setSong2DawDockVisible = (value, { persist = true, userIntent = true } = {}) => {
      song2dawDockVisible = Boolean(value);
      if (userIntent) {
        song2dawDockUserVisible = song2dawDockVisible;
      }
      if (!song2dawDockVisible && song2dawDockExpanded) {
        song2dawDockExpanded = false;
        localStorage.setItem("lemoufSong2DawDockExpanded", "0");
      }
      if (persist) {
        localStorage.setItem("lemoufSong2DawDockVisible", song2dawDockVisible ? "1" : "0");
      }
      updateSong2DawDockToggle();
      applyWorkspaceLayout();
    };

    const setSong2DawDockExpanded = (value) => {
      const next = Boolean(value);
      if (song2dawDockExpanded === next) return;
      if (next) {
        song2dawDockRestoreHeight = clampSong2DawDockHeight(currentSong2DawDockHeight);
      } else {
        currentSong2DawDockHeight = clampSong2DawDockHeight(song2dawDockRestoreHeight);
      }
      song2dawDockExpanded = next;
      localStorage.setItem("lemoufSong2DawDockExpanded", song2dawDockExpanded ? "1" : "0");
      updateSong2DawDockToggle();
      applyWorkspaceLayout();
      if (dockContentMode === "song2daw" && currentSong2DawRun) {
        renderSong2DawStudio(currentSong2DawRun);
      }
      if (dockContentMode === "loop_composition" && currentLoopDetail) {
        renderLoopCompositionStudio(currentLoopDetail);
      }
    };

    const applyWorkflowProfile = (profile, { sourceHint = "" } = {}) => {
      const fallbackSource = sourceHint || profile?.source || "fallback_generic";
      const effective = finalizeWorkflowProfile(profile, fallbackSource);
      currentWorkflowProfile = effective;
      setWorkflowProfileStatus(effective);
      updateHeaderMenuForContext();
      syncPipelineNavVisibility();
      const wantsSong2DawUI = effective.adapter_id === "song2daw" && effective.compatible;
      const wantsLoopCompositionUI =
        effective.adapter_id === "generic_loop" && effective.compatible && loopCompositionRequested;
      const wantsAnyDockUI = wantsSong2DawUI || wantsLoopCompositionUI;
      if (song2dawBlock) {
        song2dawBlock.style.display = wantsSong2DawUI ? "" : "none";
      }
      if (effective.adapter_id !== "generic_loop") {
        loopCompositionRequested = false;
        clearLoopCompositionStudio();
      }
      if (wantsSong2DawUI) setDockContentMode("song2daw");
      else if (wantsLoopCompositionUI) setDockContentMode("loop_composition");
      if (!wantsSong2DawUI) {
        ensureSong2DawHomeScreen();
      }
      const nextDockVisible = wantsAnyDockUI ? song2dawDockUserVisible : false;
      if (song2dawDockVisible !== nextDockVisible) {
        setSong2DawDockVisible(nextDockVisible, { persist: false, userIntent: false });
      }
      if (wantsSong2DawUI && currentSong2DawRun) {
        renderSong2DawStudio(currentSong2DawRun);
      }
      if (wantsLoopCompositionUI && currentLoopDetail) {
        renderLoopCompositionStudio(currentLoopDetail);
      }
      return effective;
    };

    const setSong2DawDockHeight = (height) => {
      if (song2dawDockExpanded) {
        song2dawDockExpanded = false;
        localStorage.setItem("lemoufSong2DawDockExpanded", "0");
      }
      currentSong2DawDockHeight = clampSong2DawDockHeight(height);
      song2dawDockRestoreHeight = currentSong2DawDockHeight;
      updateSong2DawDockToggle();
      applyWorkspaceLayout();
      return currentSong2DawDockHeight;
    };

    const toggleSong2DawDockExpanded = () => {
      if (!song2dawDockVisible) {
        setSong2DawDockVisible(true);
      }
      setSong2DawDockExpanded(!song2dawDockExpanded);
    };

    const updateToggleUI = () => {
      if (!menuToggleItem) return;
      const nextText = panelVisible ? "Hide leMouf Loop panel" : "Show leMouf Loop panel";
      if (menuToggleItem.textContent !== nextText) {
        menuToggleItem.textContent = nextText;
      }
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

    const refreshLoops = async (selectLoopId = null, { autoSelect = true } = {}) => {
      setStatus("Refreshing loops...");
      const data = await apiGet("/lemouf/loop/list");
      const loops = data?.loops || [];
      if (loops.length > 0) {
        if (!autoSelect) {
          setCurrentLoopId("");
          setStatus("Loops refreshed.");
          return;
        }
        const hasLoop = (loopId) => {
          const id = String(loopId || "");
          return Boolean(id) && loops.some((entry) => String(entry?.loop_id || "") === id);
        };
        const explicit = String(selectLoopId || "");
        const currentKnown = String(currentLoopId || "");
        const persisted = String(localStorage.getItem(LOOP_ID_KEY) || "");
        const byRecency = loops
          .slice()
          .sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0));
        const runningLoop = byRecency.find((entry) => {
          const status = String(entry?.status || "").toLowerCase();
          return status === "running" || status === "queued";
        });
        const desired =
          (hasLoop(explicit) ? explicit : "") ||
          (hasLoop(currentKnown) ? currentKnown : "") ||
          (hasLoop(persisted) ? persisted : "") ||
          String(runningLoop?.loop_id || byRecency[0]?.loop_id || loops[0]?.loop_id || "");
        setCurrentLoopId(desired);
        await refreshLoopDetail();
      } else {
        setCurrentLoopId("");
      }
      setStatus(loops.length ? "Loops refreshed." : "No loops found.");
    };

    const refreshLoopDetail = async ({ quiet = false } = {}) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      if (!quiet) setStatus("Loading loop detail...");
      const data = await apiGet(`/lemouf/loop/${loopId}`);
      if (!data) return;
      currentLoopDetail = data;
      const hadPipelineSteps = Array.isArray(pipelineState.steps) && pipelineState.steps.length > 0;
      await ensurePipelineRuntimeState(data);
      if (!hadPipelineSteps && pipelineState.steps.length) {
        await renderPipelineGraph(pipelineState.steps);
      }
      const runtimeStatusRaw = String(data.status || loopRuntimeStatus || "idle").toLowerCase();
      statusBadge.textContent = runtimeStatusRaw;
      setManifestRunButtonVisibility(runtimeStatusRaw);
      const total = Number(data.total_cycles || 0);
      const current = Number(data.current_cycle || 0);
      const displayCycle = total ? Math.min(current + 1, total) : current + 1;
      cycleBadge.textContent = total ? `cycle ${displayCycle}/${total}` : `cycle ${displayCycle}`;
      progressState.loopPercent = total ? Math.min(100, Math.round((current / total) * 100)) : null;
      const retry = Number(data.current_retry || 0);
      retryBadge.textContent = `r${retry}`;
      cyclesInput.value = total || 1;
      if (runtimeStatusRaw === "running" && !String(progressState.node || "").trim()) {
        progressState.node = "Running…";
      }
      overridesBox.value = JSON.stringify(data.overrides || {}, null, 2);
      updateManifestGridLayout();
      const shouldStickToBottom = manifestStickToBottom || manifestNearBottom();
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
      const detailIsComplete = String(data.status || "").toLowerCase() === "complete";
      if (!detailIsComplete) {
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
      } else {
        previewImg.style.display = "none";
        previewEmpty.style.display = "none";
        previewWrap.classList.remove("is-loading");
      }
      if (!manifest.length) {
        lastManifestCycleIndices = [];
        lastManifestCycleEntries = new Map();
        selectedManifestCycleIndex = null;
        pendingRetryCandidate = null;
        manifestBox.textContent = "No cycles yet.";
      } else {
        const grouped = new Map();
        for (const entry of manifest) {
          const key = Number(entry.cycle_index ?? 0);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(entry);
        }
        const orderedCycles = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
        const inferredCurrentCycle = findFirstIncompleteCycleIndex(data);
        const backendCurrentCycle = Number(current);
        const hasBackendCurrentCycle =
          Number.isFinite(backendCurrentCycle) && backendCurrentCycle >= 0;
        const hasInferredCurrentCycle =
          Number.isFinite(Number(inferredCurrentCycle)) && Number(inferredCurrentCycle) >= 0;
        let effectiveCurrentCycle = hasBackendCurrentCycle ? Math.round(backendCurrentCycle) : 0;
        if (!hasBackendCurrentCycle && hasInferredCurrentCycle) {
          effectiveCurrentCycle = Math.round(Number(inferredCurrentCycle));
        } else if (hasBackendCurrentCycle && hasInferredCurrentCycle) {
          const inferred = Math.round(Number(inferredCurrentCycle));
          // Prevent fallback snaps to cycle 1/first cycle on reload when backend
          // already points to a later incomplete cycle.
          if (effectiveCurrentCycle <= 0 && inferred > 0) {
            effectiveCurrentCycle = inferred;
          }
        }
        const totalCyclesDeclared = Math.max(0, Number(data.total_cycles || 0));
        const displayCycleFromEffective = totalCyclesDeclared
          ? Math.min(Number(effectiveCurrentCycle) + 1, totalCyclesDeclared)
          : Number(effectiveCurrentCycle) + 1;
        cycleBadge.textContent = totalCyclesDeclared
          ? `cycle ${displayCycleFromEffective}/${totalCyclesDeclared}`
          : `cycle ${displayCycleFromEffective}`;
        progressState.loopPercent = totalCyclesDeclared
          ? Math.min(100, Math.round((Number(effectiveCurrentCycle) / totalCyclesDeclared) * 100))
          : null;
        if (runtimeStatusRaw === "complete") {
          progressState.loopPercent = 100;
        }
        lastManifestCycleIndices = orderedCycles.map(([idx]) => idx);
        lastManifestCycleEntries = new Map(orderedCycles.map(([idx, entries]) => [idx, entries]));
        if (!lastManifestCycleIndices.length) {
          selectedManifestCycleIndex = null;
          pendingRetryCandidate = null;
        } else if (!hasFiniteCycleIndex(selectedManifestCycleIndex)) {
          selectedManifestCycleIndex = Number.isFinite(Number(effectiveCurrentCycle))
            ? Number(effectiveCurrentCycle)
            : lastManifestCycleIndices[0];
          pendingRetryCandidate = null;
        } else if (
          !lastManifestCycleEntries.has(Number(normalizeCycleIndex(selectedManifestCycleIndex))) &&
          Number.isFinite(Number(effectiveCurrentCycle))
        ) {
          // Keep logical focus on the next incomplete cycle even if it has no entries yet.
          selectedManifestCycleIndex = Number(effectiveCurrentCycle);
          pendingRetryCandidate = null;
        }
        if (
          pendingRetryCandidate &&
          (!lastManifestCycleEntries.has(Number(pendingRetryCandidate.cycleIndex)) ||
            Number(pendingRetryCandidate.cycleIndex) !== Number(normalizeCycleIndex(selectedManifestCycleIndex)))
        ) {
          pendingRetryCandidate = null;
        }
        const runtimeState = String(runtimeStatusRaw || "").toLowerCase();
        const nowMs = Date.now();
        let progressStateValue = String(progressState?.status || "").toLowerCase();
        if (pendingLoopLaunch && nowMs > Number(pendingLoopLaunch.expiresAt || 0)) {
          pendingLoopLaunch = null;
        }
        const manifestHasQueuedOrRunning = orderedCycles.some(([, entries]) =>
          entries.some((entry) => {
            const status = String(entry?.status || "").toLowerCase();
            return status === "queued" || status === "running";
          })
        );
        let pendingLaunchActive = false;
        if (pendingLoopLaunch) {
          const hasPrompt = Boolean(String(pendingLoopLaunch.promptId || "").trim());
          const launchCycle = Number(pendingLoopLaunch.cycleIndex);
          const launchRetry = Number(pendingLoopLaunch.retryIndex);
          const launchEntry = manifest.find((entry) => {
            if (hasPrompt && String(entry?.prompt_id || "") === String(pendingLoopLaunch.promptId || "")) {
              return true;
            }
            if (Number.isFinite(launchCycle) && Number.isFinite(launchRetry)) {
              return Number(entry?.cycle_index) === launchCycle && Number(entry?.retry_index) === launchRetry;
            }
            return false;
          });
          if (!launchEntry) {
            pendingLaunchActive = true;
          } else {
            const launchStatus = String(launchEntry?.status || "").toLowerCase();
            if (launchStatus === "queued" || launchStatus === "running") {
              pendingLaunchActive = true;
            } else {
              pendingLoopLaunch = null;
            }
          }
          if ((runtimeState === "error" || runtimeState === "failed" || runtimeState === "complete") && !manifestHasQueuedOrRunning) {
            pendingLoopLaunch = null;
            pendingLaunchActive = false;
          }
        }
        const uiRuntimeState = resolveLoopUiRuntimeState({
          runtimeState,
          progressStatus: progressStateValue,
          manifestHasPending: manifestHasQueuedOrRunning,
        });
        loopRuntimeStatus = uiRuntimeState;
        statusBadge.textContent = uiRuntimeState;
        setManifestRunButtonVisibility(uiRuntimeState);
        syncProgressStateFromLoopRuntime(uiRuntimeState);
        updateProgressUI();
        progressStateValue = String(progressState?.status || "").toLowerCase();
        const runtimeIsRunning = uiRuntimeState === "running";
        const runtimeIsQueued = uiRuntimeState === "queued";
        const runtimeIsComplete = uiRuntimeState === "complete";
        const runtimeAllowsSelectionCurrent =
          uiRuntimeState === "idle" || uiRuntimeState === "error";
        const progressIsQueued = progressStateValue === "queued";
        const runBusyConcrete = runtimeIsQueued || progressIsQueued || manifestHasQueuedOrRunning || pendingLaunchActive;
        if (runBusyConcrete) {
          manifestBusyGuardUntil = nowMs + MANIFEST_BUSY_GUARD_MS;
        }
        if (runtimeIsComplete) {
          // Completed loop: exit selection/replay mode and switch to post-loop UX.
          selectedManifestCycleIndex = null;
          pendingRetryCandidate = null;
        }
        const suppressRetrySkeleton = runBusyConcrete || nowMs < manifestBusyGuardUntil;
        const armedCycleIndex = pendingRetryCandidate
          ? Number(pendingRetryCandidate.cycleIndex)
          : NaN;
        const hasArmedOtherCycle =
          Number.isFinite(armedCycleIndex) &&
          Number.isFinite(Number(effectiveCurrentCycle)) &&
          armedCycleIndex !== Number(effectiveCurrentCycle);
        const hasValidSelection =
          hasFiniteCycleIndex(selectedManifestCycleIndex) &&
          (
            lastManifestCycleEntries.has(Number(normalizeCycleIndex(selectedManifestCycleIndex))) ||
            (totalCyclesDeclared > 0 &&
              Number(normalizeCycleIndex(selectedManifestCycleIndex)) >= 0 &&
              Number(normalizeCycleIndex(selectedManifestCycleIndex)) < totalCyclesDeclared)
          );
        if (
          runtimeIsRunning &&
          !pendingRetryCandidate &&
          !hasValidSelection &&
          lastManifestCycleEntries.has(Number(effectiveCurrentCycle))
        ) {
          selectedManifestCycleIndex = Number(effectiveCurrentCycle);
        }
        const totalCycles = Number(data.total_cycles || 0);
        let hasReplayOpportunity = false;
        for (const [cycleIndex, entries] of orderedCycles) {
          entries.sort((a, b) => Number(a.retry_index ?? 0) - Number(b.retry_index ?? 0));
          const cycleRow = el("div", { class: "lemouf-loop-cycle" });
          const cycleCurrent = Number(effectiveCurrentCycle || 0);
          const cycleHasFailure = entries.some(entryIsFailed);
          const cycleHasApproved = entries.some(entryIsApproved);
          const cycleHasActionableEntry = entries.some(entryIsActionable);
          const cycleHasQueuedOrRunning = entries.some((entry) => {
            const status = String(entry?.status || "").toLowerCase();
            return status === "queued" || status === "running";
          });
          const isDone = runtimeIsComplete || cycleIndex < cycleCurrent || cycleHasApproved;
          const selectedCycle = normalizeCycleIndex(selectedManifestCycleIndex);
          const isSelectedCycle = selectedCycle !== null && selectedCycle === Number(cycleIndex);
          const isRuntimeCurrent = cycleIndex === cycleCurrent && !runtimeIsComplete;
          const isCurrent = isRuntimeCurrent && !hasArmedOtherCycle && !cycleHasApproved;
          const selectedActsAsCurrent =
            isSelectedCycle && runtimeAllowsSelectionCurrent && !isDone && !cycleHasApproved;
          const isWaiting = isRuntimeCurrent && hasArmedOtherCycle;
          const cycleInProgress =
            cycleHasQueuedOrRunning ||
            ((isCurrent || selectedActsAsCurrent) && !cycleHasApproved && !isDone && !cycleHasFailure);
          const cyclePhase = cycleHasFailure
            ? "failed"
            : (cycleHasApproved || isDone ? "done" : (cycleInProgress ? "in_progress" : "upcoming"));
          const cycleApprovedRetries = new Set(
            entries
              .filter((entry) => entryIsApproved(entry))
              .map((entry) => Number(entry?.retry_index))
              .filter((value) => Number.isFinite(value))
          );
          const highlightApprovedOnly = runtimeIsComplete && cycleApprovedRetries.size > 0;
          const cycleState = isWaiting
            ? "waiting"
            : ((isCurrent || selectedActsAsCurrent) ? "current" : (isDone ? "done" : "upcoming"));
          cycleRow.classList.add(`is-${cycleState}`);
          cycleRow.classList.add(`is-phase-${cyclePhase}`);
          cycleRow.classList.toggle("is-selected", isSelectedCycle);
          const hasExplicitSelection = hasFiniteCycleIndex(selectedManifestCycleIndex);
          const isFocusCycle = hasExplicitSelection ? isSelectedCycle : (isCurrent || selectedActsAsCurrent);
          const cycleHeader = el("div", {
            class: `lemouf-loop-cycle-header is-${cycleState} is-phase-${cyclePhase}`,
          });
          const cycleHeadMain = el("div", { class: "lemouf-loop-cycle-head-main" }, [
            el("span", { class: "lemouf-loop-cycle-kicker", text: "Cycle" }),
            el("span", {
              class: "lemouf-loop-cycle-value",
              text: totalCycles ? `${cycleIndex + 1}/${totalCycles}` : `${cycleIndex + 1}`,
            }),
          ]);
          const cycleStateLabel = cyclePhase === "failed"
            ? "failed"
            : (cyclePhase === "in_progress"
              ? "in progress"
              : (cyclePhase === "done"
                ? "done"
                : (cycleState === "waiting" ? "waiting" : (cycleState === "current" ? "current" : "upcoming"))));
          const cycleStateChip = el("span", {
            class: `lemouf-loop-cycle-state ${cycleState}`,
            text: cycleStateLabel,
          });
          cycleStateChip.classList.add(cyclePhase);
          cycleHeader.append(cycleHeadMain, cycleStateChip);
          cycleHeader.classList.toggle("is-selected", isSelectedCycle);
          cycleHeader.classList.add("is-clickable");
          cycleHeader.title = "Click to prepare replay for this cycle.";
          cycleHeader.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!primeRetryCandidateForCycle(cycleIndex)) return;
            await refreshLoopDetail({ quiet: true });
          });
          cycleRow.appendChild(cycleHeader);

          const strip = el("div", { class: "lemouf-loop-cycle-strip" });
          for (const entry of entries) {
            const decision = entry.decision || entry.status || "pending";
            const decisionLabel = String(decision || "pending").toUpperCase();
            const decisionClass = badgeClassForDecision(decision);
            const images = entry.outputs?.images;
            if (Array.isArray(images) && images.length > 0) {
              for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
                const image = images[imageIndex];
                const card = el("div", { class: "lemouf-loop-result-card is-loading" });
                if (highlightApprovedOnly) {
                  const retryValue = Number(entry?.retry_index);
                  const isApprovedCard =
                    (Number.isFinite(retryValue) && cycleApprovedRetries.has(retryValue)) ||
                    decisionClass === "approve";
                  card.classList.toggle("is-off", !isApprovedCard);
                  card.classList.toggle("is-cycle-approved-focus", isApprovedCard);
                }
                const spinner = el("div", { class: "lemouf-loop-spinner" });
                const decisionBadge = el("div", {
                  class: `lemouf-loop-result-badge ${decisionClass}`,
                  text: decisionLabel,
                });
                if (decisionClass === "replay") {
                  decisionBadge.classList.add("is-clickable");
                  decisionBadge.title = "Replay this cycle";
                  decisionBadge.addEventListener("click", async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    await launchReplayForCycle(cycleIndex, null, entries);
                  });
                }
                card.appendChild(decisionBadge);
                const fullSrc = buildImageSrc(image, false);
                const thumbSrc = buildImageSrc(image, true);
                const thumb = el("img", { class: "lemouf-loop-thumb", src: thumbSrc });
                const showQuickActions =
                  decisionClass === "returned" || decisionClass === "replay" || decisionClass === "discard";
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
                  if (manifestStickToBottom) scrollManifestToBottom();
                });
                thumb.addEventListener("error", () => {
                  card.classList.remove("is-loading");
                  if (manifestStickToBottom) scrollManifestToBottom();
                });
                thumb.addEventListener("click", () => {
                  openLightbox(fullSrc, {
                    mode: "cycle",
                    cycleIndex: Number(entry?.cycle_index ?? cycleIndex),
                    retryIndex: Number(entry?.retry_index ?? 0),
                    imageIndex,
                  });
                });
                card.appendChild(thumb);
                card.appendChild(spinner);
                strip.appendChild(card);
              }
            } else {
              const card = el("div", { class: "lemouf-loop-result-card" });
              if (highlightApprovedOnly) {
                const retryValue = Number(entry?.retry_index);
                const isApprovedCard =
                  (Number.isFinite(retryValue) && cycleApprovedRetries.has(retryValue)) ||
                  decisionClass === "approve";
                card.classList.toggle("is-off", !isApprovedCard);
                card.classList.toggle("is-cycle-approved-focus", isApprovedCard);
              }
              const spinner = el("div", { class: "lemouf-loop-spinner" });
              const decisionBadge = el("div", {
                class: `lemouf-loop-result-badge ${decisionClass}`,
                text: decisionLabel,
              });
              if (decisionClass === "replay") {
                decisionBadge.classList.add("is-clickable");
                decisionBadge.title = "Replay this cycle";
                decisionBadge.addEventListener("click", async (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  await launchReplayForCycle(cycleIndex, null, entries);
                });
              }
              card.appendChild(decisionBadge);
              card.appendChild(el("div", { class: "lemouf-loop-result-placeholder", text: `r${entry.retry_index ?? 0}` }));
              if (decisionClass === "queued" || decisionClass === "running") {
                card.classList.add("is-loading");
                card.appendChild(spinner);
              }
              strip.appendChild(card);
            }
          }
          let candidate =
            !runtimeIsComplete &&
            isFocusCycle &&
            pendingRetryCandidate &&
            Number(pendingRetryCandidate.cycleIndex) === Number(cycleIndex)
              ? pendingRetryCandidate
              : null;
          const cycleRetryReady =
            !runtimeIsComplete && isFocusCycle && !isWaiting;
          const allowSkeletonForActionable =
            cycleRetryReady && cycleHasActionableEntry && !cycleHasQueuedOrRunning;
          if (!candidate && cycleRetryReady && !cycleHasQueuedOrRunning && (!suppressRetrySkeleton || allowSkeletonForActionable)) {
            candidate = {
              cycleIndex,
              retryIndex: computeNextRetryIndex(entries),
            };
          }
          if (candidate && !cycleHasQueuedOrRunning && (!suppressRetrySkeleton || allowSkeletonForActionable)) {
            hasReplayOpportunity = true;
            const retryCard = el("div", { class: "lemouf-loop-result-card lemouf-loop-result-card-retry" });
            retryCard.appendChild(
              el("div", {
                class: "lemouf-loop-result-badge replay",
                text: `REPLAY r${Number(candidate.retryIndex)}`,
              })
            );
            retryCard.appendChild(
              el("div", {
                class: "lemouf-loop-result-skeleton",
                text: "Click to replay now",
              })
            );
            const skeleton = retryCard.querySelector(".lemouf-loop-result-skeleton");
            if (skeleton) {
              skeleton.title = "Run replay now";
              skeleton.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                await launchReplayForCycle(cycleIndex, Number(candidate.retryIndex) || 0, entries);
              });
            }
            retryCard.addEventListener("click", async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              await launchReplayForCycle(cycleIndex, Number(candidate.retryIndex) || 0, entries);
            });
            strip.appendChild(retryCard);
          }
          cycleRow.appendChild(strip);
          manifestBox.appendChild(cycleRow);
        }
        if (hasReplayOpportunity && manifestRunBtn) {
          manifestRunBtn.style.display = "none";
          manifestRunBtn.disabled = true;
        }
      }
      if (shouldStickToBottom) {
        manifestStickToBottom = true;
        requestAnimationFrame(() => scrollManifestToBottom());
      }
      updateManifestGridLayout();
      if (!quiet) setStatus("Loop detail loaded.");
      if (!hasStarted) {
        const manifest = data.manifest || [];
        if (manifest.length > 0 || data.status === "running" || data.status === "complete") {
          setScreen("run");
        }
      }
      const isComplete = data.status === "complete";
      if (isComplete) {
        runScreen.setManifestCollapsible(true);
        if (!manifestAutoCollapsedForCompletion) {
          runScreen.setManifestCollapsed(true);
          manifestAutoCollapsedForCompletion = true;
        }
      } else {
        manifestAutoCollapsedForCompletion = false;
        runScreen.setManifestCollapsible(false);
        runScreen.setManifestCollapsed(false);
      }
      exportBtn.style.display = isComplete ? "" : "none";
      loopEditBtn.style.display = isComplete ? "" : "none";
      exitBtn.style.display = isComplete ? "" : "none";
      previewCompleteSection.style.display = isComplete ? "" : "none";
      previewCompleteActions.style.display = isComplete ? "" : "none";
      if (isComplete) {
        renderApprovedSummary(data);
        previewImg.style.display = "none";
        previewEmpty.style.display = "none";
        previewWrap.classList.remove("is-loading");
      } else {
        previewCompleteStats.textContent = "";
        previewCompleteBody.innerHTML = "";
      }
      actionRow.style.display = topActionRowEnabled ? (isComplete ? "none" : "") : "none";
      if (isComplete) {
        if (pipelineState.lastRun && pipelineState.steps.length) {
          const execStep = pipelineState.steps.find((s) => s.role === "execute");
          const compositionStep = pipelineState.steps.find(
            (s) => String(s?.role || "").toLowerCase() === "composition"
          );
          let compositionPending = false;
          if (execStep) {
            const execEntry = pipelineState.lastRun.steps?.[execStep.id] || {};
            updatePipelineStep(execStep.id, "done", {
              startedAt: execEntry.startedAt || Date.now(),
              endedAt: Date.now(),
            });
          }
          if (compositionStep) {
            const compositionEntry = pipelineState.lastRun.steps?.[compositionStep.id] || {};
            if (compositionEntry.status !== "done") {
              const nextStatus = compositionEntry.status === "running" ? "running" : "waiting";
              updatePipelineStep(compositionStep.id, nextStatus, {
                startedAt: compositionEntry.startedAt || Date.now(),
              });
              pipelineActiveStepId = compositionStep.id;
              pipelineSelectedStepId = compositionStep.id;
              pipelineState.lastRun.endedAt = null;
              compositionPending = true;
            } else if (!pipelineState.lastRun.endedAt) {
              pipelineState.lastRun.endedAt = Date.now();
            }
          } else if (!pipelineState.lastRun.endedAt) {
            pipelineState.lastRun.endedAt = Date.now();
          }
          if (compositionPending) {
            setStatus("Loop complete. Composition step ready.");
          } else {
            pipelineActiveStepId = null;
            setStatus("Loop complete ✅");
          }
          void renderPipelineGraph(pipelineState.steps);
        } else {
          setStatus("Loop complete ✅");
        }
      }
      if (lightboxIsOpen() && lightboxState.mode === "cycle") {
        lightboxSyncFromDetail(data, {
          preserveSelection: true,
          preferredCycle: hasFiniteCycleIndex(lightboxState.lockedCycleIndex)
            ? Number(normalizeCycleIndex(lightboxState.lockedCycleIndex))
            : null,
        });
      }
      if (dockContentMode === "loop_composition" && loopCompositionRequested) {
        renderLoopCompositionStudio(data);
      }
      persistPipelineRuntimeState();
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

    const stepCycle = async ({ cycleIndex = null, retryIndex = null, autoInject = false, forceSync = false } = {}) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      pendingRetryCandidate = null;
      setManifestRunButtonVisibility("running");
      manifestBusyGuardUntil = Date.now() + MANIFEST_BUSY_GUARD_MS;
      beginPendingLoopLaunch(cycleIndex, retryIndex);
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
      if (Number.isFinite(cycleIndex)) payload.cycle_index = cycleIndex;
      if (Number.isFinite(retryIndex)) payload.retry_index = retryIndex;
      const res = await apiPost("/lemouf/loop/step", payload);
      if (!res) {
        pendingLoopLaunch = null;
        setStatus(lastApiError || "Step failed (see console).");
        return;
      }
      lastStepPromptId = res.prompt_id || null;
      if (pendingLoopLaunch) {
        pendingLoopLaunch.promptId = lastStepPromptId || null;
      }
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

    const maybeAutoRunNextNeededCycle = async (decisionResult, detailAfterDecision = null) => {
      const nextCycleRaw = Number(decisionResult?.next_cycle_index);
      const nextRetryRaw = Number(decisionResult?.next_retry_index);
      const needsGeneration = Boolean(decisionResult?.needs_generation);
      if (!needsGeneration) return;
      let cycleIndex = Number.isFinite(nextCycleRaw) ? nextCycleRaw : Number(detailAfterDecision?.current_cycle);
      if (!Number.isFinite(cycleIndex) || cycleIndex < 0) return;
      const retryIndex = Number.isFinite(nextRetryRaw) ? nextRetryRaw : null;
      await stepCycle({
        cycleIndex,
        retryIndex,
        autoInject: true,
        forceSync: true,
      });
    };

    const launchReplayForCycle = async (cycleIndex, retryHint = null, entriesHint = []) => {
      const normalizedCycle = Math.max(0, Math.round(Number(cycleIndex) || 0));
      selectedManifestCycleIndex = normalizedCycle;
      const latestEntries = lastManifestCycleEntries.get(normalizedCycle) || entriesHint || [];
      const safeRetry = Math.max(
        computeNextRetryIndex(latestEntries),
        Number.isFinite(Number(retryHint)) ? Number(retryHint) : 0
      );
      pendingRetryCandidate = null;
      setStatus(`Launching replay for cycle ${normalizedCycle + 1} (r${safeRetry})...`);
      await stepCycle({
        cycleIndex: normalizedCycle,
        retryIndex: safeRetry,
        autoInject: true,
        forceSync: true,
      });
    };

    const moveManifestCycleSelectionBy = async (delta) => {
      if (!lastManifestCycleIndices.length) return;
      const currentSelection = normalizeCycleIndex(selectedManifestCycleIndex);
      let currentPos = lastManifestCycleIndices.findIndex((value) => value === currentSelection);
      if (currentPos < 0) currentPos = 0;
      const nextPos = Math.max(0, Math.min(lastManifestCycleIndices.length - 1, currentPos + delta));
      const nextCycle = lastManifestCycleIndices[nextPos];
      if (!Number.isFinite(nextCycle)) return;
      if (nextCycle === currentSelection) return;
      selectedManifestCycleIndex = nextCycle;
      pendingRetryCandidate = null;
      await refreshLoopDetail({ quiet: true });
      setStatus(`Cycle ${nextCycle + 1} focused.`);
    };

    const confirmOrPrimeSelectedCycleRetry = async () => {
      if (!lastManifestCycleIndices.length) return;
      const selected =
        hasFiniteCycleIndex(selectedManifestCycleIndex) &&
        lastManifestCycleEntries.has(Number(normalizeCycleIndex(selectedManifestCycleIndex)))
          ? Number(normalizeCycleIndex(selectedManifestCycleIndex))
          : lastManifestCycleIndices[0];
      selectedManifestCycleIndex = selected;
      if (
        pendingRetryCandidate &&
        Number(pendingRetryCandidate.cycleIndex) === selected &&
        Number.isFinite(Number(pendingRetryCandidate.retryIndex))
      ) {
        const entries = lastManifestCycleEntries.get(selected) || [];
        await launchReplayForCycle(selected, Number(pendingRetryCandidate.retryIndex) || 0, entries);
        return;
      }
      if (!primeRetryCandidateForCycle(selected)) return;
      await refreshLoopDetail({ quiet: true });
    };

    const pickDecisionTargetForCycle = (detail, cycleIndex) => {
      if (!Number.isFinite(Number(cycleIndex))) return null;
      const manifest = Array.isArray(detail?.manifest) ? detail.manifest : [];
      const inCycle = manifest.filter((entry) => Number(entry?.cycle_index) === Number(cycleIndex));
      if (!inCycle.length) return null;
      const actionable = inCycle.filter((entry) => {
        const status = String(entry?.status || "").toLowerCase();
        const decision = String(entry?.decision || "").toLowerCase();
        if (status !== "returned") return false;
        return decision !== "approve" && decision !== "approved" && decision !== "reject" && decision !== "discard";
      });
      const candidates = actionable.length ? actionable : inCycle;
      candidates.sort((a, b) => {
        const retryDelta = Number(b?.retry_index ?? 0) - Number(a?.retry_index ?? 0);
        if (retryDelta !== 0) return retryDelta;
        return Number(b?.updated_at ?? 0) - Number(a?.updated_at ?? 0);
      });
      const chosen = candidates[0];
      return {
        cycleIndex: Number(chosen?.cycle_index ?? cycleIndex),
        retryIndex: Number(chosen?.retry_index ?? 0),
        entryStatus: String(chosen?.status || ""),
      };
    };

    const decision = async (choice) => {
      const loopId = currentLoopId;
      if (!loopId) return;
      const detail = await apiGet(`/lemouf/loop/${loopId}`);
      if (!detail) return;
      const selectedCycle = normalizeCycleIndex(selectedManifestCycleIndex);
      let target = selectedCycle !== null
        ? pickDecisionTargetForCycle(detail, selectedCycle)
        : null;
      if (!target) {
        target = pickDecisionTargetForCycle(detail, Number(detail.current_cycle ?? 0));
      }
      if (!target) {
        target = {
          cycleIndex: Number(detail.current_cycle ?? 0),
          retryIndex: Number(detail.current_retry ?? 0),
          entryStatus: "",
        };
      }
      const cycleIndex = target.cycleIndex;
      const retryIndex = target.retryIndex;
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
      await handleDecisionPostState({
        choice,
        decisionResult: res,
        detailAfterDecision: after,
        targetCycle: target.cycleIndex,
        targetRetry: target.retryIndex,
        entryStatus: target.entryStatus,
        autoRunOnlyReturned: false,
      });
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
      await handleDecisionPostState({
        choice,
        decisionResult: res,
        detailAfterDecision: after,
        targetCycle: cycleIndex,
        targetRetry: retryIndex,
        entryStatus,
        autoRunOnlyReturned: true,
      });
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

    const openLoopEditPanel = async () => {
      if (!currentLoopId) {
        loopCompositionRequested = true;
        setDockContentMode("loop_composition");
        setSong2DawDockVisible(true, { userIntent: true });
        renderLoopCompositionStudio(buildMinimalCompositionDetail());
        setStatus("Composition studio ready.");
        return;
      }
      setStatus("Preparing composition studio...");
      let detail = currentLoopDetail;
      if (!detail) {
        detail = await refreshLoopDetail({ quiet: true });
      }
      if (!detail) {
        setStatus(lastApiError || "Unable to load loop detail for composition studio.");
        return;
      }
      const compositionState = getCompositionPipelineState();
      if (compositionState) {
        const { step, runEntry } = compositionState;
        if (runEntry.status === "waiting" || runEntry.status === "pending") {
          updatePipelineStep(step.id, "running", { startedAt: runEntry.startedAt || Date.now() });
          pipelineActiveStepId = step.id;
          pipelineSelectedStepId = step.id;
          await renderPipelineGraph(pipelineState.steps);
        }
      }
      loopCompositionRequested = true;
      setDockContentMode("loop_composition");
      setSong2DawDockVisible(true, { userIntent: true });
      renderLoopCompositionStudio(detail);
      setStatus("Composition studio ready.");
    };

    const resetToStart = async () => {
      setStatus("");
      setCompatStatus("");
      setScreen("home");
      const loopId = currentLoopId;
      if (loopId) {
        await apiPost("/lemouf/loop/reset", { loop_id: loopId, keep_workflow: true });
      }
      setCurrentLoopId("");
      retryBadge.textContent = "r0";
      cycleBadge.textContent = "cycle 0/0";
      statusBadge.textContent = "idle";
      progressState = { promptId: null, value: 0, max: 0, node: "", status: "idle", loopPercent: null };
      updateProgressUI();
      previewImg.style.display = "none";
      previewEmpty.style.display = "block";
      previewCompleteSection.style.display = "none";
      previewCompleteActions.style.display = "none";
      previewCompleteStats.textContent = "";
      previewCompleteBody.innerHTML = "";
      exportBtn.style.display = "none";
      loopEditBtn.style.display = "none";
      exitBtn.style.display = "none";
      manifestBox.innerHTML = "";
      currentLoopDetail = null;
      loopCompositionRequested = false;
      clearLoopCompositionStudio();
      setDockContentMode("song2daw");
      setSong2DawDockVisible(false, { persist: false, userIntent: false });
      loopRuntimeStatus = "idle";
      pipelinePayloadEntry = null;
      pipelineState.lastRun = null;
      pipelineActiveStepId = null;
      pipelineSelectedStepId = pipelineState.steps[0]?.id ?? null;
      if (pipelineState.steps.length) {
        await renderPipelineGraph(pipelineState.steps);
      } else {
        pipelineGraphView?.root?.replaceChildren();
        setPipelineGraphStatus("Pipeline graph will appear here once loaded.");
      }
      persistPipelineRuntimeState();
      manifestAutoCollapsedForCompletion = false;
      runScreen.setManifestCollapsible(false);
      runScreen.setManifestCollapsed(false);
      setManifestRunButtonVisibility("idle");
      await refreshLoops(null, { autoSelect: false });
      await runValidation(true);
    };

    const setupToggleControls = () => {
      const menu = findMenuContainer();
      if (!menu) return false;
      if (menuContainer !== menu) {
        menuObserver?.disconnect();
        menuContainer = menu;
        menuObserver = new MutationObserver(() => {
          if (!menuContainer) return;
          if (!menuToggleItem || !menuContainer.contains(menuToggleItem)) {
            menuToggleItem = null;
            setupToggleControls();
          }
        });
        menuObserver.observe(menuContainer, { childList: true });
      }
      if (!menuToggleItem) {
        menuToggleItem = el("button", { class: "lemouf-loop-menu-item", text: "Toggle leMouf Loop panel" });
        menuToggleItem.addEventListener("click", togglePanel);
        menu.appendChild(menuToggleItem);
      }
      updateToggleUI();
      return true;
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
        const detectedProfile = resolveWorkflowProfile({
          prompt,
          workflow: payload?.workflow,
        });
        applyWorkflowProfile(detectedProfile, { sourceHint: detectedProfile.source || "validation" });
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
          setCompatStatus(pipelineOk ? "Pipeline ready ✅" : "Pipeline incomplete or invalid.");
        } else if (pipelineState.steps.length) {
          setPipelineLoaded(true);
          await renderPipelineGraph(pipelineState.steps);
          const pipelineOk = await validatePipelineSteps(pipelineState.steps);
          setCompatStatus(pipelineOk ? "Pipeline ready ✅ (cached)" : "Pipeline incomplete or invalid.");
        } else {
          setPipelineLoaded(false);
          updateValidationUI(validation);
          pipelineGraphView?.root?.replaceChildren();
          setPipelineGraphStatus("Pipeline graph will appear here once loaded.");
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
      const compositionStep = steps.find((s) => String(s?.role || "").toLowerCase() === "composition");
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
      if (compositionStep) {
        updatePipelineStep(compositionStep.id, "pending", {});
      }
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
      const payload = await getCurrentPromptPayload();
      const prompt =
        payload?.output ??
        payload?.prompt ??
        (payload && typeof payload === "object" ? payload : null);
      const pipelineSteps = extractPipelineSteps(prompt);
      if (pipelineSteps.length) {
        const pipelineOk = await validatePipelineSteps(pipelineSteps);
        if (!pipelineOk) {
          setStatus("Pipeline incomplete or invalid.");
          return;
        }
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
            const pipelineOk2 = await validatePipelineSteps(steps2);
            if (!pipelineOk2) {
              setStatus("Pipeline incomplete or invalid.");
              return;
            }
            await runPipeline(prompt2);
            return;
          }
        }
      }
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
    const song2dawDockResizer = el("div", { class: "lemouf-song2daw-dock-resizer" });
    song2dawDockHeaderExpandBtn = el("button", { class: "lemouf-loop-btn alt", text: "Max", type: "button" });
    song2dawDockHeaderToggleBtn = el("button", { class: "lemouf-loop-btn alt", text: "Hide", type: "button" });
    const song2dawDockHeaderActions = el("div", { class: "lemouf-song2daw-dock-header-actions" }, [
      song2dawDockHeaderExpandBtn,
      song2dawDockHeaderToggleBtn,
    ]);
    song2dawDockTitle = el("div", { class: "lemouf-song2daw-dock-title", text: "Song2DAW Studio" });
    const song2dawDockHeader = el("div", { class: "lemouf-song2daw-dock-header" }, [
      song2dawDockTitle,
      song2dawDockHeaderActions,
    ]);
    const exportBtn = el("button", { class: "lemouf-loop-btn alt", text: "Export approved", onclick: exportApproved });
    const loopEditBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open editor", onclick: openLoopEditPanel });
    const exitBtn = el("button", { class: "lemouf-loop-btn alt", text: "Reset & Exit loop", onclick: resetToStart });
    manifestRunBtn = el("button", { class: "lemouf-loop-btn alt lemouf-loop-manifest-runbtn", text: "Run now" });
    headerBackBtn = el("button", { class: "lemouf-loop-header-btn", title: "Back to home", text: "←" });
    headerMenu = el("div", { class: "lemouf-loop-header-menu" });
    headerMenuHomeBtn = el("button", { class: "lemouf-loop-header-menu-btn", text: "Go to home" });
    headerMenuExitBtn = el("button", { class: "lemouf-loop-header-menu-btn", text: "Reset & Exit loop" });
    headerMenu.append(headerMenuHomeBtn, headerMenuExitBtn);
    const headerActions = el("div", { class: "lemouf-loop-header-actions" }, [headerBackBtn, headerMenu]);
    closeHeaderMenu = () => headerMenu.classList.remove("is-open");
    const toggleHeaderMenu = () => headerMenu.classList.toggle("is-open");
    headerBackBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const isSong2DawProfile = currentWorkflowProfile?.adapter_id === "song2daw";
      if (isSong2DawProfile) {
        setScreen("home");
        return;
      }
      const hasLoop = Boolean(currentLoopId);
      if (!hasLoop) {
        setScreen("home");
        return;
      }
      toggleHeaderMenu();
    });
    headerMenuHomeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeHeaderMenu();
      setScreen("home");
    });
    headerMenuExitBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeHeaderMenu();
      resetToStart();
    });
    exportBtn.style.display = "none";
    loopEditBtn.style.display = "none";
    exitBtn.style.display = "none";
    previewCompleteActions.append(exportBtn, loopEditBtn, exitBtn);
    headerBackBtn.style.display = "none";
    const actionRow = el("div", { class: "lemouf-loop-row" }, [
      el("button", { class: "lemouf-loop-btn lemouf-loop-action approve", onclick: () => decision("approve"), text: "Approve" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action reject", onclick: () => decision("reject"), text: "Reject" }),
      el("button", { class: "lemouf-loop-btn lemouf-loop-action replay", onclick: () => decision("replay"), text: "Replay" }),
    ]);
    const topActionRowEnabled = false;
    actionRow.style.display = "none";
    const runScreen = createRunScreen({
      progressWrap,
      previewWrap,
      actionRow,
      exportBtn,
      exitBtn,
      manifestRunBtn,
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
    runScreen.setManifestCollapsible(false);
    runScreen.setManifestCollapsed(false);
    runScreen.overridesApplyBtn.addEventListener("click", applyOverrides);
    runScreen.createBtn.addEventListener("click", createLoop);
    runScreen.refreshBtn.addEventListener("click", refreshLoops);
    runScreen.setCyclesBtn.addEventListener("click", setTotalCycles);
    runScreen.syncBtn.addEventListener("click", () => setCurrentWorkflow({ force: true }));
    runScreen.useCurrentBtn.addEventListener("click", setCurrentWorkflow);
    runScreen.injectBtn.addEventListener("click", injectLoopId);
    runScreen.stepBtn.addEventListener("click", stepCycle);
    manifestRunBtn.addEventListener("click", async () => {
      setManifestRunButtonVisibility("running");
      setStatus("Launching run...");
      await validateAndStart();
    });
    song2dawDetailHeaderTitle = el("div", {
      class: "lemouf-song2daw-detail-title",
      text: "No step detail",
    });
    song2dawDetailHeaderMeta = el("div", {
      class: "lemouf-song2daw-detail-meta",
      text: "Step 0/0",
    });
    song2dawDetailPrevBtn = el("button", {
      class: "lemouf-loop-btn alt",
      type: "button",
      text: "Prev step",
      disabled: true,
    });
    song2dawDetailNextBtn = el("button", {
      class: "lemouf-loop-btn alt",
      type: "button",
      text: "Next step",
      disabled: true,
    });
    song2dawDetailPrevBtn.addEventListener("click", () => stepSong2DawDetailBy(-1));
    song2dawDetailNextBtn.addEventListener("click", () => stepSong2DawDetailBy(1));
    song2dawRunSummaryPanel = el("div", { class: "lemouf-song2daw-step-panel lemouf-song2daw-detail-summary-panel" }, [
      el("div", { class: "lemouf-song2daw-step-title", text: "Run summary" }),
      song2dawDetail,
    ]);
    song2dawDetailSection = el("div", { class: "lemouf-loop-screen lemouf-song2daw-detail-screen", style: "display:none;" }, [
      (song2dawDetailLayout = el("div", { class: "lemouf-loop-field lemouf-loop-block lemouf-song2daw-detail-layout" }, [
        el("div", { class: "lemouf-song2daw-detail-head" }, [
          el("div", { class: "lemouf-song2daw-detail-head-main" }, [
            song2dawDetailHeaderTitle,
            song2dawDetailHeaderMeta,
          ]),
          el("div", { class: "lemouf-song2daw-detail-head-actions" }, [
            song2dawDetailPrevBtn,
            song2dawDetailNextBtn,
          ]),
        ]),
        song2dawStepPanel,
        song2dawRunSummaryPanel,
      ])),
    ]);
    panel = el("div", { class: "lemouf-loop-panel", id: "lemouf-loop-panel" }, [
      resizer,
      el("div", { class: "lemouf-loop-header" }, [
        el("div", { class: "lemouf-loop-title", text: "LEMOUF EXTENSION" }),
        headerActions,
      ]),
      preStartSection,
      song2dawDetailSection,
      payloadSection,
      postStartSection,
      el("div", { class: "lemouf-loop-footer", text: `LEMOUF EXTENSION · ${PANEL_VERSION}` }),
    ]);
    loopCompositionBody = el("div", {
      class: "lemouf-loop-composition-body",
      text: "Open editor to compose loop resources.",
    });
    loopCompositionPanel = el("div", {
      class: "lemouf-song2daw-step-panel lemouf-loop-composition-panel",
      style: "display:none;",
    }, [loopCompositionBody]);
    const song2dawDockContent = el("div", { class: "lemouf-song2daw-dock-content" }, [
      song2dawStudioPanel,
      loopCompositionPanel,
    ]);
    song2dawDock = el("div", { class: "lemouf-song2daw-dock", id: "lemouf-song2daw-dock" }, [
      song2dawDockResizer,
      song2dawDockHeader,
      song2dawDockContent,
    ]);
    setDockContentMode("song2daw");

    validateBtn.addEventListener("click", validateAndStart);
    setPipelineLoaded(false);
    setWorkflowDiagnosticsVisible(true);

    document.body.appendChild(panel);
    document.body.appendChild(song2dawDock);
    updateManifestGridLayout();
    if (typeof ResizeObserver !== "undefined") {
      manifestGridObserver = new ResizeObserver(() => {
        updateManifestGridLayout();
      });
      manifestGridObserver.observe(manifestBox);
    }
    document.addEventListener("click", () => {
      if (typeof closeHeaderMenu === "function") closeHeaderMenu();
    });
    setScreen(pendingScreen || "home");
    currentSong2DawDockHeight = clampSong2DawDockHeight(currentSong2DawDockHeight);
    updateSong2DawDockToggle();
    applyWorkflowProfile(currentWorkflowProfile, { sourceHint: "init" });
    applyGutterWidth(currentGutter);
    const savedVisible = localStorage.getItem("lemoufLoopPanelVisible");
    if (savedVisible === "0") {
      setPanelVisible(false);
    }
    setupToggleControls();
    refreshPipelineList({ silent: true, preserveSelection: false });
    refreshSong2DawRuns({ silent: true });
    const toggleObserver = new MutationObserver(() => {
      if (setupToggleControls()) toggleObserver.disconnect();
    });
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
    song2dawDockToggleBtn.addEventListener("click", () => {
      setSong2DawDockVisible(!song2dawDockVisible);
    });
    song2dawDockExpandBtn.addEventListener("click", () => {
      toggleSong2DawDockExpanded();
    });
    song2dawDockHeaderToggleBtn.addEventListener("click", () => {
      setSong2DawDockVisible(!song2dawDockVisible);
    });
    song2dawDockHeaderExpandBtn.addEventListener("click", () => {
      toggleSong2DawDockExpanded();
    });
    song2dawDockResizer.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      if (!song2dawDockVisible) return;
      if (song2dawDockExpanded) setSong2DawDockExpanded(false);
      const startY = ev.clientY;
      const startHeight = currentSong2DawDockHeight;
      const onMove = (moveEv) => {
        const delta = startY - moveEv.clientY;
        setSong2DawDockHeight(startHeight + delta);
      };
      const onUp = () => {
        localStorage.setItem("lemoufSong2DawDockHeight", String(currentSong2DawDockHeight));
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    window.addEventListener("resize", () => {
      if (song2dawDockExpanded) applyWorkspaceLayout();
      if (currentScreen === "song2daw_detail") scheduleSong2DawDetailBalance();
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.altKey && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && ev.code === "KeyL") {
        ev.preventDefault();
        togglePanel();
        return;
      }
      if (!ev || ev.defaultPrevented) return;
      if (isTextLikeTarget(ev.target)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      const key = String(ev.key || "");
      const isArrowUp = key === "ArrowUp";
      const isArrowDown = key === "ArrowDown";
      const isEnter = key === "Enter";
      if (!isArrowUp && !isArrowDown && !isEnter) return;

      const adapterId = String(currentWorkflowProfile?.adapter_id || "");
      if (adapterId === "song2daw") {
        if (!hasSong2DawStepDetail()) return;
        if (isArrowUp || isArrowDown) {
          ev.preventDefault();
          stepSong2DawDetailBy(isArrowUp ? -1 : 1);
          return;
        }
        if (isEnter) {
          ev.preventDefault();
          openSong2DawStepDetailScreen();
        }
        return;
      }

      if (adapterId === "generic_loop" && currentScreen === "run") {
        if (isArrowUp || isArrowDown) {
          ev.preventDefault();
          moveManifestCycleSelectionBy(isArrowUp ? -1 : 1).catch(() => {});
          return;
        }
        if (isEnter) {
          ev.preventDefault();
          confirmOrPrimeSelectedCycleRetry().catch(() => {});
          return;
        }
      }

      if (adapterId === "generic_loop" && currentScreen === "home" && pipelineLoadedState) {
        if (isArrowUp || isArrowDown) {
          ev.preventDefault();
          stepPipelineSelectionBy(isArrowUp ? -1 : 1).catch(() => {});
          return;
        }
        if (isEnter) {
          ev.preventDefault();
          openSelectedPipelineStep().catch(() => {});
        }
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
        if (!progressState.promptId) return;
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
        if (!progressState.promptId) return;
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
        if (!progressState.promptId) return;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "running";
        updateProgressUI();
      });
      api.addEventListener?.("execution_success", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (!progressState.promptId) return;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "done";
        progressState.value = progressState.max || progressState.value;
        updateProgressUI();
        refreshLoopDetail();
        refreshSong2DawRuns({ silent: true, autoLoad: true });
      });
      api.addEventListener?.("execution_error", (ev) => {
        const detail = ev?.detail || {};
        const promptId = detail.prompt_id || detail.promptId;
        if (!progressState.promptId) return;
        if (progressState.promptId && promptId && promptId !== progressState.promptId) return;
        progressState.status = "error";
        updateProgressUI();
        refreshSong2DawRuns({ silent: true, autoLoad: true });
      });
    } catch {}
    await refreshLoops();
    await runValidation(true);
    } catch (err) {
      console.error("[leMouf Loop] setup failed:", err);
    }
  },
});
