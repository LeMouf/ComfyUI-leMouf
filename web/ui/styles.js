import { el } from "./dom.js";

export function injectStyles() {
  if (document.getElementById("lemouf-loop-style")) return;
  const style = el("style", { id: "lemouf-loop-style" }, [
    `
    .lemouf-loop-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: var(--lemouf-gutter, 420px);
      background: linear-gradient(180deg, #f6f0e6, #efe3d3);
      border: 1px solid #c7b7a6;
      border-radius: 12px 0 0 12px;
      padding: 12px 12px 12px 16px;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: #3b2f24;
      box-shadow: 0 8px 30px rgba(40, 30, 20, 0.18);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-title {
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 12px;
    }
    .lemouf-loop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lemouf-loop-header .lemouf-loop-title {
      margin-bottom: 0;
    }
    .lemouf-loop-header-btn {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid #b59c86;
      background: #f6f0e6;
      color: #5b4637;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }
    .lemouf-loop-header-btn:hover {
      filter: brightness(0.98);
    }
    .lemouf-loop-header-actions {
      position: relative;
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .lemouf-loop-header-menu {
      position: absolute;
      top: 34px;
      right: 0;
      background: #f6f0e6;
      border: 1px solid #b59c86;
      border-radius: 10px;
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 8px 20px rgba(40, 30, 20, 0.15);
      z-index: 10;
      min-width: 140px;
    }
    .lemouf-loop-header-menu.is-open {
      display: flex;
    }
    .lemouf-loop-header-menu-btn {
      border: 1px solid #b59c86;
      background: #fffaf3;
      color: #5b4637;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 11px;
      cursor: pointer;
      text-align: left;
    }
    .lemouf-loop-header-menu-btn:hover {
      filter: brightness(0.98);
    }
    .lemouf-loop-menu-item {
      border: 1px solid #b59c86;
      background: #f6f0e6;
      color: #5b4637;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      margin-left: 8px;
    }
    .lemouf-loop-menu-item {
      display: block;
      width: 100%;
      text-align: left;
      margin: 6px 0;
    }
    .lemouf-loop-loopid {
      font-size: 11px;
      color: #6b5a4a;
      margin-bottom: 6px;
      opacity: 0.85;
    }
    .lemouf-loop-screen {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
    }
    .lemouf-loop-poststart {
      display: flex;
      flex-direction: column;
      min-height: 0;
      gap: 8px;
    }
    .lemouf-loop-poststart-top {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
    }
    .lemouf-loop-poststart-bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-resizer {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8px;
      cursor: ew-resize;
      background: rgba(90, 70, 55, 0.08);
      border-right: 1px solid rgba(90, 70, 55, 0.2);
    }
    .lemouf-song2daw-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 230px;
      background: linear-gradient(180deg, #f4ebdf, #eadbc8);
      border-top: 1px solid #c7b7a6;
      box-shadow: 0 -8px 22px rgba(40, 30, 20, 0.16);
      z-index: 980;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }
    .lemouf-song2daw-dock-resizer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 8px;
      cursor: ns-resize;
      background: rgba(90, 70, 55, 0.08);
      border-bottom: 1px solid rgba(90, 70, 55, 0.2);
      z-index: 1;
    }
    .lemouf-song2daw-dock-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 10px 8px 10px;
      margin-top: 8px;
      border-bottom: 1px solid rgba(90, 70, 55, 0.2);
      background: rgba(255, 250, 243, 0.55);
    }
    .lemouf-song2daw-dock-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lemouf-song2daw-dock-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      color: #4a3b2f;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-step-panel {
      margin: 8px;
      margin-top: 6px;
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      border-color: #bfae9d;
      background: #f9f1e6;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-studio-body {
      flex: 1 1 auto;
      min-height: 0;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-studio-layout {
      flex: 1 1 auto;
      min-height: 0;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-arrange-canvas-wrap {
      min-height: 0;
      height: 100%;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-studio-inspector {
      min-height: 0;
      height: 100%;
    }
    .lemouf-song2daw-dock .lemouf-song2daw-step-title {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #f9f1e6;
      padding-bottom: 2px;
    }
    .lemouf-song2daw-dock .lemouf-loop-row.tight {
      margin-bottom: 0;
    }
    .lemouf-loop-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .lemouf-loop-row > * { flex: 1 1 120px; }
    .lemouf-loop-row.tight { gap: 8px; margin-bottom: 6px; }
    .lemouf-loop-row.stack { flex-direction: column; align-items: stretch; }
    .lemouf-loop-block {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-btn {
      background: #5b4637;
      color: #f7f2ea;
      border: none;
      border-radius: 8px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
    }
    .lemouf-loop-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(0.2);
      box-shadow: none;
    }
    .lemouf-loop-btn.alt { background: #8a6b4f; }
    .lemouf-loop-btn.ghost { background: transparent; border: 1px solid #5b4637; color: #5b4637; }
    .lemouf-loop-btn.icon {
      flex: 0 0 34px;
      min-width: 34px;
      max-width: 34px;
      padding: 4px 0;
      font-size: 15px;
      line-height: 1;
      text-align: center;
    }
    .lemouf-loop-inline {
      display: flex;
      align-items: stretch;
      gap: 6px;
      margin-bottom: 8px;
    }
    .lemouf-loop-field label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #6b5a4a;
      margin-bottom: 6px;
    }
    .lemouf-loop-inline label {
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      padding: 0 6px;
      border-radius: 6px;
      background: #e7d7c6;
      color: #3b2f24;
      border: 1px solid #b59c86;
      white-space: nowrap;
    }
    .lemouf-loop-inline input,
    .lemouf-loop-inline button {
      height: 30px;
    }
    .lemouf-loop-inline input {
      width: auto;
      flex: 1 1 auto;
      min-width: 0;
      padding: 0 8px;
    }
    .lemouf-loop-inline button {
      flex: 0 0 auto;
      padding: 0 12px;
      border-radius: 8px;
    }
    .lemouf-loop-select {
      width: 100%;
      min-width: 0;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid #b59c86;
      background: #fffaf3;
      color: #3b2f24;
      font-size: 12px;
    }
    .lemouf-workflow-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 180px;
      overflow-y: auto;
      padding: 6px;
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: #fffaf3;
    }
    .lemouf-workflow-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      border: 1px solid #ccb7a3;
      background: #fcf6ee;
      color: #3b2f24;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 11px;
      text-align: left;
      cursor: pointer;
    }
    .lemouf-workflow-item:hover {
      background: #f3e5d5;
      border-color: #b79572;
    }
    .lemouf-workflow-item.is-selected {
      background: #efe0cf;
      border-color: #8a6b4f;
      box-shadow: inset 0 0 0 1px rgba(91, 70, 55, 0.35);
    }
    .lemouf-workflow-item-icon {
      flex: 0 0 auto;
      min-width: 42px;
      text-align: center;
      border: 1px solid #b59c86;
      border-radius: 999px;
      padding: 1px 6px;
      background: #f7ecdf;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      color: #5b4637;
    }
    .lemouf-workflow-item-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .lemouf-workflow-empty {
      font-size: 11px;
      color: #7b6857;
      padding: 8px 6px;
      border: 1px dashed #ccb7a3;
      border-radius: 8px;
      background: #fff8f0;
    }
    .lemouf-loop-pipeline-graph {
      border: 1px dashed #c9b9a8;
      border-radius: 12px;
      padding: 10px;
      background: #f9f2e8;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .lemouf-loop-pipeline-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .lemouf-loop-pipeline-col {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
    }
    .lemouf-loop-pipeline-step {
      border: 1px solid #b59c86;
      border-radius: 10px;
      background: #fffaf3;
      padding: 8px 10px;
      min-width: 140px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
    }
    .lemouf-loop-pipeline-step .role {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #5b4637;
      letter-spacing: 0.4px;
    }
    .lemouf-loop-pipeline-step .name {
      font-size: 12px;
      color: #3b2f24;
      word-break: break-word;
    }
    .lemouf-loop-pipeline-step .detail {
      font-size: 11px;
      color: #7a6756;
    }
    .lemouf-loop-step-index {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #7a6756;
    }
    .lemouf-loop-pipeline-step.is-active {
      border-color: #7a5a3c;
      background: #f0e2cf;
      box-shadow: 0 6px 16px rgba(70, 50, 30, 0.2);
    }
    .lemouf-loop-pipeline-step.is-selected {
      border-color: #8a6b4f;
      background: #f5eadb;
    }
    .lemouf-loop-pipeline-step.is-clickable {
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .lemouf-loop-pipeline-step.is-clickable:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(70, 50, 30, 0.2);
    }
    .lemouf-loop-pipeline-arrow {
      font-size: 16px;
      color: #9a846f;
      font-weight: 700;
      align-self: center;
    }
    .lemouf-loop-step-status {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.4px;
      padding: 2px 6px;
      border-radius: 999px;
      align-self: flex-start;
      color: #fff;
      background: #9a846f;
    }
    .lemouf-loop-step-status.ok { background: #4b7b4f; }
    .lemouf-loop-step-status.warn { background: #b07d3b; }
    .lemouf-loop-step-status.error { background: #a4473d; }
    .lemouf-loop-step-status.running { background: #5b6ea8; }
    .lemouf-loop-step-status.pending { background: #9a846f; }
    .lemouf-loop-footer {
      margin-top: auto;
      font-size: 8px;
      color: #7a6756;
      opacity: 0.85;
      text-align: right;
      padding-top: 6px;
      letter-spacing: 0.4px;
    }
    .lemouf-loop-action {
      position: relative;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-radius: 10px;
      padding: 7px 10px;
      border: 1px solid transparent;
      transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .lemouf-loop-action::before {
      display: inline-block;
      font-size: 12px;
    }
    .lemouf-loop-action.approve {
      background: linear-gradient(180deg, #2f7a4f, #246a43);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.approve::before { content: "✓"; }
    .lemouf-loop-action.reject {
      background: linear-gradient(180deg, #a03a2e, #8a2e24);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.reject::before { content: "✕"; }
    .lemouf-loop-action.replay {
      background: linear-gradient(180deg, #8a6b4f, #6d533b);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.15);
    }
    .lemouf-loop-action.replay::before { content: "↻"; }
    .lemouf-loop-action:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(40, 30, 20, 0.2);
      filter: brightness(1.03);
    }
    .lemouf-loop-action:active {
      transform: translateY(0);
      box-shadow: none;
    }
    .lemouf-loop-accordion {
      border: 1px solid #c7b7a6;
      border-radius: 10px;
      background: rgba(255, 250, 243, 0.6);
      padding: 6px;
      margin-bottom: 8px;
    }
    .lemouf-loop-accordion summary {
      cursor: pointer;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #5b4637;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lemouf-loop-accordion summary::-webkit-details-marker {
      display: none;
    }
    .lemouf-loop-accordion summary::before {
      content: "▸";
      font-size: 12px;
      transition: transform 120ms ease;
    }
    .lemouf-loop-accordion[open] summary::before {
      transform: rotate(90deg);
    }
    .lemouf-loop-field { font-size: 12px; }
    .lemouf-loop-field input, .lemouf-loop-field select, .lemouf-loop-field textarea {
      width: 100%;
      border-radius: 6px;
      border: 1px solid #b59c86;
      padding: 4px 6px;
      font-size: 12px;
      background: #fffaf3;
      color: #3b2f24;
    }
    .lemouf-loop-manifest {
      flex: 1;
      min-height: 140px;
      overflow: auto;
      background: #fffaf3;
      border: 1px solid #b59c86;
      border-radius: 8px;
      padding: 6px;
      font-size: 11px;
    }
    .lemouf-loop-status {
      font-size: 11px;
      color: #5b4637;
      white-space: pre-wrap;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .lemouf-workflow-profile-status {
      margin-top: 2px;
      margin-bottom: 2px;
      padding: 4px 6px;
      border-radius: 7px;
      border: 1px solid #c9b9a8;
      background: #fffaf3;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      font-size: 10px;
    }
    .lemouf-workflow-profile-status.is-ok {
      color: #4f6f50;
      border-color: #a7bca5;
      background: #f5fbf4;
    }
    .lemouf-workflow-profile-status.is-warning {
      color: #75553e;
      border-color: #ceb08f;
      background: #fff6e8;
    }
    .lemouf-workflow-diagnostics-panel {
      margin-top: 2px;
      margin-bottom: 2px;
    }
    .lemouf-loop-manifest-row {
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px dashed rgba(90, 70, 55, 0.25);
    }
    .lemouf-loop-manifest-row:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .lemouf-loop-gallery {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .lemouf-loop-cycle {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px dashed rgba(90, 70, 55, 0.25);
    }
    .lemouf-loop-cycle:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .lemouf-loop-cycle-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      margin-bottom: 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #3b2f24;
    }
    .lemouf-loop-cycle-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .lemouf-loop-result-card {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .lemouf-loop-thumb-actions {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      opacity: 0;
      transition: opacity 120ms ease;
      pointer-events: none;
    }
    .lemouf-loop-result-card:hover .lemouf-loop-thumb-actions {
      opacity: 1;
      pointer-events: auto;
    }
    .lemouf-loop-thumb-action {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid rgba(60, 45, 35, 0.2);
      background: rgba(255, 250, 243, 0.92);
      color: #3b2f24;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(20, 16, 12, 0.2);
      transition: transform 120ms ease, opacity 120ms ease;
    }
    .lemouf-loop-thumb-action.approve { color: #1f6a44; }
    .lemouf-loop-thumb-action.reject { color: #8a2e24; }
    .lemouf-loop-result-card.is-deciding .lemouf-loop-thumb-actions {
      opacity: 1;
    }
    .lemouf-loop-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 22px;
      height: 22px;
      margin: -11px 0 0 -11px;
      border-radius: 50%;
      border: 2px solid rgba(91, 70, 55, 0.25);
      border-top-color: rgba(91, 70, 55, 0.85);
      animation: lemouf-spin 0.8s linear infinite;
      display: none;
      pointer-events: none;
    }
    .lemouf-loop-result-card.is-loading .lemouf-loop-spinner,
    .lemouf-loop-preview.is-loading .lemouf-loop-spinner {
      display: block;
    }
    @keyframes lemouf-spin {
      to { transform: rotate(360deg); }
    }
    .lemouf-loop-result-badge {
      position: absolute;
      top: -6px;
      left: -6px;
      background: #5b4637;
      color: #f7f2ea;
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .lemouf-loop-result-badge.approve { background: #2f7a4f; }
    .lemouf-loop-result-badge.reject { background: #a03a2e; }
    .lemouf-loop-result-badge.replay { background: #8a6b4f; }
    .lemouf-loop-result-badge.queued { background: #6b6b6b; }
    .lemouf-loop-result-badge.running { background: #9a7b2f; }
    .lemouf-loop-result-badge.returned { background: #2f5f7a; }
    .lemouf-loop-result-badge.error { background: #7a2f2f; }
    .lemouf-loop-result-badge.pending { background: #5b4637; }
    .lemouf-loop-result-placeholder {
      width: 96px;
      height: 96px;
      border-radius: 6px;
      border: 1px dashed #b59c86;
      background: #fffaf3;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #7a6756;
      text-align: center;
      padding: 6px;
    }
    .lemouf-loop-thumb {
      width: 96px;
      height: 96px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #b59c86;
      background: #fff;
      cursor: pointer;
    }
    .lemouf-loop-preview {
      border: 1px solid #b59c86;
      border-radius: 10px;
      background: #fffaf3;
      padding: 6px;
      position: relative;
    }
    .lemouf-loop-preview-img {
      width: 100%;
      height: auto;
      max-height: 220px;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #d6c4b2;
      background: #fff;
      cursor: pointer;
      display: none;
    }
    .lemouf-loop-preview-empty {
      font-size: 11px;
      color: #7a6756;
      text-align: center;
      padding: 18px 8px;
    }
    .lemouf-loop-progress {
      border: 1px solid #b59c86;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px 8px;
      font-size: 11px;
    }
    .lemouf-loop-progress-track {
      position: relative;
      height: 10px;
      border-radius: 999px;
      background: #e7d7c6;
      overflow: hidden;
      margin-top: 6px;
    }
    .lemouf-loop-progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #5b4637, #8a6b4f);
      transition: width 120ms linear;
    }
    .lemouf-loop-progress.indeterminate .lemouf-loop-progress-bar {
      width: 35%;
      animation: lemouf-indeterminate 1.2s ease-in-out infinite;
    }
    @keyframes lemouf-indeterminate {
      0% { transform: translateX(-60%); }
      100% { transform: translateX(260%); }
    }
    .lemouf-loop-progress-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lemouf-loop-progress-node {
      font-weight: 600;
      color: #5b4637;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lemouf-loop-progress-state {
      color: #7a6756;
    }
    .lemouf-loop-lightbox {
      position: fixed;
      inset: 0;
      background: rgba(20, 16, 12, 0.78);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 24px;
    }
    .lemouf-loop-lightbox.is-open {
      display: flex;
    }
    .lemouf-loop-lightbox img {
      max-width: 92vw;
      max-height: 92vh;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: #fff;
    }
    .lemouf-loop-lightbox button {
      position: absolute;
      top: 16px;
      right: 16px;
      background: #f6f0e6;
      color: #3b2f24;
      border: 1px solid #c7b7a6;
      border-radius: 999px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .lemouf-loop-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 999px;
      background: #d7c1a8;
      font-size: 10px;
      margin-left: 6px;
    }
    .lemouf-loop-payload {
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: #fffaf3;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .lemouf-loop-payload-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .lemouf-loop-payload-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #7a6756;
      font-weight: 700;
    }
    .lemouf-loop-payload-pre {
      margin: 0;
      padding: 6px;
      border-radius: 8px;
      background: #f0e7db;
      border: 1px solid #d6c4b2;
      font-size: 11px;
      color: #3b2f24;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .lemouf-song2daw-overview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 2px;
    }
    .lemouf-song2daw-step-empty {
      grid-column: 1 / -1;
      font-size: 11px;
      color: #7a6756;
      border: 1px dashed #c9b9a8;
      border-radius: 8px;
      padding: 8px;
      background: #fffaf3;
    }
    .lemouf-song2daw-step-card {
      border: 1px solid #b59c86;
      border-radius: 8px;
      background: #fffaf3;
      color: #3b2f24;
      text-align: left;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
    }
    .lemouf-song2daw-step-card:hover {
      filter: brightness(0.98);
      box-shadow: 0 4px 10px rgba(40, 30, 20, 0.12);
    }
    .lemouf-song2daw-step-card.is-selected {
      border-color: #7a5a3c;
      background: #f2e5d4;
      box-shadow: inset 0 0 0 1px rgba(90, 70, 55, 0.2);
    }
    .lemouf-song2daw-step-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .lemouf-song2daw-step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.3px;
      background: #9a846f;
      color: #f7f2ea;
    }
    .lemouf-song2daw-step-badge.ok { background: #4b7b4f; }
    .lemouf-song2daw-step-badge.error { background: #a4473d; }
    .lemouf-song2daw-step-idx {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #7a6756;
    }
    .lemouf-song2daw-step-name {
      font-size: 11px;
      font-weight: 700;
      color: #3b2f24;
      word-break: break-word;
    }
    .lemouf-song2daw-step-sub {
      font-size: 10px;
      color: #7a6756;
      word-break: break-word;
    }
    .lemouf-song2daw-step-panel {
      border: 1px solid #c9b9a8;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .lemouf-song2daw-audio-preview {
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: linear-gradient(180deg, #fffaf3, #f3e7d8);
      padding: 7px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }
    .lemouf-song2daw-audio-preview .lemouf-loop-select {
      border-color: #bda995;
      background: #f7efe4;
      color: #493a2e;
    }
    .lemouf-song2daw-audio-preview-player {
      width: 100%;
      min-height: 34px;
      height: 38px;
      border-radius: 999px;
      background: linear-gradient(180deg, #6f665d, #5d544b);
      border: 1px solid #8d7b68;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.16),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2);
      accent-color: #a88a67;
      color-scheme: dark;
    }
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-enclosure {
      border-radius: 999px;
      background: transparent;
      border: none;
    }
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-panel {
      background: transparent;
      color: #f8efe2;
    }
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-current-time-display,
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-time-remaining-display {
      color: #f8efe2;
      font-size: 10px;
      text-shadow: none;
    }
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-timeline {
      filter: sepia(0.42) saturate(0.72) brightness(1.06);
    }
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-play-button,
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-mute-button,
    .lemouf-song2daw-audio-preview-player::-webkit-media-controls-overflow-button {
      filter: sepia(0.55) saturate(0.85) brightness(1.12);
    }
    .lemouf-song2daw-step-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #6b5a4a;
      font-weight: 700;
    }
    .lemouf-loop-btn.is-active {
      background: #5b4637;
      color: #f7f2ea;
      box-shadow: inset 0 0 0 1px rgba(20, 16, 12, 0.18);
    }
    .lemouf-song2daw-studio-body {
      border: 1px solid #d6c4b2;
      border-radius: 8px;
      background: #f8efe2;
      padding: 8px;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 10px;
      color: #4a3b2f;
      overflow: auto;
    }
    .lemouf-song2daw-studio-body.lemouf-song2daw-studio-body-compact {
      overflow: hidden;
      gap: 6px;
    }
    .lemouf-song2daw-studio-body.lemouf-song2daw-studio-body-compact .lemouf-song2daw-studio-layout {
      min-height: 120px;
    }
    .lemouf-song2daw-studio-body.lemouf-song2daw-studio-body-compact .lemouf-song2daw-arrange-canvas-wrap {
      min-height: 120px;
    }
    .lemouf-song2daw-studio-body.lemouf-song2daw-studio-body-compact .lemouf-song2daw-arrange-canvas {
      min-height: 120px;
    }
    .lemouf-song2daw-studio-meta {
      font-size: 10px;
      color: #6a5948;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-bottom: 1px dashed #c9b9a8;
      padding-bottom: 6px;
    }
    .lemouf-song2daw-studio-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      flex-wrap: wrap;
    }
    .lemouf-song2daw-studio-toolbar-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .lemouf-song2daw-viz-select {
      width: auto;
      min-width: 118px;
      max-width: 150px;
      padding: 5px 7px;
      font-size: 11px;
      flex: 0 0 auto;
    }
    .lemouf-song2daw-studio-toolbar-overview {
      font-size: 10px;
      color: #5f4e40;
      text-transform: uppercase;
      letter-spacing: 0.22px;
      min-width: 0;
      flex: 1 1 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1px solid #cfbeac;
      border-radius: 7px;
      background: #fffaf3;
      padding: 5px 7px;
    }
    .lemouf-song2daw-studio-toolbar-status {
      font-size: 10px;
      color: #5f4e40;
      text-transform: uppercase;
      letter-spacing: 0.25px;
      min-width: 0;
      flex: 1 1 180px;
      text-align: right;
    }
    .lemouf-song2daw-studio-footer {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #fffaf3;
      min-width: 0;
      padding: 5px 7px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .lemouf-song2daw-studio-footer-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 14px;
      min-width: 0;
    }
    .lemouf-song2daw-studio-footer-group {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .lemouf-song2daw-studio-footer-zoom {
      font-size: 10px;
      color: #5f4e40;
      text-transform: uppercase;
      letter-spacing: 0.22px;
      white-space: nowrap;
    }
    .lemouf-song2daw-studio-layout {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 220px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .lemouf-song2daw-arrange-canvas-wrap {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #f8efe2;
      min-height: 220px;
      overflow: hidden;
      position: relative;
      min-width: 0;
      flex: 1 1 auto;
    }
    .lemouf-song2daw-arrange-canvas {
      width: 100%;
      height: 100%;
      display: block;
      cursor: default;
      min-height: 220px;
    }
    .lemouf-song2daw-spectrum-canvas-wrap {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #f7ecdc;
      min-height: 220px;
      overflow: hidden;
      position: relative;
      min-width: 0;
      flex: 1 1 auto;
    }
    .lemouf-song2daw-spectrum-canvas {
      width: 100%;
      height: 100%;
      display: block;
      min-height: 220px;
      background: #f8efe2;
    }
    .lemouf-song2daw-studio-inspector {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 220px;
      overflow: auto;
      min-width: 0;
    }
    .lemouf-song2daw-inspector-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #5f4e40;
      font-weight: 700;
    }
    .lemouf-song2daw-inspector-grid {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 3px 5px;
      font-size: 10px;
    }
    .lemouf-song2daw-inspector-key {
      color: #7a6756;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      font-size: 9px;
    }
    .lemouf-song2daw-inspector-value {
      color: #3b2f24;
      word-break: break-word;
      font-size: 10px;
    }
    .lemouf-song2daw-inspector-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 2px;
    }
    .lemouf-song2daw-arrange {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .lemouf-song2daw-arrange-row {
      display: grid;
      grid-template-columns: 116px 1fr;
      gap: 6px;
      align-items: stretch;
      min-height: 34px;
    }
    .lemouf-song2daw-arrange-row.is-ruler {
      min-height: 22px;
      margin-bottom: 2px;
    }
    .lemouf-song2daw-arrange-row.is-sections {
      min-height: 30px;
      margin-bottom: 3px;
    }
    .lemouf-song2daw-arrange-head {
      border: 1px solid #cfbeac;
      border-radius: 7px;
      background: linear-gradient(180deg, #efe0cf, #e6d2be);
      padding: 4px 6px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-width: 0;
    }
    .lemouf-song2daw-arrange-head-name {
      font-size: 10px;
      font-weight: 700;
      color: #3b2f24;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-song2daw-arrange-head-sub {
      font-size: 9px;
      color: #705f4e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-song2daw-arrange-ruler {
      position: relative;
      border: 1px solid #cfbeac;
      border-radius: 7px;
      background: linear-gradient(180deg, #f1e3d2, #e8d7c3);
      min-height: 22px;
      overflow: hidden;
    }
    .lemouf-song2daw-arrange-ruler-mark {
      position: absolute;
      top: 3px;
      transform: translateX(-50%);
      font-size: 9px;
      color: #5e4d3e;
      user-select: none;
      pointer-events: none;
    }
    .lemouf-song2daw-arrange-lane {
      position: relative;
      border: 1px solid #cfbeac;
      border-radius: 7px;
      background: #fffaf3;
      min-height: 34px;
      overflow: hidden;
    }
    .lemouf-song2daw-arrange-lane.sections {
      min-height: 30px;
      background: linear-gradient(180deg, #f8ecdc, #f1dfca);
    }
    .lemouf-song2daw-arrange-grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }
    .lemouf-song2daw-arrange-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      transform: translateX(-0.5px);
      background: rgba(125, 101, 79, 0.24);
    }
    .lemouf-song2daw-arrange-line.minor {
      background: rgba(125, 101, 79, 0.12);
    }
    .lemouf-song2daw-arrange-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      transform: translateX(-1px);
      background: rgba(28, 28, 28, 0.55);
      z-index: 4;
      pointer-events: none;
    }
    .lemouf-song2daw-arrange-playhead.ruler {
      background: rgba(28, 28, 28, 0.65);
    }
    .lemouf-song2daw-arrange-section,
    .lemouf-song2daw-arrange-clip {
      position: absolute;
      left: 0;
      top: 4px;
      height: calc(100% - 8px);
      border-radius: 5px;
      border: 1px solid hsl(var(--clip-h, 35) 42% 32%);
      background: linear-gradient(
        180deg,
        hsl(var(--clip-h, 35) 62% 67%),
        hsl(var(--clip-h, 35) 58% 56%)
      );
      color: #1f1712;
      font-size: 9px;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 5px;
      z-index: 3;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
      user-select: none;
    }
    .lemouf-song2daw-arrange-section {
      --clip-h: 35;
      height: calc(100% - 7px);
      top: 3px;
      line-height: 19px;
      color: #f8f2e8;
      border-color: #6a513a;
      background: linear-gradient(180deg, #89694f, #71563f);
      font-weight: 700;
    }
    .lemouf-song2daw-arrange-empty {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 9px;
      color: #867260;
      z-index: 2;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .lemouf-song2daw-studio-note {
      font-size: 10px;
      color: #7a6756;
      padding-left: 2px;
    }
    .lemouf-song2daw-tracks-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .lemouf-song2daw-track-card {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .lemouf-song2daw-track-name {
      font-size: 11px;
      font-weight: 700;
      color: #3b2f24;
      word-break: break-word;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .lemouf-song2daw-track-color-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: 0 0 auto;
      border: 1px solid rgba(40, 30, 20, 0.26);
    }
    .lemouf-song2daw-track-meta {
      font-size: 10px;
      color: #6a5948;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .lemouf-song2daw-track-source {
      font-size: 10px;
      color: #6a5948;
      word-break: break-word;
    }
    @media (max-width: 900px) {
      .lemouf-song2daw-studio-toolbar-overview {
        flex: 1 1 100%;
      }
      .lemouf-song2daw-studio-toolbar-status {
        width: 100%;
        text-align: left;
      }
    }
    @media (max-width: 520px) {
      .lemouf-song2daw-overview {
        grid-template-columns: 1fr;
      }
      .lemouf-song2daw-tracks-grid {
        grid-template-columns: 1fr;
      }
      .lemouf-song2daw-arrange-row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      .lemouf-song2daw-arrange-head {
        min-height: 26px;
      }
    }
    `,
  ]);
  document.head.appendChild(style);
}
