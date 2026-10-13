/**
 * Componenti condivisi tra quiz e report: corpo della domanda,
 * risposte, figure e pannello spiegazione.
 */
import { h, LETTERS, miniMarkdown } from "./dom.js";
import { getExplanation } from "../data/bank.js";
import { openLightbox } from "./lightbox.js";
import { openIssueDialog } from "./issue.js";

const looksLikeCode = (s) => {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6;
};

export function questionBody(q, bank, { lead: showLead = true } = {}) {
  const [lead, ...tableHead] = q.text.split("\n");
  return h("div", { class: "q-body" },
    showLead ? h("p", { class: "q-text" }, lead) : null,
    tableHead.length ? h("p", { class: "q-keys" }, tableHead.join(" ")) : null,
    q.extra ? h("pre", { class: looksLikeCode(q.extra) ? "q-extra mono" : "q-extra" }, q.extra) : null,
    q.images?.length
      ? h("div", { class: "q-figures" }, q.images.map((name) => figure(bank.imageUrl(name), q)))
      : null,
  );
}

function figure(src, q) {
  const img = h("img", { src, alt: `Figura della domanda ${q.num}`, loading: "lazy", decoding: "async" });
  return h("button", {
    class: "q-figure",
    type: "button",
    title: "Ingrandisci",
    "aria-label": "Ingrandisci la figura",
    onclick: () => openLightbox(src, img.alt),
  }, img, h("span", { class: "zoom-hint", "aria-hidden": "true" }, "Ingrandisci"));
}

/**
 * Elenco risposte.
 *  - allenamento: dopo la scelta il pulsante scelto diventa rosso se sbagliato
 *    e la risposta corretta diventa verde (reveal automatico);
 *  - esame: la scelta resta solo evidenziata e si può cambiare (reveal: false);
 *  - report: reveal: true anche per le domande lasciate senza risposta.
 */
export function answerList(q, { chosen = null, onChoose, reveal = chosen !== null } = {}) {
  return h("ol", { class: "answers", role: "list" },
    q.answers.map((text, i) => {
      const state = reveal
        ? (i === q.correct ? "is-correct" : i === chosen ? "is-wrong" : "is-dim")
        : (i === chosen ? "is-selected" : "");
      const mark = !reveal ? null : i === q.correct ? "Corretta" : i === chosen ? "La tua risposta" : null;
      return h("li", {},
        h("button", {
          class: `answer ${state}`,
          type: "button",
          disabled: reveal || !onChoose,
          "aria-pressed": i === chosen ? "true" : "false",
          "data-index": i,
          onclick: () => onChoose?.(i),
        },
          h("span", { class: "answer-key" }, LETTERS[i]),
          h("span", { class: "answer-text" }, text),
          mark ? h("span", { class: "answer-mark" }, mark) : null,
        ),
      );
    }),
  );
}

/** Pannello spiegazione: carica il testo alla prima apertura. */
export function explanationPanel(q) {
  const body = h("div", { class: "expl-body" });
  const panel = h("div", { class: "explanation", hidden: true }, body);
  let loaded = false;

  async function toggle(force) {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    if (open && !loaded) {
      loaded = true;
      body.replaceChildren(h("p", { class: "muted" }, "Caricamento…"));
      const ex = await getExplanation(q.id);
      body.replaceChildren(...[
        ex
          ? h("div", { class: "prose", html: miniMarkdown(ex.text) })
          : h("div", { class: "expl-empty" },
              h("strong", {}, "Spiegazione non ancora disponibile."),
              h("p", {}, "Le spiegazioni verranno aggiunte in un secondo momento nel file data/explanations.json."),
            ),
        ex?.source ? h("p", { class: "expl-source" }, `Fonte: ${ex.source}`) : null,
      ].filter(Boolean));
    }
    return open;
  }
  return { panel, toggle };
}

/** Stellina "segna la domanda" + "segnala un errore", uguali in quiz, esame e report. */
export function questionTools(q, bank, store, { chosen = () => null } = {}) {
  const star = h("button", {
    class: "tool tool-star", type: "button",
    "aria-pressed": String(store.isFlagged(q.id)),
    title: "Segna la domanda per ripassarla",
    onclick: () => {
      const on = store.toggleFlag(q.id);
      star.setAttribute("aria-pressed", String(on));
      star.lastChild.textContent = on ? "Segnata" : "Segna";
    },
  },
    h("span", { class: "tool-icon", "aria-hidden": "true" }, "★"),
    h("span", {}, store.isFlagged(q.id) ? "Segnata" : "Segna"),
  );
  const report = h("button", {
    class: "tool", type: "button", title: "Segnala un errore in questa domanda",
    onclick: () => openIssueDialog(q, bank, { chosen: chosen() }),
  }, h("span", { class: "tool-icon", "aria-hidden": "true" }, "⚑"), h("span", {}, "Segnala errore"));
  return h("div", { class: "tools" }, star, report);
}
