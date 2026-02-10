import { el } from "./dom.js";

export function createPipelineGraphView({
  getWorkflowInfo,
  formatDuration,
  onNavigate,
  getActiveStepId,
  getSelectedStepId,
  getRunState,
}) {
  const root = el("div", { class: "lemouf-loop-pipeline-graph" });
  const status = el("div", { class: "lemouf-loop-status", text: "" });

  const setStatus = (msg) => {
    status.textContent = msg || "";
  };

  const render = async (steps) => {
    root.innerHTML = "";
    if (!steps || steps.length === 0) {
      setStatus("No pipeline steps found.");
      return;
    }
    setStatus("");
    const column = el("div", { class: "lemouf-loop-pipeline-col" });
    const runState = getRunState();
    const runEntries = runState?.steps || {};
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const runEntry = runEntries[step.id] || {};
      const statusText = runEntry.status || "pending";
      const statusClass =
        statusText === "done"
          ? "ok"
          : statusText === "error"
          ? "error"
          : statusText === "running"
          ? "running"
          : "pending";
      const isActive = getActiveStepId() === step.id;
      const isSelected = getSelectedStepId() === step.id;
      const card = el("div", {
        class: `lemouf-loop-pipeline-step${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`,
      });
      if (step.workflow && step.workflow !== "(none)") {
        card.classList.add("is-clickable");
        card.addEventListener("click", (ev) => {
          ev.preventDefault();
          onNavigate?.(step);
        });
      }
      const statusBadge = el("div", { class: `lemouf-loop-step-status ${statusClass}`, text: statusText });
      card.append(
        statusBadge,
        el("div", { class: "lemouf-loop-step-index", text: `Step ${i + 1}` }),
        el("div", { class: "role", text: step.role || "step" }),
        el("div", { class: "name", text: step.workflow || "(none)" }),
      );
      column.appendChild(card);
      if (i < steps.length - 1) {
        column.appendChild(el("div", { class: "lemouf-loop-pipeline-arrow", text: "↓" }));
      }

      const info = await getWorkflowInfo(step.workflow);
      if (!info.ok) {
        statusBadge.textContent = "missing";
        statusBadge.classList.remove("pending", "running", "ok");
        statusBadge.classList.add("error");
        card.appendChild(el("div", { class: "detail", text: info.error || "Missing workflow." }));
        continue;
      }

      const details = [];
      details.push(`Loop Return: ${info.hasLoopReturn ? "ok" : "missing"}`);
      if (!info.hasLoopReturn) {
        statusBadge.textContent = "error";
        statusBadge.classList.remove("pending", "running", "ok");
        statusBadge.classList.add("error");
      }
      if (info.hasPipeline) details.push("Note: pipeline nodes inside.");
      if (runEntry.startedAt && runEntry.endedAt) {
        const duration = formatDuration(runEntry.endedAt - runEntry.startedAt);
        if (duration) details.push(`Time: ${duration}`);
      } else if (runEntry.startedAt && !runEntry.endedAt && statusText === "running") {
        details.push("Running...");
      }
      for (const line of details) {
        card.appendChild(el("div", { class: "detail", text: line }));
      }
    }
    root.appendChild(column);

    if (runState) {
      const end = runState.endedAt || null;
      const duration = end ? formatDuration(end - runState.startedAt) : "";
      const hasError = Object.values(runState.steps || {}).some((s) => s.status === "error");
      const statusLabel = hasError ? "Last run failed" : end ? "Last run complete" : "Last run active";
      const detail = duration ? ` · ${duration}` : "";
      setStatus(`${statusLabel}${detail}`);
    }
  };

  return { root, status, setStatus, render };
}
