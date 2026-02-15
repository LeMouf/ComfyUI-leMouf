import { el } from "./dom.js";

export function createHomeScreen() {
  const root = el("div", { class: "lemouf-loop-prestart lemouf-loop-screen" });
  const pipelineSelect = el("select", { class: "lemouf-loop-select", style: "display:none;" });
  const pipelineList = el("div", { class: "lemouf-workflow-list" });
  const pipelineStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const workflowProfileStatus = el("div", {
    class: "lemouf-loop-status lemouf-workflow-profile-status",
    text: "Workflow profile: generic_loop (auto)",
  });
  const workflowUseCurrentBtn = el("button", { class: "lemouf-loop-btn alt", text: "Use current WF" });
  const pipelineNav = el("div", { class: "lemouf-loop-block" });
  const pipelineRefreshBtn = el("button", { class: "lemouf-loop-btn ghost icon", text: "⟳", title: "Refresh list" });
  const pipelineRunBtn = el("button", { class: "lemouf-loop-btn alt", text: "Run pipeline" });
  const validateBtn = el("button", { class: "lemouf-loop-btn alt", text: "Validate & Start" });
  const cyclesInput = el("input", { type: "number", min: 1, value: 1 });
  const compatStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const workflowDiagnosticsPanel = el("div", { class: "lemouf-song2daw-step-panel lemouf-workflow-diagnostics-panel" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Workflow diagnostics" }),
    workflowProfileStatus,
    compatStatus,
  ]);
  const song2dawSelect = el("select", { class: "lemouf-loop-select" });
  const song2dawStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const song2dawRefreshBtn = el("button", { class: "lemouf-loop-btn", text: "Refresh runs" });
  const song2dawClearBtn = el("button", { class: "lemouf-loop-btn alt", text: "Clear runs" });
  const song2dawLoadBtn = el("button", { class: "lemouf-loop-btn alt", text: "Load step view" });
  const song2dawOpenDirBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open run_dir" });
  const song2dawDockToggleBtn = el("button", { class: "lemouf-loop-btn alt", text: "Hide studio" });
  const song2dawDockExpandBtn = el("button", { class: "lemouf-loop-btn alt", text: "Max studio" });
  const song2dawAudioPreviewAsset = el("select", { class: "lemouf-loop-select", disabled: true });
  song2dawAudioPreviewAsset.appendChild(el("option", { value: "", text: "No source preview" }));
  const song2dawAudioPreviewPlayer = el("audio", {
    class: "lemouf-song2daw-audio-preview-player",
    controls: true,
    preload: "metadata",
  });
  const song2dawAudioPreviewPanel = el("div", { class: "lemouf-song2daw-audio-preview" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Source preview" }),
    song2dawAudioPreviewAsset,
    song2dawAudioPreviewPlayer,
  ]);
  song2dawOpenDirBtn.disabled = true;
  const song2dawOverview = el("div", { class: "lemouf-song2daw-overview" });
  const song2dawStepTitle = el("div", { class: "lemouf-song2daw-step-title", text: "Step detail" });
  const song2dawStepDetail = el("pre", { class: "lemouf-loop-payload-pre", text: "" });
  const song2dawStepPanel = el("div", { class: "lemouf-song2daw-step-panel" }, [
    song2dawStepTitle,
    song2dawStepDetail,
  ]);
  const song2dawStudioTimelineBtn = el("button", { class: "lemouf-loop-btn alt", text: "Arrange" });
  const song2dawStudioTracksBtn = el("button", { class: "lemouf-loop-btn alt", text: "Tracks" });
  const song2dawStudioSpectrumBtn = el("button", { class: "lemouf-loop-btn alt", text: "Spectrum 3D" });
  const song2dawStudioTabs = el("div", { class: "lemouf-loop-row tight" }, [
    song2dawStudioTimelineBtn,
    song2dawStudioTracksBtn,
    song2dawStudioSpectrumBtn,
  ]);
  const song2dawStudioBody = el("div", {
    class: "lemouf-song2daw-studio-body",
    text: "Load a run to preview DAW visual data.",
  });
  const song2dawStudioPanel = el("div", { class: "lemouf-song2daw-step-panel" }, [
    song2dawStudioTabs,
    song2dawStudioBody,
  ]);
  const song2dawDetail = el("pre", { class: "lemouf-loop-payload-pre", text: "" });

  const pipelineBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block" });
  pipelineBlock.append(
    el("label", { text: "Pipeline workflow" }),
    workflowUseCurrentBtn,
    pipelineList,
    pipelineSelect,
    workflowDiagnosticsPanel,
    el("div", { class: "lemouf-loop-row tight" }, [pipelineRefreshBtn, pipelineRunBtn]),
    pipelineStatus,
  );

  const cyclesRow = el("div", { class: "lemouf-loop-inline", style: "display:none;" }, [
    el("label", { text: "Total cycles" }),
    cyclesInput,
    validateBtn,
  ]);

  const song2dawBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block" });
  song2dawBlock.append(
    el("label", { text: "Song2DAW step views" }),
    song2dawSelect,
    el("div", { class: "lemouf-loop-row tight" }, [song2dawRefreshBtn, song2dawClearBtn]),
    el("div", { class: "lemouf-loop-row tight" }, [
      song2dawLoadBtn,
      song2dawOpenDirBtn,
      song2dawDockToggleBtn,
      song2dawDockExpandBtn,
    ]),
    song2dawAudioPreviewPanel,
    song2dawOverview,
    song2dawStepPanel,
    song2dawStudioPanel,
    song2dawStatus,
    song2dawDetail,
  );

  root.append(
    pipelineBlock,
    pipelineNav,
    cyclesRow,
    song2dawBlock,
  );

  return {
    root,
    pipelineSelect,
    pipelineList,
    pipelineStatus,
    pipelineNav,
    pipelineRefreshBtn,
    pipelineRunBtn,
    workflowUseCurrentBtn,
    cyclesRow,
    cyclesInput,
    validateBtn,
    compatStatus,
    workflowDiagnosticsPanel,
    song2dawSelect,
    song2dawBlock,
    workflowProfileStatus,
    song2dawStatus,
    song2dawRefreshBtn,
    song2dawClearBtn,
    song2dawLoadBtn,
    song2dawOpenDirBtn,
    song2dawDockToggleBtn,
    song2dawDockExpandBtn,
    song2dawAudioPreviewAsset,
    song2dawAudioPreviewPlayer,
    song2dawOverview,
    song2dawStepTitle,
    song2dawStepDetail,
    song2dawStudioPanel,
    song2dawStudioTimelineBtn,
    song2dawStudioTracksBtn,
    song2dawStudioSpectrumBtn,
    song2dawStudioBody,
    song2dawDetail,
  };
}
