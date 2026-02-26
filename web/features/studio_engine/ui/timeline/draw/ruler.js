import * as CONSTANTS from "../../../domain/policies/constants.js";

export function chooseRulerStepSec(pxPerSec) {
  const targetSec = Math.max(0.001, CONSTANTS.RULER_TARGET_PX / Math.max(1, pxPerSec));
  for (const value of CONSTANTS.RULER_STEP_OPTIONS_SEC) {
    if (value >= targetSec) return value;
  }
  return CONSTANTS.RULER_STEP_OPTIONS_SEC[CONSTANTS.RULER_STEP_OPTIONS_SEC.length - 1];
}

export function formatTimelineTimeLabel(timeSec, stepSec) {
  const safe = Math.max(0, Number(timeSec || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  const decimals = stepSec < 0.2 ? 2 : stepSec < 1 ? 1 : 0;
  const secText = decimals > 0 ? seconds.toFixed(decimals).padStart(decimals + 3, "0") : String(Math.floor(seconds)).padStart(2, "0");
  return `${minutes}:${secText}`;
}

export function drawTimeRuler(state, ctx, toX, visibleStartSec, visibleEndSec, width, height) {
  const stepSec = chooseRulerStepSec(state.pxPerSec);
  const minorStepSec = stepSec >= 10 ? stepSec / 5 : stepSec >= 2 ? stepSec / 4 : stepSec / 5;
  const firstMinor = Math.floor(visibleStartSec / minorStepSec) * minorStepSec;
  const firstMajor = Math.floor(visibleStartSec / stepSec) * stepSec;

  ctx.fillStyle = "#eee1d0";
  ctx.fillRect(CONSTANTS.LEFT_GUTTER, 0, Math.max(0, width - CONSTANTS.LEFT_GUTTER), CONSTANTS.RULER_HEIGHT);
  ctx.fillStyle = "#e2d2bf";
  ctx.fillRect(0, 0, CONSTANTS.LEFT_GUTTER, CONSTANTS.RULER_HEIGHT);

  ctx.strokeStyle = "rgba(96, 74, 55, 0.14)";
  for (let t = firstMinor; t <= visibleEndSec + minorStepSec; t += minorStepSec) {
    const x = toX(t);
    if (x < CONSTANTS.LEFT_GUTTER || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, CONSTANTS.RULER_HEIGHT - 9);
    ctx.lineTo(x + 0.5, CONSTANTS.RULER_HEIGHT - 1);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(78, 58, 41, 0.26)";
  ctx.fillStyle = "#4b392b";
  ctx.font = "10px monospace";
  for (let t = firstMajor; t <= visibleEndSec + stepSec; t += stepSec) {
    const x = toX(t);
    if (x < CONSTANTS.LEFT_GUTTER || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, CONSTANTS.RULER_HEIGHT - 15);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
    const label = formatTimelineTimeLabel(t, stepSec);
    ctx.fillText(label, x + 3, 11);
  }

  ctx.strokeStyle = "rgba(92, 70, 52, 0.5)";
  ctx.beginPath();
  ctx.moveTo(0, CONSTANTS.RULER_HEIGHT - 0.5);
  ctx.lineTo(width, CONSTANTS.RULER_HEIGHT - 0.5);
  ctx.stroke();

  ctx.fillStyle = "#5f4a39";
  ctx.font = "9px monospace";
  ctx.fillText(`tick ${stepSec >= 1 ? `${stepSec.toFixed(0)}s` : `${stepSec.toFixed(2)}s`}`, 8, 11);
}
