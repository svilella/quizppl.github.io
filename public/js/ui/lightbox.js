import { h } from "./dom.js";

let box;

export function openLightbox(src, alt) {
  close();
  const img = h("img", { src, alt });
  box = h("div", {
    class: "lightbox",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": alt,
    onclick: (e) => { if (e.target === box || e.target.closest(".lb-close")) close(); },
  },
    h("button", { class: "lb-close", type: "button", "aria-label": "Chiudi" }, "Chiudi ✕"),
    h("div", { class: "lb-scroll" }, img),
  );
  document.body.append(box);
  document.addEventListener("keydown", onKey, true);
  box.querySelector(".lb-close").focus();
}

function onKey(e) {
  if (e.key === "Escape") { e.stopPropagation(); close(); }
}

export function close() {
  if (!box) return;
  box.remove();
  box = null;
  document.removeEventListener("keydown", onKey, true);
}

export const lightboxOpen = () => !!box;
