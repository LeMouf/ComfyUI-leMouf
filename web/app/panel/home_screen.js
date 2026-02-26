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
  const workflowDiagnosticsPanel = el("details", { class: "lemouf-studio-step-panel lemouf-workflow-diagnostics-panel" }, [
    workflowDiagnosticsSummary,
    el("div", { class: "lemouf-workflow-diagnostics-body" }, [
    workflowProfileStatus,
    compatStatus,
    ]),
  ]);
  const studioRunSelect = el("select", { class: "lemouf-loop-select" });
  const studioStatusText = el("div", { class: "lemouf-loop-status", text: "" });
  const studioRefreshBtn = el("button", { class: "lemouf-loop-btn", text: "Refresh runs" });
  const studioClearBtn = el("button", { class: "lemouf-loop-btn alt", text: "Clear runs" });
  const studioLoadBtn = el("button", { class: "lemouf-loop-btn alt", text: "Load step view" });
  const studioOpenDirBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open run_dir" });
  const studioDockToggleBtn = el("button", { class: "lemouf-loop-btn alt", text: "Hide studio" });
  const studioDockExpandBtn = el("button", { class: "lemouf-loop-btn alt", text: "Max studio" });
  const studioPrimaryLoadRow = el("div", {
    class: "lemouf-loop-row tight",
    style: "display:none;",
  }, [studioLoadBtn]);
  const studioRunActionsRow = el("div", { class: "lemouf-loop-row tight" }, [
    studioOpenDirBtn,
  ]);
  const studioActionsRow = el("div", { class: "lemouf-loop-row tight" }, [
    studioDockToggleBtn,
    studioDockExpandBtn,
  ]);
  const studioAudioPreviewAsset = el("select", { class: "lemouf-loop-select", disabled: true });
  studioAudioPreviewAsset.appendChild(el("option", { value: "", text: "No source preview" }));
  const studioAudioPreviewPlayer = el("audio", {
    class: "lemouf-studio-audio-preview-player",
    controls: true,
    preload: "metadata",
  });
  const studioAudioPreviewPanel = el("div", { class: "lemouf-studio-audio-preview" }, [
    el("div", { class: "lemouf-studio-step-title", text: "Source preview" }),
    studioAudioPreviewAsset,
    studioAudioPreviewPlayer,
  ]);
  studioOpenDirBtn.disabled = true;
  const studioOverview = el("div", { class: "lemouf-studio-overview" });
  const studioStepTitle = el("div", { class: "lemouf-studio-step-title", text: "Step outputs (JSON)" });
  const studioStepDetail = el("pre", { class: "lemouf-loop-payload-pre lemouf-studio-detail-pre", text: "" });
  const studioStepPanel = el("div", { class: "lemouf-studio-step-panel lemouf-studio-detail-content-panel" }, [
    studioStepTitle,
    studioStepDetail,
  ]);
  const studioTimelineBtn = el("button", { class: "lemouf-loop-btn alt", text: "Arrange" });
  const studioTracksBtn = el("button", { class: "lemouf-loop-btn alt", text: "Tracks" });
  const studioSpectrumBtn = el("button", { class: "lemouf-loop-btn alt", text: "Spectrum 3D" });
  const studioTabs = el("div", { class: "lemouf-loop-row tight" }, [
    studioTimelineBtn,
    studioTracksBtn,
    studioSpectrumBtn,
  ]);
  const studioInlineResizer = el("div", {
    class: "lemouf-studio-inline-resizer",
    title: "Resize compact studio view",
  });
  const studioBody = el("div", {
    class: "lemouf-studio-body",
    text: "Load a run to preview DAW visual data.",
  });
  const studioPanel = el("div", { class: "lemouf-studio-step-panel lemouf-studio-panel" }, [
    studioTabs,
    studioInlineResizer,
    studioBody,
  ]);
  const studioDetailSummary = el("pre", { class: "lemouf-loop-payload-pre lemouf-studio-detail-pre", text: "" });
  const studioAdvancedSummary = el("summary", { text: "Advanced controls" });
  const studioAdvancedControls = el("details", { class: "lemouf-loop-accordion" }, [
    studioAdvancedSummary,
  ]);
  const studioRunSelectionBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-studio-step-title", text: "Run selection" }),
    studioRunSelect,
    el("div", { class: "lemouf-loop-row tight" }, [studioRefreshBtn, studioClearBtn]),
  ]);
  const studioRunActionsBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-studio-step-title", text: "Run actions" }),
    studioRunActionsRow,
  ]);
  const studioActionsBlock = el("div", { class: "lemouf-advanced-block" }, [
    el("div", { class: "lemouf-studio-step-title", text: "Studio actions" }),
    studioActionsRow,
  ]);
  const studioHomeViewBlock = el("div", { class: "lemouf-loop-block lemouf-studio-home-view" }, [
    studioOverview,
    studioPanel,
  ]);
  const studioRunDetailBlock = el("div", { class: "lemouf-loop-block lemouf-studio-run-detail", style: "display:none;" }, [
    studioHomeViewBlock,
    studioStatusText,
  ]);
  const studioSidebarMonitorHost = el("div", { class: "lemouf-tool-step-monitor-host" });
  const studioSidebarConfigHost = el("div", { class: "lemouf-tool-step-monitor-host" });
  const studioSidebarDockHosts = el("div", {
    class: "lemouf-tool-step-dock-hosts lemouf-studio-home-dock-hosts",
    style: "display:none;",
  }, [
    studioSidebarMonitorHost,
    studioSidebarConfigHost,
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

  const studioFeatureBlock = el("div", { class: "lemouf-loop-field lemouf-loop-block lemouf-home-card lemouf-studio-home-card" });
  studioAdvancedControls.append(
    studioRunSelectionBlock,
    studioRunActionsBlock,
    studioActionsBlock,
    studioAudioPreviewPanel,
  );
  studioFeatureBlock.append(
    el("label", { text: "Studio step views" }),
    studioPrimaryLoadRow,
    studioAdvancedControls,
    studioRunDetailBlock,
    studioSidebarDockHosts,
  );

  root.append(
    pipelineBlock,
    pipelineNav,
    cyclesRow,
    studioFeatureBlock,
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
    studioRunSelect,
    studioFeatureBlock,
    workflowProfileStatus,
    studioStatusText,
    studioRefreshBtn,
    studioClearBtn,
    studioLoadBtn,
    studioPrimaryLoadRow,
    studioOpenDirBtn,
    studioDockToggleBtn,
    studioDockExpandBtn,
    studioRunDetailBlock,
    studioSidebarDockHosts,
    studioSidebarMonitorHost,
    studioSidebarConfigHost,
    studioHomeViewBlock,
    studioAudioPreviewAsset,
    studioAudioPreviewPlayer,
    studioOverview,
    studioStepPanel,
    studioStepTitle,
    studioStepDetail,
    studioPanel,
    studioTimelineBtn,
    studioTracksBtn,
    studioSpectrumBtn,
    studioInlineResizer,
    studioBody,
    studioDetailSummary,
  };
}

