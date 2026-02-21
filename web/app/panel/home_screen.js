import { el } from "../../shared/ui/dom.js";
import { setButtonIcon } from "../../shared/ui/icons.js";

export function createHomeScreen() {
  const root = el("div", { class: "lemouf-loop-prestart lemouf-loop-screen" });
  const pipelineSelect = el("select", { class: "lemouf-loop-select", style: "display:none;" });
  const pipelineList = el("div", { class: "lemouf-workflow-list" });
  const pipelineStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const workflowProfileStatus = el("div", {
    class: "lemouf-loop-status lemouf-workflow-profile-status",
    text: "Workflow profile: generic_loop (auto)",
  });
  const pipelineNav = el("div", { class: "lemouf-loop-block lemouf-home-card lemouf-home-card-compact" });
  const pipelineRefreshBtn = el("button", { class: "lemouf-loop-btn ghost icon", text: "⟳", title: "Refresh list" });
  setButtonIcon(pipelineRefreshBtn, { icon: "refresh", title: "Refresh workflow list" });
  const pipelineLoadBtn = el("button", { class: "lemouf-loop-btn alt", text: "Load pipeline" });
  const pipelineRunBtn = el("button", { class: "lemouf-loop-btn alt", text: "Run pipeline" });
  const validateBtn = el("button", { class: "lemouf-loop-btn alt", text: "Validate & Start" });
  const cyclesInput = el("input", { type: "number", min: 1, value: 1 });
  const compatStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const workflowDiagnosticsSummaryState = el("span", {
    class: "lemouf-workflow-diagnostics-summary-state is-neutral",
    text: "Awaiting check",
  });
  const workflowDiagnosticsSummary = el("summary", { class: "lemouf-workflow-diagnostics-summary" }, [
    el("span", { class: "lemouf-workflow-diagnostics-summary-title", text: "Workflow eval" }),
    workflowDiagnosticsSummaryState,
  ]);
  const workflowDiagnosticsPanel = el("details", { class: "lemouf-song2daw-step-panel lemouf-workflow-diagnostics-panel" }, [
    workflowDiagnosticsSummary,
    el("div", { class: "lemouf-workflow-diagnostics-body" }, [
    workflowProfileStatus,
    compatStatus,
    ]),
  ]);
  const song2dawSelect = el("select", { class: "lemouf-loop-select" });
  const song2dawStatus = el("div", { class: "lemouf-loop-status", text: "" });
  const song2dawRefreshBtn = el("button", { class: "lemouf-loop-btn", text: "Refresh runs" });
  const song2dawClearBtn = el("button", { class: "lemouf-loop-btn alt", text: "Clear runs" });
  const song2dawLoadBtn = el("button", { class: "lemouf-loop-btn alt", text: "Load step view" });
  const song2dawOpenDirBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open run_dir" });
  const song2dawDockToggleBtn = el("button", { class: "lemouf-loop-btn alt", text: "Hide studio" });
  const song2dawDockExpandBtn = el("button", { class: "lemouf-loop-btn alt", text: "Max studio" });
  const song2dawPrimaryLoadRow = el("div", {
    class: "lemouf-loop-row tight",
    style: "display:none;",
  }, [song2dawLoadBtn]);
  const song2dawRunActionsRow = el("div", { class: "lemouf-loop-row tight" }, [
    song2dawOpenDirBtn,
  ]);
  const song2dawStudioActionsRow = el("div", { class: "lemouf-loop-row tight" }, [
    song2dawDockToggleBtn,
    song2dawDockExpandBtn,
  ]);
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
  const song2dawStepTitle = el("div", { class: "lemouf-song2daw-step-title", text: "Step outputs (JSON)" });
  const song2dawStepDetail = el("pre", { class: "lemouf-loop-payload-pre lemouf-song2daw-detail-pre", text: "" });
  const song2dawStepPanel = el("div", { class: "lemouf-song2daw-step-panel lemouf-song2daw-detail-content-panel" }, [
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
  const song2dawStudioInlineResizer = el("div", {
    class: "lemouf-song2daw-studio-inline-resizer",
    title: "Resize compact studio view",
  });
  const song2dawStudioBody = el("div", {
    class: "lemouf-song2daw-studio-body",
    text: "Load a run to preview DAW visual data.",
  });
  const song2dawStudioPanel = el("div", { class: "lemouf-song2daw-step-panel lemouf-song2daw-studio-panel" }, [
    song2dawStudioTabs,
    song2dawStudioInlineResizer,
    song2dawStudioBody,
  ]);
  const song2dawDetail = el("pre", { class: "lemouf-loop-payload-pre lemouf-song2daw-detail-pre", text: "" });
  const song2dawAdvancedSummary = el("summary", { text: "Advanced controls" });
  const song2dawAdvancedControls = el("details", { class: "lemouf-loop-accordion" }, [
    song2dawAdvancedSummary,
  ]);
  const song2dawRunSelectionBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Run selection" }),
    song2dawSelect,
    el("div", { class: "lemouf-loop-row tight" }, [song2dawRefreshBtn, song2dawClearBtn]),
  ]);
  const song2dawRunActionsBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Run actions" }),
    song2dawRunActionsRow,
  ]);
  const song2dawStudioActionsBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Studio actions" }),
    song2dawStudioActionsRow,
  ]);
  const song2dawHomeViewBlock = el("div", { class: "lemouf-loop-block lemouf-song2daw-home-view" }, [
    song2dawOverview,
    song2dawStudioPanel,
  ]);
  const song2dawRunDetailBlock = el("div", { class: "lemouf-loop-block lemouf-song2daw-run-detail", style: "display:none;" }, [
    song2dawHomeViewBlock,
    song2dawStatus,
  ]);

  const pipelineBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block lemouf-home-card" });
  pipelineBlock.append(
    el("label", { text: "Pipeline workflow" }),
    pipelineList,
    pipelineSelect,
    workflowDiagnosticsPanel,
    el("div", { class: "lemouf-loop-row tight" }, [pipelineRefreshBtn, pipelineLoadBtn]),
    pipelineStatus,
  );

  const cyclesRow = el("div", { class: "lemouf-loop-inline", style: "display:none;" }, [
    el("label", { text: "Total cycles" }),
    cyclesInput,
    validateBtn,
  ]);

  const song2dawBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block lemouf-home-card lemouf-song2daw-home-card" });
  song2dawAdvancedControls.append(
    song2dawRunSelectionBlock,
    song2dawRunActionsBlock,
    song2dawStudioActionsBlock,
    song2dawAudioPreviewPanel,
  );
  song2dawBlock.append(
    el("label", { text: "Song2DAW step views" }),
    song2dawPrimaryLoadRow,
    song2dawAdvancedControls,
    song2dawRunDetailBlock,
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
    pipelineLoadBtn,
    pipelineRunBtn,
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
    song2dawHomeViewBlock,
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
    song2dawStudioInlineResizer,
    song2dawStudioBody,
    song2dawDetail,
  };
}
