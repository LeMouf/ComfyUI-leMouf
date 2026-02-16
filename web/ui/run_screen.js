import { el } from "./dom.js";

export function createRunScreen({
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
}) {
  const root = el("div", { class: "lemouf-loop-poststart lemouf-loop-screen", style: "display:none;" });
  const postStartTop = el("div", { class: "lemouf-loop-poststart-top" });
  const postStartBottom = el("div", { class: "lemouf-loop-poststart-bottom" });

  const overridesLabel = el("div", { text: "Overrides (JSON map)" });
  const overridesApplyBtn = el("button", { class: "lemouf-loop-btn", text: "Apply overrides" });
  actionStatus.classList.add("lemouf-loop-manifest-status");
  const manifestHeadCaret = el("span", {
    class: "lemouf-loop-manifest-caret",
    text: "▾",
  });
  const manifestHeadTools = el("div", { class: "lemouf-loop-manifest-head-tools" }, [
    actionStatus,
    manifestRunBtn,
  ]);
  const manifestHeadLabel = el("div", { class: "lemouf-loop-manifest-head-label-wrap" }, [
    manifestHeadCaret,
    el("div", { class: "lemouf-loop-manifest-head-label", text: "Cycles" }),
  ]);
  const manifestHead = el("div", { class: "lemouf-loop-manifest-head" }, [
    manifestHeadLabel,
    manifestHeadTools,
  ]);
  const manifestViewport = el("div", { class: "lemouf-loop-manifest-viewport" }, [manifestBox]);
  const manifestPanel = el("div", { class: "lemouf-loop-field lemouf-loop-manifest-wrap" }, [
    manifestHead,
    manifestViewport,
  ]);

  postStartTop.append(
    progressWrap,
    previewWrap,
    actionRow,
    el("div", { class: "lemouf-loop-field", style: "display:none;" }, [overridesLabel]),
    el("div", { class: "lemouf-loop-field", style: "display:none;" }, [overridesBox]),
    el("div", { class: "lemouf-loop-row", style: "display:none;" }, [overridesApplyBtn]),
    manifestPanel,
  );

  const summary = el("summary", { text: "Advanced controls" });
  const createBtn = el("button", { class: "lemouf-loop-btn", text: "Create" });
  const refreshBtn = el("button", { class: "lemouf-loop-btn alt", text: "Refresh" });
  const setCyclesBtn = el("button", { class: "lemouf-loop-btn ghost", text: "Set cycles" });
  const syncBtn = el("button", { class: "lemouf-loop-btn alt", text: "Sync now" });
  const useCurrentBtn = el("button", { class: "lemouf-loop-btn", text: "Use current WF" });
  const injectBtn = el("button", { class: "lemouf-loop-btn", text: "Inject loop_id" });
  const stepBtn = el("button", { class: "lemouf-loop-btn alt", text: "Step cycle" });
  autoSyncLabel.textContent = "Auto-sync WF";
  loopIdLabel.classList.add("lemouf-adv-loopid");
  statusBadge.classList.add("lemouf-adv-badge");
  cycleBadge.classList.add("lemouf-adv-badge");
  retryBadge.classList.add("lemouf-adv-badge");
  const advHeader = el("div", { class: "lemouf-adv-header" }, [
    loopIdLabel,
    el("div", { class: "lemouf-adv-badges" }, [statusBadge, cycleBadge, retryBadge]),
  ]);
  const advPrimaryRow = el("div", { class: "lemouf-adv-grid lemouf-adv-grid-2" }, [createBtn, refreshBtn]);
  const advCyclesRow = el("div", { class: "lemouf-adv-grid lemouf-adv-grid-1" }, [setCyclesBtn]);
  const advSyncRow = el("div", { class: "lemouf-adv-sync-row" }, [
    el("span", { class: "lemouf-adv-sync-label", text: autoSyncLabel.textContent || "Auto-sync WF" }),
    syncBtn,
  ]);
  const advRoutingRow = el("div", { class: "lemouf-adv-grid lemouf-adv-grid-2" }, [useCurrentBtn, injectBtn]);
  const advStepRow = el("div", { class: "lemouf-adv-grid lemouf-adv-grid-1" }, [stepBtn]);
  const manifestFooter = el("div", { class: "lemouf-loop-manifest-footer" }, [
    el("details", { class: "lemouf-loop-accordion lemouf-loop-accordion-footer" }, [
      summary,
      advHeader,
      advPrimaryRow,
      advCyclesRow,
      advSyncRow,
      advRoutingRow,
      advStepRow,
    ]),
  ]);
  manifestPanel.appendChild(manifestFooter);

  let manifestCollapsed = false;
  let manifestCollapsible = false;
  const applyManifestAccordionState = () => {
    manifestPanel.classList.toggle("is-collapsed", manifestCollapsed);
    manifestPanel.classList.toggle("is-collapsible", manifestCollapsible);
    manifestHead.classList.toggle("is-collapsible", manifestCollapsible);
    manifestHead.setAttribute("aria-expanded", String(!manifestCollapsed));
    manifestHead.setAttribute("role", manifestCollapsible ? "button" : "presentation");
    manifestHead.tabIndex = manifestCollapsible ? 0 : -1;
    manifestHeadCaret.textContent = manifestCollapsed ? "▸" : "▾";
    manifestHeadCaret.style.opacity = manifestCollapsible ? "1" : "0.45";
    manifestHead.title = manifestCollapsible ? "Toggle cycles" : "";
  };
  const setManifestCollapsed = (collapsed) => {
    manifestCollapsed = Boolean(collapsed);
    applyManifestAccordionState();
  };
  const setManifestCollapsible = (enabled) => {
    manifestCollapsible = Boolean(enabled);
    if (!manifestCollapsible) manifestCollapsed = false;
    applyManifestAccordionState();
  };
  manifestHeadTools.addEventListener("click", (ev) => {
    ev.stopPropagation();
  });
  manifestHead.addEventListener("click", () => {
    if (!manifestCollapsible) return;
    setManifestCollapsed(!manifestCollapsed);
  });
  manifestHead.addEventListener("keydown", (ev) => {
    if (!manifestCollapsible) return;
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    setManifestCollapsed(!manifestCollapsed);
  });
  applyManifestAccordionState();

  root.append(postStartTop);

  return {
    root,
    postStartTop,
    postStartBottom,
    overridesApplyBtn,
    createBtn,
    refreshBtn,
    setCyclesBtn,
    syncBtn,
    useCurrentBtn,
    injectBtn,
    stepBtn,
    setManifestCollapsed,
    setManifestCollapsible,
  };
}
