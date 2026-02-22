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
      --lemouf-scrollbar-size: 8px;
      --lemouf-scrollbar-thumb: #9a846f;
      --lemouf-scrollbar-track: transparent;
    }
    .lemouf-song2daw-dock {
      --lemouf-scrollbar-size: 8px;
      --lemouf-scrollbar-thumb: #9a846f;
      --lemouf-scrollbar-track: transparent;
    }
    .lemouf-loop-panel *,
    .lemouf-song2daw-dock * {
      scrollbar-width: thin;
      scrollbar-color: var(--lemouf-scrollbar-thumb) var(--lemouf-scrollbar-track);
    }
    .lemouf-loop-panel *::-webkit-scrollbar,
    .lemouf-song2daw-dock *::-webkit-scrollbar {
      width: var(--lemouf-scrollbar-size);
      height: var(--lemouf-scrollbar-size);
    }
    .lemouf-loop-panel *::-webkit-scrollbar-track,
    .lemouf-song2daw-dock *::-webkit-scrollbar-track {
      background: var(--lemouf-scrollbar-track);
    }
    .lemouf-loop-panel *::-webkit-scrollbar-thumb,
    .lemouf-song2daw-dock *::-webkit-scrollbar-thumb {
      background: var(--lemouf-scrollbar-thumb);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .lemouf-workflow-list,
    .lemouf-loop-manifest,
    .lemouf-song2daw-overview,
    .lemouf-loop-payload,
    .lemouf-song2daw-detail-pre,
    .lemouf-song2daw-studio-body {
      scrollbar-gutter: stable both-edges;
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
    .lemouf-loop-prestart {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-song2daw-detail-screen {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-song2daw-detail-layout {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-loop-poststart {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      gap: 8px;
      overflow: hidden;
    }
    .lemouf-loop-poststart-top {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
      overflow: hidden;
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
    .lemouf-song2daw-dock-content {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .lemouf-loop-composition-panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .lemouf-loop-composition-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }
    .lemouf-loop-composition-main-split {
      --lemouf-composition-row-split: 50%;
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-rows:
        minmax(180px, calc(var(--lemouf-composition-row-split) - 5px))
        10px
        minmax(180px, calc(100% - var(--lemouf-composition-row-split) - 5px));
      gap: 8px;
      align-items: stretch;
    }
    .lemouf-loop-composition-main-split > .lemouf-loop-composition-resources,
    .lemouf-loop-composition-main-split > .lemouf-loop-composition-top-deck,
    .lemouf-loop-composition-main-split > .lemouf-loop-composition-editor-body {
      min-height: 0;
      height: 100%;
    }
    .lemouf-loop-composition-main-split.is-row-resizing {
      user-select: none;
      cursor: row-resize;
    }
    .lemouf-loop-composition-top-deck {
      --lemouf-composition-split: 50%;
      display: grid;
      grid-template-columns:
        minmax(280px, calc(var(--lemouf-composition-split) - 5px))
        10px
        minmax(280px, calc(100% - var(--lemouf-composition-split) - 5px));
      gap: 8px;
      min-height: 0;
      align-items: stretch;
    }
    .lemouf-loop-composition-top-deck.is-resizing {
      user-select: none;
      cursor: col-resize;
    }
    .lemouf-loop-composition-splitter {
      position: relative;
      border: 1px solid #c9b9a8;
      border-radius: 999px;
      background: linear-gradient(180deg, #f6ecde, #e8d9c6);
      cursor: col-resize;
      touch-action: none;
      min-height: 0;
      outline: none;
      transition: filter 120ms ease, box-shadow 120ms ease;
    }
    .lemouf-loop-composition-splitter::before {
      content: "";
      position: absolute;
      inset: 4px 2px;
      border-radius: 999px;
      border: 1px dashed rgba(120, 95, 72, 0.5);
      opacity: 0.75;
    }
    .lemouf-loop-composition-splitter:hover,
    .lemouf-loop-composition-splitter:focus-visible {
      filter: brightness(0.98);
      box-shadow: 0 0 0 2px rgba(126, 95, 67, 0.2);
    }
    .lemouf-loop-composition-row-splitter {
      position: relative;
      border: 1px solid #c9b9a8;
      border-radius: 999px;
      background: linear-gradient(180deg, #f6ecde, #e8d9c6);
      cursor: row-resize;
      touch-action: none;
      min-height: 0;
      outline: none;
      transition: filter 120ms ease, box-shadow 120ms ease;
    }
    .lemouf-loop-composition-row-splitter::before {
      content: "";
      position: absolute;
      inset: 2px 4px;
      border-radius: 999px;
      border: 1px dashed rgba(120, 95, 72, 0.5);
      opacity: 0.75;
    }
    .lemouf-loop-composition-row-splitter:hover,
    .lemouf-loop-composition-row-splitter:focus-visible {
      filter: brightness(0.98);
      box-shadow: 0 0 0 2px rgba(126, 95, 67, 0.2);
    }
    .lemouf-loop-composition-resources {
      --lemouf-resource-card-min: 168px;
      --lemouf-resource-thumb-ratio: 1 / 1;
      border: 1px solid #cdbba9;
      border-radius: 10px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
      height: 100%;
    }
    .lemouf-loop-composition-resources[data-size-mode="small"] {
      --lemouf-resource-card-min: 112px;
      --lemouf-resource-thumb-ratio: 1 / 1;
    }
    .lemouf-loop-composition-resources[data-size-mode="large"] {
      --lemouf-resource-card-min: 172px;
      --lemouf-resource-thumb-ratio: 1 / 1;
    }
    .lemouf-loop-composition-resources.is-monitor-detached {
      flex: 0 0 auto;
      height: auto;
      min-height: 0;
    }
    .lemouf-loop-composition-resources-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lemouf-loop-composition-gate-row {
      display: flex;
      align-items: stretch;
    }
    .lemouf-loop-composition-resources-actions {
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
      gap: 6px;
      justify-content: space-between;
      min-height: 0;
      padding-left: 2px;
    }
    .lemouf-loop-composition-resources-actions-top,
    .lemouf-loop-composition-resources-actions-bottom {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .lemouf-loop-composition-resources-content {
      display: flex;
      align-items: stretch;
      gap: 8px;
      min-height: 0;
      flex: 1 1 auto;
    }
    .lemouf-loop-composition-resources.is-monitor-detached .lemouf-loop-composition-resources-content {
      flex: 0 0 auto;
    }
    .lemouf-loop-composition-top-deck .lemouf-loop-composition-resources {
      min-height: 0;
      height: 100%;
    }
    .lemouf-loop-composition-top-deck .lemouf-loop-composition-resources-content {
      flex: 1 1 auto;
      min-height: 0;
    }
    .lemouf-loop-composition-action-btn {
      width: 34px;
      min-width: 34px;
      height: 34px;
      min-height: 34px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .lemouf-loop-composition-action-btn .lemouf-btn-icon {
      width: 15px;
      height: 15px;
    }
    .lemouf-loop-composition-gate-btn {
      background: linear-gradient(180deg, #2f7a4f, #246a43);
      color: #f7f2ea;
      border-color: rgba(0, 0, 0, 0.16);
      font-weight: 700;
      letter-spacing: 0.28px;
      text-transform: uppercase;
    }
    .lemouf-loop-composition-resources-meta {
      font-size: 11px;
      color: #705a47;
      opacity: 0.9;
      white-space: nowrap;
    }
    .lemouf-loop-composition-resources-rail {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--lemouf-resource-card-min), 1fr));
      grid-auto-rows: max-content;
      gap: 8px;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 1px 6px 4px 1px;
      align-content: start;
    }
    .lemouf-loop-composition-resources.is-monitor-detached .lemouf-loop-composition-resources-rail {
      max-height: min(30vh, 240px);
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resources-rail {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-x: hidden;
      overflow-y: auto;
      padding-right: 6px;
    }
    .lemouf-loop-composition-resource {
      position: relative;
      flex: 0 0 auto;
      width: auto;
      min-width: 0;
      border: 1px solid #b9a492;
      border-radius: 8px;
      background: #f8eee0;
      color: #3b2f24;
      padding: 0;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      grid-template-rows: auto auto;
      align-items: stretch;
      min-height: 84px;
      overflow: hidden;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-label {
      border-top: 0;
      border-left: 1px solid rgba(150, 125, 103, 0.2);
      padding: 8px 8px 2px;
      background: transparent;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
      white-space: normal;
      word-break: break-word;
      line-height: 1.25;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-duration-inline {
      border-top: 0;
      border-left: 1px solid rgba(150, 125, 103, 0.2);
      padding: 0 8px 8px;
      background: transparent;
      text-align: left;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-kind {
      top: 6px;
      right: 6px;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-duration {
      left: 6px;
      bottom: 6px;
    }
    .lemouf-loop-composition-resource:hover {
      filter: brightness(0.98);
    }
    .lemouf-loop-composition-resource-kind {
      position: absolute;
      top: 5px;
      right: 5px;
      z-index: 1;
      border-radius: 999px;
      border: 1px solid #bda996;
      background: rgba(246, 235, 220, 0.94);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0;
      color: #6f5b49;
    }
    .lemouf-loop-composition-resource-kind-icon {
      width: 12px;
      height: 12px;
      display: block;
    }
    .lemouf-loop-composition-resource-kind.image {
      border-color: #bda996;
      background: rgba(246, 235, 220, 0.94);
      color: #6f5b49;
    }
    .lemouf-loop-composition-resource-kind.audio {
      border-color: #9fb7cc;
      background: rgba(227, 237, 247, 0.94);
      color: #34506b;
    }
    .lemouf-loop-composition-resource-kind.video {
      border-color: #c1ad90;
      background: rgba(241, 230, 212, 0.94);
      color: #6a533c;
    }
    .lemouf-loop-composition-resource-kind.video.is-with_audio {
      border-color: #95b79e;
      background: rgba(228, 242, 231, 0.94);
      color: #35543d;
    }
    .lemouf-loop-composition-resource-kind.video.is-no_audio {
      border-color: #c1ad90;
      background: rgba(241, 230, 212, 0.94);
      color: #6a533c;
    }
    .lemouf-loop-composition-resource-kind.video.is-unknown {
      border-color: #9fb7cc;
      background: rgba(227, 237, 247, 0.94);
      color: #34506b;
    }
    .lemouf-loop-composition-resource-thumb,
    .lemouf-loop-composition-resource-fallback {
      width: 100%;
      aspect-ratio: var(--lemouf-resource-thumb-ratio, 1 / 1);
      object-fit: cover;
      background: #efe2d1;
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 700;
      color: #6e5a48;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .lemouf-loop-composition-resource-thumb-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: var(--lemouf-resource-thumb-ratio, 1 / 1);
      overflow: hidden;
      background: #efe2d1;
    }
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-thumb-wrap,
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-thumb,
    .lemouf-loop-composition-resources[data-view-mode="list"] .lemouf-loop-composition-resource-fallback {
      width: 84px;
      height: 84px;
      aspect-ratio: auto;
    }
    .lemouf-loop-composition-resource-audio-flag {
      position: absolute;
      top: 5px;
      left: 5px;
      z-index: 2;
      min-width: 20px;
      height: 20px;
      border-radius: 999px;
      border: 1px solid #bda996;
      background: rgba(246, 235, 220, 0.95);
      color: #6f5b49;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(35, 26, 18, 0.16);
    }
    .lemouf-loop-composition-resource-audio-flag-icon {
      width: 12px;
      height: 12px;
      display: block;
    }
    .lemouf-loop-composition-resource-audio-flag.is-with_audio {
      border-color: #95b79e;
      background: rgba(228, 242, 231, 0.96);
      color: #2f5b3a;
    }
    .lemouf-loop-composition-resource-audio-flag.is-no_audio {
      border-color: #c8a793;
      background: rgba(245, 233, 226, 0.96);
      color: #6b4a37;
    }
    .lemouf-loop-composition-resource-audio-flag.is-unknown {
      border-color: #9fb7cc;
      background: rgba(227, 237, 247, 0.96);
      color: #34506b;
    }
    .lemouf-loop-composition-resource-duration {
      position: absolute;
      left: 5px;
      bottom: 5px;
      z-index: 2;
      border-radius: 999px;
      border: 1px solid rgba(116, 94, 74, 0.55);
      background: rgba(248, 240, 229, 0.94);
      color: #5d4b3b;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 1px 7px;
      line-height: 1.25;
      box-shadow: 0 1px 2px rgba(30, 21, 14, 0.14);
    }
    .lemouf-loop-composition-resource-thumb-wrap .lemouf-loop-composition-resource-thumb {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      aspect-ratio: auto;
      transition: opacity 180ms ease;
    }
    .lemouf-loop-composition-resource-thumb-video {
      opacity: 0;
      pointer-events: none;
    }
    .lemouf-loop-composition-resource.is-video-no-poster .lemouf-loop-composition-resource-thumb-video {
      opacity: 1;
    }
    .lemouf-loop-composition-resource.is-video-previewing .lemouf-loop-composition-resource-thumb-video {
      opacity: 1;
    }
    .lemouf-loop-composition-resource.is-video-previewing .lemouf-loop-composition-resource-thumb-wrap img {
      opacity: 0.32;
    }
    .lemouf-loop-composition-resource-label {
      font-size: 10px;
      color: #6b5948;
      border-top: 1px solid rgba(150, 125, 103, 0.28);
      background: rgba(255, 249, 240, 0.92);
      padding: 3px 6px 4px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-composition-resource-duration-inline {
      font-size: 9px;
      color: #705c49;
      background: rgba(253, 246, 237, 0.92);
      border-top: 1px solid rgba(150, 125, 103, 0.22);
      padding: 1px 5px 3px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      text-align: right;
      line-height: 1.2;
    }
    .lemouf-loop-composition-monitor {
      border: 1px solid #cdbba9;
      border-radius: 10px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
      height: 100%;
    }
    .lemouf-loop-composition-top-deck .lemouf-loop-composition-monitor {
      min-height: 0;
      height: 100%;
    }
    .lemouf-loop-composition-monitor.is-embedded-host {
      border: 0;
      border-radius: 0;
      background: transparent;
      padding: 0;
      gap: 6px;
      box-shadow: none;
    }
    .lemouf-loop-composition-monitor-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 13px;
    }
    .lemouf-loop-composition-monitor-status {
      display: block;
      flex: 1 1 min(65%, 420px);
      font-size: 10px;
      color: #6e5a48;
      text-transform: uppercase;
      letter-spacing: 0.24px;
      line-height: 1.2;
      min-height: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-composition-monitor-info {
      display: block;
      flex: 0 1 max(110px, 32%);
      min-width: 84px;
      font-size: 10px;
      color: #6f5d4d;
      text-transform: uppercase;
      letter-spacing: 0.22px;
      line-height: 1.2;
      min-height: 12px;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-composition-monitor-stage {
      position: relative;
      width: 100%;
      flex: 1 1 auto;
      min-height: 180px;
      max-height: none;
      aspect-ratio: auto;
      border: 1px solid rgba(150, 125, 103, 0.34);
      border-radius: 8px;
      overflow: hidden;
      background: #ece0d1;
      display: flex;
      align-items: center;
      justify-content: center;
      --lemouf-monitor-pasteboard-bg: #ece0d1;
      --lemouf-monitor-pasteboard-accent: rgba(86, 70, 56, 0.08);
      --lemouf-monitor-frame-bg: #0f0f0f;
      --lemouf-monitor-frame-outline: rgba(240, 230, 214, 0.16);
      --lemouf-monitor-frame-shadow: rgba(83, 64, 46, 0.16);
    }
    .lemouf-loop-composition-monitor-stage[data-bg="dark"] {
      --lemouf-monitor-pasteboard-bg: #1f1b18;
      --lemouf-monitor-pasteboard-accent: rgba(250, 238, 219, 0.08);
      --lemouf-monitor-frame-bg: #0b0a09;
      --lemouf-monitor-frame-outline: rgba(220, 200, 176, 0.24);
      --lemouf-monitor-frame-shadow: rgba(0, 0, 0, 0.45);
    }
    .lemouf-loop-composition-monitor-stage[data-bg="checker"] {
      --lemouf-monitor-pasteboard-bg:
        linear-gradient(45deg, rgba(247, 238, 225, 0.95) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(247, 238, 225, 0.95) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(239, 226, 208, 0.92) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(239, 226, 208, 0.92) 75%);
      --lemouf-monitor-pasteboard-accent: rgba(130, 106, 83, 0.08);
      --lemouf-monitor-frame-bg: #11110f;
      --lemouf-monitor-frame-outline: rgba(200, 176, 149, 0.28);
      --lemouf-monitor-frame-shadow: rgba(76, 60, 45, 0.26);
    }
    .lemouf-loop-composition-monitor-pasteboard {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: var(--lemouf-monitor-pasteboard-bg);
      background-size: 24px 24px;
    }
    .lemouf-loop-composition-monitor-pasteboard::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(
        135deg,
        transparent 0 48%,
        var(--lemouf-monitor-pasteboard-accent) 48% 52%,
        transparent 52% 100%
      );
      opacity: 0.66;
    }
    .lemouf-loop-composition-monitor-frame {
      position: relative;
      z-index: 1;
      width: min(100%, 960px);
      height: min(100%, 540px);
      max-width: 100%;
      max-height: 100%;
      border-radius: 4px;
      overflow: hidden;
      background: var(--lemouf-monitor-frame-bg);
      box-shadow:
        0 0 0 1px var(--lemouf-monitor-frame-outline),
        0 6px 20px -10px var(--lemouf-monitor-frame-shadow);
    }
    .lemouf-loop-composition-monitor-stage:not(.is-workarea-on) .lemouf-loop-composition-monitor-frame {
      box-shadow: 0 0 0 1px rgba(240, 230, 214, 0.12);
      border-radius: 2px;
    }
    .lemouf-loop-composition-monitor-stage:not(.is-workarea-on) .lemouf-loop-composition-monitor-pasteboard {
      opacity: 0.22;
    }
    .lemouf-loop-composition-monitor-frame.is-transform-enabled {
      cursor: grab;
      touch-action: none;
    }
    .lemouf-loop-composition-monitor-frame.is-transform-enabled.is-transform-mode-scale {
      cursor: ew-resize;
    }
    .lemouf-loop-composition-monitor-frame.is-transform-enabled.is-transform-mode-rotate {
      cursor: crosshair;
    }
    .lemouf-loop-composition-monitor-frame.is-transform-dragging {
      cursor: grabbing;
    }
    .lemouf-loop-composition-monitor-frame.is-transform-wheeling {
      box-shadow: 0 0 0 1px rgba(167, 142, 117, 0.52), 0 0 0 2px rgba(167, 142, 117, 0.24);
    }
    .lemouf-loop-composition-monitor.is-selection-solo .lemouf-loop-composition-monitor-frame {
      box-shadow: 0 0 0 1px rgba(119, 162, 126, 0.52), 0 0 0 2px rgba(119, 162, 126, 0.24);
    }
    .lemouf-loop-composition-monitor.is-selection-group .lemouf-loop-composition-monitor-frame {
      box-shadow: 0 0 0 1px rgba(112, 132, 186, 0.54), 0 0 0 2px rgba(112, 132, 186, 0.24);
    }
    .lemouf-loop-composition-monitor-stage.is-gap .lemouf-loop-composition-monitor-pasteboard {
      background: #090909;
      opacity: 1;
    }
    .lemouf-loop-composition-monitor-video {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #111;
      display: block;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
    }
    .lemouf-loop-composition-monitor-video.is-visible {
      visibility: visible;
      opacity: 1;
    }
    .lemouf-loop-composition-monitor-image {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #111;
      display: block;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
    }
    .lemouf-loop-composition-monitor-image.is-visible {
      visibility: visible;
      opacity: 1;
    }
    .lemouf-loop-composition-monitor-stage.is-fill .lemouf-loop-composition-monitor-video,
    .lemouf-loop-composition-monitor-stage.is-fill .lemouf-loop-composition-monitor-image {
      object-fit: cover;
    }
    .lemouf-loop-composition-monitor-guide {
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
    }
    .lemouf-loop-composition-monitor-stage.is-grid-on .lemouf-loop-composition-monitor-guide-grid {
      opacity: var(--lemouf-monitor-grid-opacity, 1);
      background-image:
        linear-gradient(
          to right,
          transparent 33.2%,
          rgba(235, 224, 205, 0.62) 33.2%,
          rgba(235, 224, 205, 0.62) 33.8%,
          transparent 33.8%,
          transparent 66.2%,
          rgba(235, 224, 205, 0.62) 66.2%,
          rgba(235, 224, 205, 0.62) 66.8%,
          transparent 66.8%
        ),
        linear-gradient(
          to bottom,
          transparent 33.2%,
          rgba(235, 224, 205, 0.62) 33.2%,
          rgba(235, 224, 205, 0.62) 33.8%,
          transparent 33.8%,
          transparent 66.2%,
          rgba(235, 224, 205, 0.62) 66.2%,
          rgba(235, 224, 205, 0.62) 66.8%,
          transparent 66.8%
        );
    }
    .lemouf-loop-composition-monitor-guide-safe::before,
    .lemouf-loop-composition-monitor-guide-safe::after {
      content: "";
      position: absolute;
      border: 1px dashed rgba(242, 230, 210, 0.78);
      border-radius: 1px;
    }
    .lemouf-loop-composition-monitor-guide-safe::before {
      inset: 8% 10%;
    }
    .lemouf-loop-composition-monitor-guide-safe::after {
      inset: 14% 16%;
      border-color: rgba(248, 236, 218, 0.54);
    }
    .lemouf-loop-composition-monitor-stage.is-safe-on .lemouf-loop-composition-monitor-guide-safe {
      opacity: var(--lemouf-monitor-safe-opacity, 1);
    }
    .lemouf-loop-composition-monitor-guide-center::before,
    .lemouf-loop-composition-monitor-guide-center::after {
      content: "";
      position: absolute;
      background: rgba(236, 225, 206, 0.86);
      box-shadow: 0 0 0 1px rgba(109, 89, 69, 0.16);
    }
    .lemouf-loop-composition-monitor-guide-center::before {
      left: 50%;
      top: 0;
      width: 1px;
      height: 100%;
      transform: translateX(-0.5px);
    }
    .lemouf-loop-composition-monitor-guide-center::after {
      left: 0;
      top: 50%;
      width: 100%;
      height: 1px;
      transform: translateY(-0.5px);
    }
    .lemouf-loop-composition-monitor-stage.is-center-on .lemouf-loop-composition-monitor-guide-center {
      opacity: var(--lemouf-monitor-center-opacity, 0.9);
    }
    .lemouf-loop-composition-monitor-guide-diagonal::before,
    .lemouf-loop-composition-monitor-guide-diagonal::after {
      content: "";
      position: absolute;
      left: -8%;
      width: 116%;
      height: 1px;
      transform-origin: 50% 50%;
      background: rgba(236, 225, 206, 0.8);
      box-shadow: 0 0 0 1px rgba(109, 89, 69, 0.12);
    }
    .lemouf-loop-composition-monitor-guide-diagonal::before {
      top: 50%;
      transform: rotate(32deg);
    }
    .lemouf-loop-composition-monitor-guide-diagonal::after {
      top: 50%;
      transform: rotate(-32deg);
    }
    .lemouf-loop-composition-monitor-stage.is-diagonal-on .lemouf-loop-composition-monitor-guide-diagonal {
      opacity: var(--lemouf-monitor-diagonal-opacity, 0.85);
    }
    .lemouf-loop-composition-monitor-empty {
      position: absolute;
      inset: 0;
      z-index: 4;
      pointer-events: none;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #7a6756;
      text-transform: uppercase;
      letter-spacing: 0.28px;
      text-align: center;
      line-height: 1.35;
      padding: 14px 12px;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    .lemouf-loop-composition-monitor-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      min-height: 30px;
    }
    .lemouf-loop-composition-monitor-actions-group {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .lemouf-loop-composition-monitor-actions-group[data-group]::before {
      content: attr(data-group);
      display: inline-block;
      margin-right: 2px;
      padding: 0 3px;
      border-radius: 999px;
      border: 1px solid rgba(147, 124, 104, 0.34);
      background: rgba(248, 240, 228, 0.9);
      font-size: 8px;
      line-height: 1.45;
      letter-spacing: 0.28px;
      text-transform: uppercase;
      color: #7b6552;
      white-space: nowrap;
    }
    .lemouf-loop-composition-monitor-actions-separator {
      flex: 0 0 1px;
      align-self: center;
      min-height: 24px;
      background: linear-gradient(
        180deg,
        rgba(145, 121, 98, 0),
        rgba(145, 121, 98, 0.58) 20%,
        rgba(145, 121, 98, 0.58) 80%,
        rgba(145, 121, 98, 0)
      );
    }
    .lemouf-loop-composition-monitor-action-btn {
      min-height: 28px;
      min-width: 32px;
      max-width: 32px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .lemouf-loop-composition-monitor-action-btn .lemouf-btn-icon {
      width: 14px;
      height: 14px;
    }
    .lemouf-loop-composition-monitor-config {
      border: 1px solid rgba(151, 126, 102, 0.32);
      border-radius: 7px;
      background: rgba(250, 243, 232, 0.86);
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .lemouf-loop-composition-monitor-config-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 14px;
    }
    .lemouf-loop-composition-monitor-transform-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 14px;
      margin-top: 2px;
    }
    .lemouf-loop-composition-monitor-config-title {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.24px;
      color: #6f5b49;
      white-space: nowrap;
    }
    .lemouf-loop-composition-monitor-transform-summary {
      font-size: 9px;
      color: #7d6753;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .lemouf-loop-composition-monitor-config-summary {
      font-size: 9px;
      color: #7d6753;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .lemouf-loop-composition-monitor-config-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px;
      min-width: 0;
    }
    .lemouf-loop-composition-monitor-config-row:first-of-type {
      grid-template-columns: minmax(0, 1.15fr) repeat(3, minmax(0, 0.8fr));
    }
    .lemouf-loop-composition-monitor-workspace-row {
      grid-template-columns: minmax(0, 1fr);
    }
    .lemouf-loop-composition-monitor-overlay-row {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .lemouf-loop-composition-monitor-mode-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .lemouf-loop-composition-monitor-transform-row {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .lemouf-loop-composition-monitor-transform-reset {
      min-height: 22px;
      padding: 0 8px;
      font-size: 10px;
      line-height: 1.1;
    }
    .lemouf-loop-composition-monitor-config .lemouf-loop-input {
      height: 22px;
      min-height: 22px;
      padding: 0 6px;
      font-size: 10px;
      line-height: 1.15;
    }
    .lemouf-loop-composition-monitor-config .lemouf-loop-input:disabled {
      opacity: 0.54;
    }
    .lemouf-loop-composition-monitor-config .lemouf-loop-composition-monitor-config-range {
      padding: 0 2px;
      height: 22px;
    }
    .lemouf-loop-composition-editor-body {
      flex: 1 1 auto;
      min-height: 0;
      border: 1px solid #cdbba9;
      border-radius: 10px;
      background: #f8eee0;
      overflow: hidden;
    }
    @media (max-width: 1180px) {
      .lemouf-loop-composition-main-split {
        grid-template-rows: minmax(220px, 46%) 10px minmax(220px, 1fr);
      }
      .lemouf-loop-composition-top-deck {
        grid-template-columns: minmax(0, 1fr);
      }
      .lemouf-loop-composition-splitter {
        display: none;
      }
      .lemouf-loop-composition-resources-content {
        min-height: 0;
      }
      .lemouf-loop-composition-resources-actions {
        justify-content: flex-start;
      }
      .lemouf-loop-composition-monitor-config-row,
      .lemouf-loop-composition-monitor-config-row:first-of-type {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
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
    .lemouf-home-card {
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: #fffaf3;
      padding: 8px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
    }
    .lemouf-song2daw-home-card {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .lemouf-song2daw-run-detail {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-song2daw-home-view {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-home-card-compact {
      padding: 6px;
    }
    .lemouf-home-card > label {
      margin-bottom: 0;
    }
    .lemouf-home-card .lemouf-loop-row.tight {
      margin-bottom: 0;
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
    .lemouf-loop-btn.debug {
      background: #6f8192;
      color: #f3f8ff;
    }
    .lemouf-loop-btn.debug:hover {
      background: #617585;
    }
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
    .lemouf-icon,
    .lemouf-btn-icon {
      display: inline-block;
      width: 14px;
      height: 14px;
      color: currentColor;
      vertical-align: middle;
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
      gap: 5px;
      max-height: 180px;
      overflow-y: auto;
      padding: 4px;
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: #fffaf3;
    }
    .lemouf-workflow-item {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      border: 1px solid #ccb7a3;
      background: #fcf6ee;
      color: #3b2f24;
      border-radius: 8px;
      padding: 4px 6px;
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
      min-width: 36px;
      text-align: center;
      border: 1px solid var(--lemouf-wf-badge-border, #b59c86);
      border-radius: 999px;
      padding: 1px 5px;
      background: var(--lemouf-wf-badge-bg, #f7ecdf);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      color: var(--lemouf-wf-badge-text, #5b4637);
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
    .lemouf-step-flow {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
      min-width: 0;
    }
    .lemouf-step-flow-song2daw {
      gap: 4px;
    }
    .lemouf-step-flow-card {
      border: 1px solid #b59c86;
      border-radius: 10px;
      background: #fffaf3;
      color: #3b2f24;
      text-align: left;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .lemouf-step-flow-card.is-selected {
      border-color: #7a5a3c;
      background: #f2e5d4;
      box-shadow: inset 0 0 0 1px rgba(90, 70, 55, 0.2);
    }
    .lemouf-step-flow-card.is-active {
      border-color: #7a5a3c;
      background: #f0e2cf;
      box-shadow: 0 6px 16px rgba(70, 50, 30, 0.2);
    }
    .lemouf-step-flow-card.is-clickable {
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .lemouf-step-flow-card.is-clickable:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(70, 50, 30, 0.2);
    }
    .lemouf-step-flow-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .lemouf-step-flow-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.3px;
      background: #9a846f;
      color: #f7f2ea;
    }
    .lemouf-step-flow-badge.ok { background: #4b7b4f; }
    .lemouf-step-flow-badge.error { background: #a4473d; }
    .lemouf-step-flow-badge.warn { background: #b07d3b; }
    .lemouf-step-flow-badge.running { background: #5b6ea8; }
    .lemouf-step-flow-badge.pending { background: #9a846f; }
    .lemouf-step-flow-index {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #7a6756;
    }
    .lemouf-step-flow-title {
      font-size: 13px;
      font-weight: 700;
      color: #3b2f24;
      word-break: break-word;
    }
    .lemouf-step-flow-sub {
      font-size: 11px;
      color: #665445;
      word-break: break-word;
    }
    .lemouf-step-flow-meta {
      font-size: 11px;
      color: #7a6756;
      word-break: break-word;
    }
    .lemouf-step-flow-arrow {
      align-self: center;
      font-size: 16px;
      color: #9a846f;
      font-weight: 700;
      line-height: 1;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-card {
      padding: 6px 8px;
      gap: 2px;
      border-radius: 9px;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-head {
      gap: 4px;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-badge {
      padding: 1px 7px;
      font-size: 9px;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-index {
      font-size: 9px;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-title {
      font-size: 12px;
      line-height: 1.15;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-sub,
    .lemouf-step-flow-song2daw .lemouf-step-flow-meta {
      font-size: 10px;
      line-height: 1.2;
    }
    .lemouf-step-flow-song2daw .lemouf-step-flow-arrow {
      font-size: 13px;
      margin: 0;
      opacity: 0.8;
      line-height: 1;
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
    .lemouf-advanced-block {
      border: 1px solid #d4c3b2;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    .lemouf-advanced-block .lemouf-loop-row.tight {
      margin-bottom: 0;
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
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      background: transparent;
      border: 0;
      border-radius: 0;
      margin-right: 0;
      padding-top: 8px;
      padding-bottom: 16px;
      padding-left: 11px;
      padding-right: 1px;
      font-size: 11px;
      scrollbar-gutter: stable;
    }
    .lemouf-loop-manifest-wrap {
      flex: 1 1 auto;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      position: relative;
      border: 1px solid #b59c86;
      border-radius: 10px;
      background: #fffaf3;
      --lemouf-cycle-head-bg: linear-gradient(180deg, #f5ebdf, #eee1d0);
      padding: 0;
      gap: 0;
    }
    .lemouf-loop-manifest-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 32px;
      margin: 0;
      border: 0;
      border-radius: 0;
      background: var(--lemouf-cycle-head-bg);
      padding: 8px;
    }
    .lemouf-loop-manifest-head.is-collapsible {
      cursor: pointer;
      user-select: none;
    }
    .lemouf-loop-manifest-head.is-collapsible:hover {
      filter: brightness(0.985);
    }
    .lemouf-loop-manifest-head-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      flex: 0 0 auto;
    }
    .lemouf-loop-manifest-caret {
      color: #756352;
      font-size: 11px;
      line-height: 1;
      transition: transform 120ms ease, opacity 120ms ease;
      width: 10px;
      text-align: center;
      flex: 0 0 auto;
    }
    .lemouf-loop-manifest-head-tools {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1 1 auto;
      justify-content: flex-end;
    }
    .lemouf-loop-manifest-head-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #6b5a4a;
      font-weight: 700;
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .lemouf-loop-manifest-head .lemouf-loop-manifest-status {
      margin: 0;
      min-height: 16px;
      line-height: 16px;
      flex: 1 1 auto;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: #5b4637;
      min-width: 0;
    }
    .lemouf-loop-manifest-runbtn {
      flex: 0 0 auto;
      min-width: 92px;
      padding: 4px 10px;
      font-size: 11px;
      line-height: 1.1;
      border-radius: 999px;
    }
    .lemouf-loop-manifest-head .lemouf-loop-manifest-status:empty {
      display: block;
    }
    .lemouf-loop-manifest-head .lemouf-loop-manifest-status:empty::before {
      content: "\\00a0";
    }
    .lemouf-loop-manifest-viewport {
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      border-top: 1px solid #d8c9b8;
      border-bottom: 1px solid #d8c9b8;
      border-left: 0;
      border-right: 0;
      border-radius: 0;
      background: #fffaf3;
      --lemouf-manifest-fade-size: 14px;
      --lemouf-manifest-radius: 0;
    }
    .lemouf-loop-manifest-wrap.is-collapsed .lemouf-loop-manifest-viewport,
    .lemouf-loop-manifest-wrap.is-collapsed .lemouf-loop-manifest-footer {
      display: none;
    }
    .lemouf-loop-manifest-wrap.is-collapsed {
      flex: 0 0 auto;
      min-height: 0;
      height: auto;
      overflow: visible;
    }
    .lemouf-loop-manifest-viewport::before,
    .lemouf-loop-manifest-viewport::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: var(--lemouf-manifest-fade-size);
      pointer-events: none;
      z-index: 2;
    }
    .lemouf-loop-manifest-viewport::before {
      top: 0;
      border-radius: var(--lemouf-manifest-radius) var(--lemouf-manifest-radius) 0 0;
      background: linear-gradient(
        180deg,
        rgba(255, 250, 243, 0.99) 0%,
        rgba(255, 250, 243, 0.94) 22%,
        rgba(255, 250, 243, 0.70) 58%,
        rgba(255, 250, 243, 0) 100%
      );
    }
    .lemouf-loop-manifest-viewport::after {
      bottom: 0;
      border-radius: 0 0 var(--lemouf-manifest-radius) var(--lemouf-manifest-radius);
      background: linear-gradient(
        0deg,
        rgba(255, 250, 243, 0.99) 0%,
        rgba(255, 250, 243, 0.94) 22%,
        rgba(255, 250, 243, 0.70) 58%,
        rgba(255, 250, 243, 0) 100%
      );
    }
    .lemouf-loop-manifest .lemouf-loop-cycle:last-child {
      margin-bottom: 8px;
    }
    .lemouf-loop-manifest-footer {
      display: flex;
      flex-direction: column;
      background: var(--lemouf-cycle-head-bg);
      border-radius: 0 0 10px 10px;
      border: 0;
      overflow: hidden;
      flex: 0 0 auto;
    }
    .lemouf-loop-manifest-footer .lemouf-loop-row {
      margin-bottom: 0;
    }
    .lemouf-loop-accordion-footer {
      margin: 0;
      border-radius: 0;
      border: 0;
      background: transparent;
      padding: 6px 8px;
      overflow: visible;
    }
    .lemouf-loop-accordion-footer > summary {
      padding-bottom: 0;
      margin-bottom: 0;
      border-bottom: 0;
      min-height: 18px;
    }
    .lemouf-loop-accordion-footer[open] > summary {
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px dashed rgba(90, 70, 55, 0.25);
    }
    .lemouf-loop-accordion-footer[open] {
      border-top: 1px solid #d8c9b8;
    }
    .lemouf-adv-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 8px;
    }
    .lemouf-adv-loopid {
      margin: 0;
      font-size: 11px;
      color: #5b4637;
      opacity: 0.95;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lemouf-adv-badges {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .lemouf-adv-badge {
      margin: 0;
      text-align: center;
      border: 1px solid #c8b8a7;
      background: #dccab5;
      color: #4a3a2f;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 3px 6px;
      border-radius: 999px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .lemouf-adv-grid {
      display: grid;
      gap: 6px;
      margin-bottom: 8px;
    }
    .lemouf-adv-grid-1 {
      grid-template-columns: 1fr;
    }
    .lemouf-adv-grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .lemouf-adv-grid .lemouf-loop-btn {
      min-height: 32px;
      padding: 6px 8px;
    }
    .lemouf-adv-sync-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(108px, 42%);
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
    }
    .lemouf-adv-sync-label {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #efe2d1;
      color: #5f4d3d;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
      padding: 7px 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-post-manifest-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .lemouf-loop-status {
      font-size: 11px;
      color: #5b4637;
      white-space: pre-wrap;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .lemouf-loop-status:empty {
      display: none;
      margin-top: 0;
      margin-bottom: 0;
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
      border-radius: 9px;
      overflow: hidden;
      padding: 0;
      border: 1px solid #c9b9a8;
      background: #fffaf3;
    }
    .lemouf-workflow-diagnostics-panel > summary {
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 34px;
      padding: 7px 10px;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid transparent;
      background: linear-gradient(180deg, #f7efe4, #f0e5d6);
    }
    .lemouf-workflow-diagnostics-panel > summary::-webkit-details-marker {
      display: none;
    }
    .lemouf-workflow-diagnostics-panel > summary::before {
      content: "▸";
      font-size: 11px;
      color: #756251;
      transition: transform 120ms ease;
      margin-right: 2px;
    }
    .lemouf-workflow-diagnostics-panel[open] > summary::before {
      transform: rotate(90deg);
    }
    .lemouf-workflow-diagnostics-panel[open] > summary {
      border-bottom-color: #d8c9b8;
    }
    .lemouf-workflow-diagnostics-summary-title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.45px;
      color: #655343;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-left: 2px;
    }
    .lemouf-workflow-diagnostics-summary-state {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 18px;
      max-width: 72%;
      border-radius: 999px;
      border: 1px solid #c9b9a8;
      padding: 2px 8px;
      font-size: 9px;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #665546;
      background: #efe5d7;
    }
    .lemouf-workflow-diagnostics-summary-state.is-neutral {
      color: #665546;
      background: #efe5d7;
      border-color: #ccb8a6;
    }
    .lemouf-workflow-diagnostics-summary-state.is-ok {
      color: #325b3d;
      background: #e4f2e7;
      border-color: #95b79e;
    }
    .lemouf-workflow-diagnostics-summary-state.is-warning {
      color: #6e5629;
      background: #fff1d9;
      border-color: #d8ba82;
    }
    .lemouf-workflow-diagnostics-summary-state.is-error {
      color: #7d2f2f;
      background: #fde7e7;
      border-color: #d4a0a0;
    }
    .lemouf-workflow-diagnostics-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px 9px;
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
      padding: 8px;
      border: 1px solid #ccb8a6;
      border-radius: 10px;
      background: #fffaf3;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-cycle:last-child {
      margin-bottom: 0;
    }
    .lemouf-loop-cycle-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid #bca690;
      border-radius: 8px;
      background: linear-gradient(180deg, #f5ebdf, #eee1d0);
      padding: 7px 9px;
      color: #3b2f24;
    }
    .lemouf-loop-cycle-header.is-clickable {
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .lemouf-loop-cycle-header.is-clickable:hover {
      border-color: #9f8367;
      box-shadow: 0 1px 0 rgba(58, 42, 30, 0.12);
      transform: translateY(-1px);
    }
    .lemouf-loop-cycle-head-main {
      display: inline-flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
    }
    .lemouf-loop-cycle-kicker {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.45px;
      color: #6f5d4d;
      font-weight: 700;
    }
    .lemouf-loop-cycle-value {
      font-size: 17px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.2px;
      color: #3b2f24;
      white-space: nowrap;
    }
    .lemouf-loop-cycle-state {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      font-weight: 700;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .lemouf-loop-cycle-state.current {
      color: #2f4f79;
      background: #e2ecff;
      border-color: #93abd4;
    }
    .lemouf-loop-cycle-state.done {
      color: #35543d;
      background: #e4f2e7;
      border-color: #95b79e;
    }
    .lemouf-loop-cycle-state.upcoming {
      color: #6d5a49;
      background: #efe5d7;
      border-color: #ccb8a6;
    }
    .lemouf-loop-cycle-state.in_progress {
      color: #7a5a1f;
      background: #fff1d9;
      border-color: #d8ba82;
    }
    .lemouf-loop-cycle-state.waiting {
      color: #6d5a49;
      background: #efe5d7;
      border-color: #ccb8a6;
    }
    .lemouf-loop-cycle-state.failed {
      color: #7d2f2f;
      background: #fde7e7;
      border-color: #d4a0a0;
    }
    .lemouf-loop-cycle.is-phase-upcoming {
      border-color: #ccb8a6;
      background: #fffaf3;
    }
    .lemouf-loop-cycle-header.is-phase-upcoming {
      border-color: #bca690;
      background: linear-gradient(180deg, #f5ebdf, #eee1d0);
    }
    .lemouf-loop-cycle.is-phase-done {
      border-color: #9db9a4;
      background: #f3faf4;
      box-shadow: inset 0 0 0 1px rgba(92, 136, 104, 0.14);
    }
    .lemouf-loop-cycle-header.is-phase-done {
      border-color: #9db9a4;
      background: linear-gradient(180deg, #edf8ef, #deefe1);
    }
    .lemouf-loop-cycle.is-phase-in_progress {
      border-color: #d1b07a;
      background: #fff8ea;
      box-shadow: inset 0 0 0 1px rgba(172, 128, 57, 0.14);
    }
    .lemouf-loop-cycle-header.is-phase-in_progress {
      border-color: #d1b07a;
      background: linear-gradient(180deg, #fff3dc, #f7e6c5);
    }
    .lemouf-loop-cycle.is-phase-failed {
      border-color: #cf9b9b;
      background: #fff1f1;
      box-shadow: inset 0 0 0 1px rgba(168, 77, 77, 0.18);
    }
    .lemouf-loop-cycle-header.is-phase-failed {
      border-color: #cf9b9b;
      background: linear-gradient(180deg, #fde8e8, #f6d9d9);
    }
    .lemouf-loop-cycle.is-current {
      border-color: #93abd4;
      box-shadow: inset 0 0 0 1px rgba(86, 116, 166, 0.22);
    }
    .lemouf-loop-cycle.is-selected {
      outline: 1px solid rgba(117, 145, 186, 0.55);
      outline-offset: -1px;
    }
    .lemouf-loop-cycle-header.is-current {
      border-color: #93abd4;
      background: linear-gradient(180deg, #ecf3ff, #dfeaff);
    }
    .lemouf-loop-cycle-header.is-selected {
      box-shadow: inset 0 0 0 1px rgba(93, 121, 164, 0.28);
    }
    .lemouf-loop-cycle.is-waiting {
      border-color: #ccb8a6;
      background: #fffaf3;
      box-shadow: inset 0 0 0 1px rgba(120, 98, 77, 0.12);
    }
    .lemouf-loop-cycle-header.is-waiting {
      border-color: #ccb8a6;
      background: linear-gradient(180deg, #f5ebdf, #eee1d0);
    }
    .lemouf-loop-cycle-strip {
      display: grid;
      grid-template-columns: repeat(var(--lemouf-cycle-cols, 2), minmax(0, 1fr));
      gap: 8px;
      align-items: start;
      justify-content: stretch;
    }
    .lemouf-loop-result-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0;
      width: 100%;
      min-width: 0;
      transition: opacity 300ms ease, filter 300ms ease, transform 160ms ease;
    }
    .lemouf-loop-result-card.is-off {
      opacity: 0.4;
      filter: saturate(0.82);
    }
    .lemouf-loop-result-card.is-off:hover {
      opacity: 1;
      filter: saturate(1);
    }
    .lemouf-loop-result-card.is-cycle-approved-focus {
      opacity: 1;
      filter: none;
      transform: translateY(-1px);
    }
    .lemouf-loop-result-card-retry {
      border: 1px dashed #b79e88;
      border-radius: 8px;
      background: #fff7ee;
      padding: 6px;
      gap: 6px;
      cursor: pointer;
    }
    .lemouf-loop-result-skeleton {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 6px;
      border: 1px dashed #baa18b;
      color: #7a6653;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      line-height: 1.25;
      text-align: center;
      padding: 12px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        linear-gradient(110deg, rgba(255, 250, 243, 0.4) 0%, rgba(255, 250, 243, 0.9) 20%, rgba(255, 250, 243, 0.4) 40%)
        #efe4d6;
      background-size: 220% 100%;
      animation: lemouf-skeleton-shimmer 1.3s linear infinite;
      cursor: pointer;
    }
    @keyframes lemouf-skeleton-shimmer {
      0% { background-position: 180% 0; }
      100% { background-position: -40% 0; }
    }
    .lemouf-loop-retry-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .lemouf-loop-retry-actions .lemouf-loop-btn {
      min-height: 28px;
      padding: 5px 8px;
      font-size: 11px;
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
    }
    .lemouf-loop-thumb-action {
      position: relative;
      z-index: 2;
      pointer-events: auto;
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
    .lemouf-loop-thumb-action::after {
      content: "";
      position: absolute;
      inset: -6px;
      border-radius: 999px;
      background: transparent;
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
    .lemouf-loop-result-badge.discard { background: #7a6f63; }
    .lemouf-loop-result-badge.reject { background: #a03a2e; }
    .lemouf-loop-result-badge.replay { background: #8a6b4f; }
    .lemouf-loop-result-badge.queued { background: #6b6b6b; }
    .lemouf-loop-result-badge.running { background: #9a7b2f; }
    .lemouf-loop-result-badge.returned { background: #2f5f7a; }
    .lemouf-loop-result-badge.error { background: #7a2f2f; }
    .lemouf-loop-result-badge.pending { background: #5b4637; }
    .lemouf-loop-result-badge.is-clickable {
      cursor: pointer;
      transition: transform 120ms ease, filter 120ms ease;
    }
    .lemouf-loop-result-badge.is-clickable:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }
    .lemouf-loop-result-placeholder {
      width: 100%;
      aspect-ratio: 1 / 1;
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
      width: 100%;
      aspect-ratio: 1 / 1;
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
      aspect-ratio: 1 / 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-loop-preview > * {
      min-width: 0;
    }
    .lemouf-loop-preview-img {
      width: 100%;
      height: 100%;
      max-height: none;
      flex: 1 1 auto;
      min-height: 0;
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
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lemouf-loop-preview-complete {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 2px;
    }
    .lemouf-loop-preview-complete-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #6f5d4d;
      font-weight: 700;
    }
    .lemouf-loop-preview-complete-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .lemouf-loop-preview-stat {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #c7b29d;
      background: #f4e8da;
      color: #5f4d3d;
      font-size: 10px;
      letter-spacing: 0.2px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .lemouf-loop-preview-complete-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 6px 10px 8px;
      border-radius: 8px;
      border: 1px solid #d7c6b4;
      background: #f7ede1;
      scrollbar-gutter: stable;
      box-sizing: border-box;
    }
    .lemouf-loop-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
      gap: 8px;
      align-items: start;
      width: 100%;
      min-width: 0;
    }
    .lemouf-loop-summary-card {
      display: flex;
      flex-direction: column;
      gap: 5px;
      border: 1px solid #ccb8a6;
      border-radius: 8px;
      background: #fffaf3;
      padding: 6px;
      min-width: 0;
    }
    .lemouf-loop-summary-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
    }
    .lemouf-loop-summary-cycle {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      font-weight: 700;
      color: #695846;
      white-space: nowrap;
    }
    .lemouf-loop-summary-retry {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid #c3ad97;
      background: #efe2d2;
      color: #6a5846;
      min-height: 16px;
      padding: 0 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.25px;
      font-weight: 700;
      flex: 0 0 auto;
    }
    .lemouf-loop-summary-media {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 7px;
      overflow: hidden;
      border: 1px solid #cbb6a1;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lemouf-loop-summary-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      cursor: pointer;
      transition: filter 120ms ease, transform 120ms ease;
    }
    .lemouf-loop-summary-thumb:hover {
      filter: saturate(1.05);
      transform: scale(1.01);
    }
    .lemouf-loop-summary-no-media {
      padding: 8px;
      font-size: 10px;
      color: #7b6857;
      text-transform: uppercase;
      letter-spacing: 0.25px;
      text-align: center;
    }
    .lemouf-loop-summary-meta {
      font-size: 10px;
      color: #6b5948;
      line-height: 1.2;
    }
    .lemouf-loop-summary-empty {
      width: 100%;
      min-height: 88px;
      border: 1px dashed #bea58e;
      border-radius: 8px;
      background: #fbf2e8;
      color: #7b6755;
      font-size: 11px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
    }
    .lemouf-loop-preview-complete-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-top: 2px;
    }
    .lemouf-loop-preview-complete-actions .lemouf-loop-btn {
      width: 100%;
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
    .lemouf-loop-lightbox-panel {
      position: relative;
      width: min(94vw, 980px);
      max-height: min(92vh, 860px);
      border-radius: 14px;
      border: 1px solid rgba(214, 196, 178, 0.7);
      background: linear-gradient(180deg, #f8eee2, #efe1cf);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
    }
    .lemouf-loop-lightbox-close {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      background: #f6f0e6;
      color: #3b2f24;
      border: 1px solid #c7b7a6;
      border-radius: 999px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .lemouf-loop-lightbox-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-right: 84px;
      min-height: 28px;
    }
    .lemouf-loop-lightbox-head-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .lemouf-loop-lightbox-cycle {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      color: #4a3b2f;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-lightbox-cycle-select {
      flex: 0 0 auto;
      min-width: 118px;
      max-width: 180px;
      height: 28px;
      border: 1px solid #b9a591;
      border-radius: 999px;
      background: #fffaf3;
      color: #4a3b2f;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.28px;
      padding: 0 10px;
    }
    .lemouf-loop-lightbox-cycle-select:focus {
      outline: 1px solid #8fa5d6;
      outline-offset: 1px;
    }
    .lemouf-loop-lightbox-status {
      position: static;
      top: auto;
      left: auto;
      flex: 0 0 auto;
      font-size: 10px;
      padding: 2px 8px;
      line-height: 1.2;
    }
    .lemouf-loop-lightbox-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .lemouf-loop-lightbox-nav .lemouf-loop-btn {
      min-width: 62px;
      padding: 5px 8px;
    }
    .lemouf-loop-lightbox-stage {
      position: relative;
      border-radius: 10px;
      border: 1px solid rgba(130, 105, 83, 0.28);
      background: #fbf5ec;
      min-height: min(56vh, 560px);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .lemouf-loop-lightbox-stage img {
      max-width: 100%;
      max-height: min(56vh, 560px);
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(38, 30, 22, 0.2);
      border: 1px solid rgba(130, 105, 83, 0.24);
      background: #fff;
    }
    .lemouf-loop-lightbox-skeleton {
      width: min(82vw, 540px);
      max-width: 100%;
      aspect-ratio: 1 / 1;
      font-size: 13px;
      letter-spacing: 0.4px;
      text-align: center;
      padding: 18px;
    }
    .lemouf-loop-lightbox-foot {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-loop-lightbox-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-height: 22px;
    }
    .lemouf-loop-lightbox-meta {
      font-size: 11px;
      color: #6f5d4d;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-loop-lightbox-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .lemouf-loop-lightbox-panel.is-cycle-mode .lemouf-loop-lightbox-actions {
      display: grid;
    }
    .lemouf-loop-lightbox-panel:not(.is-cycle-mode) .lemouf-loop-lightbox-actions {
      display: none;
    }
    .lemouf-loop-lightbox-panel:not(.is-cycle-mode) .lemouf-loop-lightbox-head {
      padding-right: 84px;
    }
    .lemouf-loop-lightbox-panel:not(.is-cycle-mode) .lemouf-loop-lightbox-nav {
      display: none;
    }
    @media (max-width: 640px) {
      .lemouf-loop-lightbox {
        padding: 10px;
      }
      .lemouf-loop-lightbox-panel {
        width: 100%;
        max-height: 100%;
        padding: 10px;
      }
      .lemouf-loop-lightbox-stage {
        min-height: min(52vh, 420px);
      }
      .lemouf-loop-lightbox-actions {
        grid-template-columns: 1fr;
      }
      .lemouf-loop-lightbox-nav .lemouf-loop-btn {
        min-width: 54px;
      }
      .lemouf-loop-lightbox-head {
        padding-right: 78px;
      }
      .lemouf-loop-lightbox-cycle-select {
        min-width: 96px;
        max-width: 140px;
      }
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
      display: block;
      min-width: 0;
      margin-top: 2px;
      max-height: min(48vh, 430px);
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
    }
    .lemouf-song2daw-home-card .lemouf-song2daw-overview {
      flex: 1 1 auto;
      min-height: 120px;
      max-height: none;
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
    .lemouf-song2daw-studio-panel {
      --lemouf-song2daw-compact-height: 170px;
      min-height: 0;
      overflow: hidden;
    }
    .lemouf-song2daw-studio-inline-resizer {
      display: none;
      height: 8px;
      border: 1px solid rgba(118, 96, 76, 0.3);
      border-radius: 6px;
      background:
        repeating-linear-gradient(
          90deg,
          rgba(94, 74, 56, 0.18) 0 5px,
          rgba(94, 74, 56, 0.05) 5px 10px
        );
      cursor: ns-resize;
      box-sizing: border-box;
    }
    .lemouf-song2daw-studio-panel.is-compact .lemouf-song2daw-studio-inline-resizer {
      display: block;
    }
    .lemouf-song2daw-audio-preview {
      border: 1px solid #c9b9a8;
      border-radius: 10px;
      background: linear-gradient(180deg, #fffaf3, #f3e7d8);
      padding: 7px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
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
    .lemouf-song2daw-detail-head {
      border: 1px solid #c9b9a8;
      border-radius: 8px;
      background: #fffaf3;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lemouf-song2daw-detail-head-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .lemouf-song2daw-detail-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      font-weight: 700;
      color: #3b2f24;
      word-break: break-word;
    }
    .lemouf-song2daw-detail-meta {
      font-size: 10px;
      color: #6b5a4a;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .lemouf-song2daw-detail-head-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lemouf-song2daw-detail-content-panel {
      flex: 1 1 50%;
      min-height: 110px;
      overflow: hidden;
    }
    .lemouf-song2daw-detail-summary-panel {
      flex: 1 1 50%;
      min-height: 110px;
      overflow: hidden;
    }
    .lemouf-tool-step-monitor-host {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      overflow: auto;
    }
    .lemouf-tool-step-monitor-host > .lemouf-loop-composition-monitor {
      width: 100%;
      min-width: 0;
    }
    .lemouf-tool-step-monitor-placeholder {
      border: 1px dashed rgba(142, 113, 84, 0.45);
      border-radius: 8px;
      background: #f7eddc;
      color: #6e5b49;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.24px;
      line-height: 1.35;
      min-height: 88px;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .lemouf-song2daw-detail-content-panel .lemouf-loop-composition-monitor {
      flex: 1 1 auto;
      min-height: 0;
    }
    .lemouf-song2daw-detail-content-panel .lemouf-loop-composition-monitor-stage {
      max-height: none;
      min-height: 220px;
      width: 100%;
      min-width: 220px;
    }
    .lemouf-song2daw-detail-pre {
      flex: 1 1 auto;
      min-height: 0;
      max-height: 100%;
      overflow: auto;
    }
    .lemouf-loop-btn.is-active {
      background: #5b4637;
      color: #f7f2ea;
      box-shadow: inset 0 0 0 1px rgba(20, 16, 12, 0.18);
    }
    .lemouf-loop-btn.debug.is-active {
      background: #4c6174;
      color: #f3f8ff;
      box-shadow: inset 0 0 0 1px rgba(25, 38, 50, 0.3);
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
      height: var(--lemouf-song2daw-compact-height, 170px);
      min-height: 96px;
      max-height: 440px;
      flex: 0 0 auto;
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
      line-height: 1.2;
      min-height: 12px;
      min-width: 0;
      flex: 1 1 180px;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lemouf-song2daw-studio-footer {
      border: 1px solid #cfbeac;
      border-radius: 8px;
      background: #fffaf3;
      min-width: 0;
      padding: 5px 7px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .lemouf-song2daw-studio-footer-actions {
      margin-left: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 14px;
      min-width: 0;
    }
    .lemouf-song2daw-studio-footer-shortcuts-wrap {
      flex: 1 1 auto;
      min-width: 0;
    }
    .lemouf-song2daw-studio-footer-shortcuts {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      overflow: hidden;
      font-size: 10px;
      color: #6a5948;
      letter-spacing: 0.18px;
      white-space: nowrap;
    }
    .lemouf-song2daw-shortcut-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid #d8c6b3;
      border-radius: 999px;
      background: #f6ede2;
      color: #5e4d3f;
      padding: 1px 6px;
      min-width: 0;
      flex: 0 0 auto;
    }
    .lemouf-song2daw-shortcut-icon {
      width: 12px;
      height: 12px;
      flex: 0 0 auto;
      color: #6b5747;
    }
    .lemouf-song2daw-shortcut-text {
      font-size: 9px;
      line-height: 1.2;
      letter-spacing: 0.18px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .lemouf-song2daw-track-context-menu {
      position: fixed;
      z-index: 2147483640;
      min-width: 180px;
      max-width: min(320px, 72vw);
      border: 1px solid rgba(136, 110, 86, 0.82);
      border-radius: 10px;
      background: #ece1d3;
      box-shadow: 0 12px 26px rgba(24, 17, 11, 0.24);
      padding: 6px;
      display: grid;
      gap: 5px;
      pointer-events: auto;
      isolation: isolate;
    }
    .lemouf-song2daw-track-context-menu-title {
      font-size: 10px;
      line-height: 1.2;
      color: #5e4c3c;
      letter-spacing: 0.24px;
      text-transform: uppercase;
      padding: 2px 4px 4px;
      border-bottom: 1px dashed rgba(136, 110, 86, 0.42);
      margin-bottom: 1px;
    }
    .lemouf-song2daw-track-context-menu-item {
      border: 1px solid rgba(133, 104, 76, 0.78);
      border-radius: 7px;
      background: #8a6f53;
      color: #f7f0e5;
      min-height: 26px;
      font-size: 11px;
      line-height: 1.1;
      padding: 5px 8px;
      text-align: left;
      cursor: pointer;
      pointer-events: auto;
    }
    .lemouf-song2daw-track-context-menu-item:hover {
      background: #7a6048;
    }
    .lemouf-song2daw-track-context-menu-item:disabled,
    .lemouf-song2daw-track-context-menu-item.is-disabled {
      opacity: 0.55;
      cursor: default;
      background: #ad9a84;
      color: #efe5d7;
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
