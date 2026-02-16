import { el } from "./dom.js";

export function createPipelineGraphView({
  getWorkflowInfo,
  formatDuration,
  onNavigate,
  onSelect,
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
    const flow = el("div", { class: "lemouf-step-flow lemouf-step-flow-pipeline" });
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
          : statusText === "waiting"
          ? "warn"
          : statusText === "running"
          ? "running"
          : "pending";
      const isActive = getActiveStepId() === step.id;
      const isSelected = getSelectedStepId() === step.id;
      const card = el("div", {
        class: `lemouf-step-flow-card${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`,
      });
      const isCompositionStep = String(step?.role || "").toLowerCase() === "composition";
      const hasWorkflow = Boolean(step.workflow && step.workflow !== "(none)");
      if (hasWorkflow || isCompositionStep) {
        card.classList.add("is-clickable");
        card.addEventListener("click", (ev) => {
          ev.preventDefault();
          if (typeof onSelect === "function") onSelect(step);
          else onNavigate?.(step);
        });
        card.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          onNavigate?.(step);
        });
      }
      const statusBadge = el("div", { class: `lemouf-step-flow-badge ${statusClass}`, text: statusText });
      card.append(
        el("div", { class: "lemouf-step-flow-head" }, [
          statusBadge,
          el("span", { class: "lemouf-step-flow-index", text: `Step ${i + 1}` }),
        ]),
        el("div", { class: "lemouf-step-flow-title", text: step.role || "step" }),
        el("div", { class: "lemouf-step-flow-sub", text: step.workflow || "(none)" }),
      );
      flow.appendChild(card);
      if (i < steps.length - 1) {
        flow.appendChild(el("div", { class: "lemouf-step-flow-arrow", text: "↓" }));
      }

      if (isCompositionStep && !hasWorkflow) {
        const details = [];
        details.push("Manual gate: open composition studio.");
        if (runEntry.startedAt && runEntry.endedAt) {
          const duration = formatDuration(runEntry.endedAt - runEntry.startedAt);
          if (duration) details.push(`Time: ${duration}`);
        } else if (runEntry.startedAt && !runEntry.endedAt && statusText === "running") {
          details.push("Editing...");
        } else if (statusText === "waiting") {
          details.push("Waiting for user validation.");
        }
        for (const line of details) {
          card.appendChild(el("div", { class: "lemouf-step-flow-meta", text: line }));
        }
        continue;
      }

      const info = await getWorkflowInfo(step.workflow);
      if (!info.ok) {
        statusBadge.textContent = "missing";
        statusBadge.classList.remove("pending", "running", "ok");
        statusBadge.classList.add("error");
        card.appendChild(el("div", { class: "lemouf-step-flow-meta", text: info.error || "Missing workflow." }));
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
        card.appendChild(el("div", { class: "lemouf-step-flow-meta", text: line }));
      }
    }
    root.appendChild(flow);

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
