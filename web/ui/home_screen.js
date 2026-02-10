import { el } from "./dom.js";

export function createHomeScreen() {
  const root = el("div", { class: "lemouf-loop-prestart lemouf-loop-screen" });
  const pipelineSelect = el("select", { class: "lemouf-loop-select" });
  const pipelineStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const pipelineNav = el("div", { class: "lemouf-loop-block" });
  const pipelineLoadBtn = el("button", { class: "lemouf-loop-btn", text: "Load pipeline" });
  const pipelineRefreshBtn = el("button", { class: "lemouf-loop-btn alt", text: "Refresh list" });
  const pipelineStartBtn = el("button", { class: "lemouf-loop-btn alt", text: "Start pipeline" });
  const validateBtn = el("button", { class: "lemouf-loop-btn alt", text: "Validate & Start" });
  const cyclesInput = el("input", { type: "number", min: 1, value: 1 });
  const compatStatus = el("div", { class: "lemouf-loop-status", text: "" });

  const pipelineBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block" });
  pipelineBlock.append(
    el("label", { text: "Pipeline workflow" }),
    pipelineSelect,
    el("div", { class: "lemouf-loop-row tight" }, [pipelineLoadBtn, pipelineRefreshBtn]),
    pipelineStatus,
  );

  const pipelineStartRow = el("div", { class: "lemouf-loop-row" }, [pipelineStartBtn]);
  const cyclesRow = el("div", { class: "lemouf-loop-inline", style: "display:none;" }, [
    el("label", { text: "Total cycles" }),
    cyclesInput,
    validateBtn,
  ]);

  root.append(
    pipelineBlock,
    pipelineNav,
    pipelineStartRow,
    cyclesRow,
    el("div", { class: "lemouf-loop-field" }, [compatStatus]),
  );

  return {
    root,
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
  };
}
