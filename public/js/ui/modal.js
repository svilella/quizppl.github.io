import { h } from "./dom.js";

/**
 * Finestra modale minima: chiusura con Esc, clic fuori o pulsante,
 * focus restituito all'elemento che l'ha aperta.
 */
let current = null;

export function openModal({ title, body, actions = [] }) {
  closeModal();
  const opener = document.activeElement;
  const titleId = `modal-${Date.now().toString(36)}`;
  const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("div", { class: "modal-head" },
      h("h2", { id: titleId }, title),
      h("button", { class: "btn btn-ghost btn-small", type: "button", "aria-label": "Chiudi", onclick: () => closeModal() }, "✕"),
    ),
    h("div", { class: "modal-body" }, body),
    actions.length ? h("div", { class: "modal-actions" }, actions) : null,
  );
  const backdrop = h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) closeModal(); } }, box);
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeModal(); } };
  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop);
  (box.querySelector("input, textarea, select, button:not([aria-label='Chiudi'])") || box).focus();
  current = { backdrop, onKey, opener };
  return closeModal;
}

export function closeModal() {
  if (!current) return;
  current.backdrop.remove();
  document.removeEventListener("keydown", current.onKey, true);
  current.opener?.focus?.({ preventScroll: true });
  current = null;
}

export const modalOpen = () => Boolean(current);
