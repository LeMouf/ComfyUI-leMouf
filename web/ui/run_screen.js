import { el } from "./dom.js";

export function createRunScreen({
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
}) {
  const root = el("div", { class: "lemouf-loop-poststart lemouf-loop-screen", style: "display:none;" });
  const postStartTop = el("div", { class: "lemouf-loop-poststart-top" });
  const postStartBottom = el("div", { class: "lemouf-loop-poststart-bottom" });

  const overridesLabel = el("div", { text: "Overrides (JSON map)" });
  const overridesApplyBtn = el("button", { class: "lemouf-loop-btn", text: "Apply overrides" });

  postStartTop.append(
    progressWrap,
    previewWrap,
    actionRow,
    el("div", { class: "lemouf-loop-row" }, [exportBtn]),
    el("div", { class: "lemouf-loop-row" }, [exitBtn]),
    el("div", { class: "lemouf-loop-field", style: "display:none;" }, [overridesLabel]),
    el("div", { class: "lemouf-loop-field", style: "display:none;" }, [overridesBox]),
    el("div", { class: "lemouf-loop-row", style: "display:none;" }, [overridesApplyBtn]),
    el("div", { class: "lemouf-loop-field" }, [actionStatus]),
    el("div", { class: "lemouf-loop-field" }, [manifestBox]),
  );

  const summary = el("summary", { text: "Advanced controls" });
  const createBtn = el("button", { class: "lemouf-loop-btn", text: "Create" });
  const refreshBtn = el("button", { class: "lemouf-loop-btn alt", text: "Refresh" });
  const setCyclesBtn = el("button", { class: "lemouf-loop-btn ghost", text: "Set cycles" });
  const syncBtn = el("button", { class: "lemouf-loop-btn alt", text: "Sync now" });
  const useCurrentBtn = el("button", { class: "lemouf-loop-btn", text: "Use current WF" });
  const injectBtn = el("button", { class: "lemouf-loop-btn", text: "Inject loop_id" });
  const stepBtn = el("button", { class: "lemouf-loop-btn alt", text: "Step cycle" });

  postStartBottom.append(
    el("details", { class: "lemouf-loop-accordion" }, [
      summary,
      loopIdLabel,
      el("div", { class: "lemouf-loop-row" }, [statusBadge, cycleBadge, retryBadge]),
      el("div", { class: "lemouf-loop-row" }, [createBtn, refreshBtn, setCyclesBtn]),
      el("div", { class: "lemouf-loop-row" }, [autoSyncLabel, syncBtn]),
      el("div", { class: "lemouf-loop-row" }, [useCurrentBtn, injectBtn, stepBtn]),
    ]),
  );

  root.append(postStartTop, postStartBottom);

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
  };
}
