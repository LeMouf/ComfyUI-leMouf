const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_MAP = {
  play: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M5 3.5v9l7-4.5z", fill: "currentColor" }],
    ],
  },
  pause: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "4", y: "3.5", width: "3", height: "9", rx: "1", fill: "currentColor" }],
      ["rect", { x: "9", y: "3.5", width: "3", height: "9", rx: "1", fill: "currentColor" }],
    ],
  },
  stop: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "4", y: "4", width: "8", height: "8", rx: "1.25", fill: "currentColor" }],
    ],
  },
  mouse_wheel: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "4.1", y: "1.9", width: "7.8", height: "12.2", rx: "3.8", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }],
      ["rect", { x: "7.2", y: "4", width: "1.6", height: "3", rx: "0.8", fill: "currentColor" }],
      ["path", { d: "M2.5 8h1.4M12.1 8h1.4", fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round" }],
    ],
  },
  arrows_lr: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.3 8h11.4", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }],
      ["path", { d: "M5 5.2 2.3 8 5 10.8", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "m11 5.2 2.7 2.8-2.7 2.8", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  drag: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M8 1.8v12.4M1.8 8h12.4", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round" }],
      ["path", { d: "m8 1.8 1.6 1.7M8 1.8 6.4 3.5M8 14.2l1.6-1.7M8 14.2l-1.6-1.7M1.8 8l1.7-1.6M1.8 8l1.7 1.6M14.2 8l-1.7-1.6M14.2 8l-1.7 1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["circle", { cx: "8", cy: "8", r: "1.5", fill: "currentColor" }],
    ],
  },
  key_ctrl: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "1.8", y: "2.2", width: "12.4", height: "11.6", rx: "2.4", fill: "none", stroke: "currentColor", "stroke-width": "1.2" }],
      ["path", { d: "M10.9 5.3a2.7 2.7 0 1 0 0 5.4", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
      ["path", { d: "M5.3 10.5V5.5h2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  key_shift: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "1.8", y: "2.2", width: "12.4", height: "11.6", rx: "2.4", fill: "none", stroke: "currentColor", "stroke-width": "1.2" }],
      ["path", { d: "M8 4.2 5.3 7h1.7v3h2v-3h1.7z", fill: "currentColor" }],
    ],
  },
  cut: {
    viewBox: "0 0 16 16",
    shapes: [
      ["circle", { cx: "4.6", cy: "11.2", r: "1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
      ["circle", { cx: "7.7", cy: "11.2", r: "1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
      ["path", { d: "M3.7 4.2 12.8 10M8.5 5.4l4.3-1.2M8.5 9.8l4.3 1.2", fill: "none", stroke: "currentColor", "stroke-width": "1.25", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  fit: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  skeleton_mode: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.1", y: "2.3", width: "11.8", height: "11.4", rx: "1.7", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }],
      ["path", { d: "M4 6.1h8M4 9.1h8M4 12h5.2", fill: "none", stroke: "currentColor", "stroke-width": "1.25", "stroke-linecap": "round" }],
      ["path", { d: "M5.2 3.7v9.2M8 3.7v9.2M10.8 3.7v5.4", fill: "none", stroke: "currentColor", "stroke-width": "1.1", "stroke-linecap": "round", opacity: "0.78" }],
    ],
  },
  zoom_reset: {
    viewBox: "0 0 16 16",
    shapes: [
      ["circle", { cx: "7", cy: "7", r: "4.5", fill: "none", stroke: "currentColor", "stroke-width": "1.5" }],
      ["path", { d: "M10.6 10.6L14 14", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }],
      ["path", { d: "M5.2 8a2.2 2.2 0 1 0 .2-2.8", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round" }],
      ["path", { d: "M4.7 3.7v2.1h2.1", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  snap_on: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M8 1.8l3 3-2 2.1L6 3.9zM6.2 6.6l3.2-3.2M2.7 8h10.6M4.1 10.7h7.8v2.4H4.1z", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "M10.9 11.9l1.1 1.2 2.2-2.5", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  snap_off: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M8 1.8l3 3-2 2.1L6 3.9zM6.2 6.6l3.2-3.2M2.7 8h10.6M4.1 10.7h7.8v2.4H4.1z", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "M3 13L13 3", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }],
    ],
  },
  refresh: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M12.6 6.5A4.9 4.9 0 1 0 13 9", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round" }],
      ["path", { d: "M12.7 2.8v3.4H9.3", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  undo: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M5.4 5.1H12a3 3 0 0 1 0 6h-2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "M5.4 5.1 7.8 2.9M5.4 5.1l2.4 2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  redo: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M10.6 5.1H4a3 3 0 0 0 0 6h2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "m10.6 5.1-2.4-2.2m2.4 2.2-2.4 2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  import_approved: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.2 5.1h11.6v7.7a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" }],
      ["path", { d: "M5.1 5.1V3.8a1 1 0 0 1 1-1h3.8a1 1 0 0 1 1 1v1.3", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
      ["path", { d: "M8 6.5v4.2", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
      ["path", { d: "M6.2 9.2L8 11l1.8-1.8", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  add_resource: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.3", y: "2.3", width: "11.4", height: "11.4", rx: "2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }],
      ["path", { d: "M8 4.6v6.8M4.6 8h6.8", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }],
    ],
  },
  view_grid: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.2", y: "2.2", width: "4.8", height: "4.8", rx: "0.9", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
      ["rect", { x: "9", y: "2.2", width: "4.8", height: "4.8", rx: "0.9", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
      ["rect", { x: "2.2", y: "9", width: "4.8", height: "4.8", rx: "0.9", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
      ["rect", { x: "9", y: "9", width: "4.8", height: "4.8", rx: "0.9", fill: "none", stroke: "currentColor", "stroke-width": "1.25" }],
    ],
  },
  monitor_center: {
    viewBox: "0 0 16 16",
    shapes: [
      ["circle", { cx: "8", cy: "8", r: "1.4", fill: "currentColor" }],
      ["path", { d: "M8 2.2v3M8 10.8v3M2.2 8h3M10.8 8h3", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
      ["circle", { cx: "8", cy: "8", r: "5.4", fill: "none", stroke: "currentColor", "stroke-width": "1.15", opacity: "0.62" }],
    ],
  },
  monitor_diagonal: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.2", y: "2.2", width: "11.6", height: "11.6", rx: "1.3", fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.72" }],
      ["path", { d: "M3.2 12.8 12.8 3.2", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
      ["path", { d: "M3.2 3.2 12.8 12.8", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
    ],
  },
  monitor_workarea: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "1.8", y: "2.2", width: "12.4", height: "11.6", rx: "1.8", fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.7" }],
      ["rect", { x: "4", y: "4.2", width: "8", height: "7.6", rx: "1.1", fill: "none", stroke: "currentColor", "stroke-width": "1.35" }],
      ["path", { d: "M8 2.2v1.6M8 12.2v1.6M1.8 8h1.6M12.6 8h1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round" }],
    ],
  },
  view_list: {
    viewBox: "0 0 16 16",
    shapes: [
      ["circle", { cx: "3.5", cy: "4", r: "1", fill: "currentColor" }],
      ["circle", { cx: "3.5", cy: "8", r: "1", fill: "currentColor" }],
      ["circle", { cx: "3.5", cy: "12", r: "1", fill: "currentColor" }],
      ["path", { d: "M6 4h7M6 8h7M6 12h7", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
    ],
  },
  clear_resources: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M5.2 5.2h5.6l-.5 7a1 1 0 0 1-1 .9H6.7a1 1 0 0 1-1-.9z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" }],
      ["path", { d: "M4.2 5.2h7.6M6.1 5.2V3.9a1 1 0 0 1 1-1h1.8a1 1 0 0 1 1 1v1.3", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
      ["path", { d: "M6.8 7.2v4.1M9.2 7.2v4.1", fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round" }],
    ],
  },
  save_project: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.3 2.3h9.2l2.2 2.2v9a1.2 1.2 0 0 1-1.2 1.2H3.5a1.2 1.2 0 0 1-1.2-1.2z", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linejoin": "round" }],
      ["rect", { x: "4.1", y: "2.8", width: "5.8", height: "3.1", rx: "0.5", fill: "none", stroke: "currentColor", "stroke-width": "1.2" }],
      ["rect", { x: "4", y: "8.3", width: "8", height: "4.3", rx: "0.7", fill: "none", stroke: "currentColor", "stroke-width": "1.2" }],
      ["path", { d: "M10.7 2.5v3.2h2.8", fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  export_render: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M3 11.8h10v1.8H3z", fill: "none", stroke: "currentColor", "stroke-width": "1.25", "stroke-linejoin": "round" }],
      ["path", { d: "M8 2.2v7.2", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round" }],
      ["path", { d: "M5.3 6.9 8 9.7l2.7-2.8", fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "M2.7 11.8h10.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
    ],
  },
  panel_max: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
  },
  panel_restore: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "3.3", y: "4.3", width: "7.5", height: "7", rx: "1", fill: "none", stroke: "currentColor", "stroke-width": "1.35" }],
      ["path", { d: "M6.5 2.7h6.8v6.6", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["path", { d: "M13.3 2.7L8.8 7.1", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
    ],
  },
  eye: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M1.6 8s2.2-3.4 6.4-3.4S14.4 8 14.4 8s-2.2 3.4-6.4 3.4S1.6 8 1.6 8z", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["circle", { cx: "8", cy: "8", r: "2", fill: "currentColor" }],
    ],
  },
  eye_off: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M1.6 8s2.2-3.4 6.4-3.4S14.4 8 14.4 8s-2.2 3.4-6.4 3.4S1.6 8 1.6 8z", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round", "stroke-linejoin": "round" }],
      ["circle", { cx: "8", cy: "8", r: "2", fill: "currentColor" }],
      ["path", { d: "M3 13L13 3", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }],
    ],
  },
  media_image: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.3", y: "3", width: "11.4", height: "10", rx: "1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }],
      ["circle", { cx: "6.1", cy: "6.5", r: "1.1", fill: "currentColor" }],
      ["path", { d: "M3.6 11.4l3.1-3 1.9 1.8 2.4-2.3 1.3 1.3v2.2H3.6z", fill: "currentColor" }],
    ],
  },
  media_audio: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.8 10.1h2.5L8.2 13V3L5.3 5.9H2.8z", fill: "currentColor" }],
      ["path", { d: "M9.8 6.2c1 .6 1 .9 1 1.8s0 1.2-1 1.8", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
      ["path", { d: "M11.6 4.8c1.7 1 1.7 1.8 1.7 3.2s0 2.2-1.7 3.2", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
    ],
  },
  media_video: {
    viewBox: "0 0 16 16",
    shapes: [
      ["rect", { x: "2.2", y: "3.2", width: "8.9", height: "9.6", rx: "1.3", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }],
      ["path", { d: "M7.9 6v4l2.9-2z", fill: "currentColor" }],
      ["path", { d: "M11.2 6.2l2.6-1.7v7l-2.6-1.7z", fill: "currentColor" }],
    ],
  },
  audio_on: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.5 10.2h2.4L7.8 13V3L4.9 5.8H2.5z", fill: "currentColor" }],
      ["path", { d: "M9.6 6.3c1 .5 1.2 1 1.2 1.7s-.2 1.2-1.2 1.7", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
      ["path", { d: "M11.4 5c1.5.8 2.1 1.7 2.1 3s-.6 2.2-2.1 3", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
    ],
  },
  audio_off: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.5 10.2h2.4L7.8 13V3L4.9 5.8H2.5z", fill: "currentColor" }],
      ["path", { d: "M10.2 6.2l3.1 3.1M13.3 6.2l-3.1 3.1", fill: "none", stroke: "currentColor", "stroke-width": "1.45", "stroke-linecap": "round" }],
    ],
  },
  audio_unknown: {
    viewBox: "0 0 16 16",
    shapes: [
      ["path", { d: "M2.5 10.2h2.4L7.8 13V3L4.9 5.8H2.5z", fill: "currentColor" }],
      ["path", { d: "M11.1 10.7v-.2a1 1 0 0 1 .5-.9 1.6 1.6 0 1 0-2.4-1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.35", "stroke-linecap": "round" }],
      ["circle", { cx: "11.1", cy: "12.3", r: "0.8", fill: "currentColor" }],
    ],
  },
};

export function createIcon(name, { className = "lemouf-icon", size = 14, title = "" } = {}) {
  const icon = ICON_MAP[name] || ICON_MAP.media_image;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (title) {
    const titleNode = document.createElementNS(SVG_NS, "title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);
  }
  for (const [tag, attrs] of icon.shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    svg.appendChild(node);
  }
  return svg;
}

export function setButtonIcon(button, {
  icon,
  title = "",
  size = 14,
} = {}) {
  if (!button) return;
  const iconName = String(icon || "");
  const currentName = String(button.dataset.iconName || "");
  const currentSize = String(button.dataset.iconSize || "");
  const nextSize = String(size);
  const currentTitle = String(button.getAttribute("title") || "");
  const nextTitle = String(title || "");
  const canReuse = currentName === iconName && currentSize === nextSize;
  if (!canReuse) {
    button.textContent = "";
    button.appendChild(createIcon(iconName, { className: "lemouf-btn-icon", size }));
    button.dataset.iconName = iconName;
    button.dataset.iconSize = nextSize;
  }
  if (title) {
    button.title = title;
    button.setAttribute("aria-label", title);
  } else if (currentTitle && !nextTitle) {
    button.removeAttribute("title");
    button.removeAttribute("aria-label");
  }
}
