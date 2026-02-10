import { el } from "./dom.js";

function formatPayloadValue(value) {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length > 4000) return `${text.slice(0, 4000)}\n… (truncated)`;
    return text;
  } catch {
    const text = String(value ?? "");
    if (text.length > 4000) return `${text.slice(0, 4000)}\n… (truncated)`;
    return text;
  }
}

export function createPayloadView({ buildImageSrc, openLightbox }) {
  const status = el("div", { class: "lemouf-loop-status", text: "" });
  const body = el("div", { class: "lemouf-loop-payload" });
  const root = el("div", { class: "lemouf-loop-screen", style: "display:none;" }, [
    el("div", { class: "lemouf-loop-title", text: "Payload preview" }),
    status,
    body,
  ]);

  const addBlock = (label, content) => {
    body.appendChild(el("div", { class: "lemouf-loop-payload-block" }, [
      el("div", { class: "lemouf-loop-payload-label", text: label }),
      content,
    ]));
  };

  const setEntry = (entry) => {
    body.innerHTML = "";
    status.textContent = "";
    if (!entry || !entry.outputs) {
      status.textContent = "No payload yet.";
      return;
    }
    const outputs = entry.outputs || {};

    if (Array.isArray(outputs.images) && outputs.images.length) {
      const gallery = el("div", { class: "lemouf-loop-gallery" });
      for (const image of outputs.images) {
        const fullSrc = buildImageSrc(image, false);
        const thumbSrc = buildImageSrc(image, true);
        const thumb = el("img", { class: "lemouf-loop-thumb", src: thumbSrc });
        thumb.addEventListener("click", () => openLightbox(fullSrc));
        gallery.appendChild(thumb);
      }
      addBlock(`Images (${outputs.images.length})`, gallery);
    }

    if (outputs.text) {
      addBlock("Text", el("pre", { class: "lemouf-loop-payload-pre", text: String(outputs.text) }));
    }

    if (outputs.json !== undefined) {
      const jsonValue = outputs.json;
      if (Array.isArray(jsonValue)) {
        status.textContent = `Payload entries: ${jsonValue.length}`;
      }
      addBlock("JSON", el("pre", { class: "lemouf-loop-payload-pre", text: formatPayloadValue(jsonValue) }));
    }

    if (outputs.audio !== undefined) {
      addBlock("Audio", el("pre", { class: "lemouf-loop-payload-pre", text: formatPayloadValue(outputs.audio) }));
    }

    if (outputs.video !== undefined) {
      addBlock("Video", el("pre", { class: "lemouf-loop-payload-pre", text: formatPayloadValue(outputs.video) }));
    }

    if (outputs.binary !== undefined) {
      addBlock("Binary", el("pre", { class: "lemouf-loop-payload-pre", text: formatPayloadValue(outputs.binary) }));
    }

    if (!body.children.length) {
      addBlock("Payload", el("pre", { class: "lemouf-loop-payload-pre", text: formatPayloadValue(outputs) }));
    }
  };

  return {
    root,
    setEntry,
    setStatus: (msg) => {
      status.textContent = msg || "";
    },
  };
}
