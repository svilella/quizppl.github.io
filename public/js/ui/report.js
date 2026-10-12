import { h, pct, formatDuration, formatWhen, LETTERS } from "./dom.js";
import { questionBody, answerList, explanationPanel } from "./question.js";
import { PASS_MARK } from "./home.js";

/** Report di fine sessione: esito, dettaglio per materia, revisione domanda per domanda. */
export function renderReport(root, { bank, result, onHome, onRetryWrong, onRepeat }) {
  const passed = result.score >= PASS_MARK;
  const wrong = result.items.filter((x) => x.chosen !== null && !x.ok);
  const skipped = result.items.filter((x) => x.chosen === null).length;
  let filter = wrong.length ? "wrong" : "all";

  const subjects = Object.entries(result.bySubject)
    .map(([id, s]) => ({ ...bank.subjectById.get(id), ...s }))
    .sort((a, b) => a.code - b.code);

  const reviewList = h("ol", { class: "review-list", role: "list" });
  const drawReview = () => {
    const items = result.items.filter((x) => x.chosen !== null && (filter === "all" || !x.ok));
    reviewList.replaceChildren(...items.map((it) => reviewItem(it)));
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.f === filter)));
  };

  const reviewItem = (it) => {
    const q = bank.byId.get(it.qid);
    if (!q) return h("li", { class: "card muted" }, `Domanda ${it.qid} non più presente nel banco.`);
    const s = bank.subjectById.get(q.subject);
    const expl = explanationPanel(q);
    const details = h("div", { class: "review-detail", hidden: true },
      questionBody(q, bank, { lead: false }),
      answerList(q, { chosen: it.chosen }),
      expl.panel,
      h("div", { class: "review-actions" },
        h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => expl.toggle() }, "Spiegazione"),
      ),
    );
    const head = h("button", {
      class: "review-head", type: "button", "aria-expanded": "false",
      onclick: () => {
        details.hidden = !details.hidden;
        head.setAttribute("aria-expanded", String(!details.hidden));
      },
    },
      h("span", { class: `dot ${it.ok ? "is-ok" : "is-ko"}`, "aria-label": it.ok ? "corretta" : "errata" }),
      h("span", { class: "review-q" },
        h("span", { class: "review-meta" }, `${s.short} ${q.num}`),
        h("span", { class: "review-text" }, q.text.split("\n")[0]),
        !it.ok ? h("span", { class: "review-sub" }, `Hai risposto ${LETTERS[it.chosen]} · corretta ${LETTERS[q.correct]}`) : null,
      ),
      h("span", { class: "chev", "aria-hidden": "true" }),
    );
    return h("li", { class: "review-item" }, head, details);
  };

  const tabs = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Filtro revisione" },
    [["wrong", `Errori (${wrong.length})`], ["all", `Tutte (${result.total})`]].map(([f, label]) =>
      h("button", { type: "button", role: "radio", "data-f": f, onclick: () => { filter = f; drawReview(); } }, label)),
  );

  root.replaceChildren(...[
    h("header", { class: "quiz-bar" },
      h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: onHome }, "← Home"),
      h("div", { class: "quiz-count" }, "Report"),
      h("span", {}),
    ),
    h("section", { class: `card score ${passed ? "is-ok" : "is-ko"}` },
      h("div", { class: "score-main" },
        h("p", { class: "score-pct" }, pct(result.score)),
        h("p", { class: "score-line" }, h("strong", {}, `${result.correct} corrette su ${result.total}`),
          skipped ? ` · ${skipped} non risposte` : ""),
        h("p", { class: `pill ${passed ? "pill-ok" : "pill-ko"}` },
          passed ? "Sopra la soglia del 75%" : "Sotto la soglia del 75%"),
      ),
      h("dl", { class: "score-facts" },
        h("div", {}, h("dt", {}, "Durata"), h("dd", {}, formatDuration(result.ended - result.started))),
        h("div", {}, h("dt", {}, "Conclusa"), h("dd", {}, formatWhen(result.ended))),
        h("div", {}, h("dt", {}, "Media per domanda"), h("dd", {}, formatDuration((result.ended - result.started) / Math.max(1, result.total)))),
      ),
    ),
    subjects.length
      ? h("section", { class: "card", "aria-labelledby": "h-by-subject" },
          h("h2", { id: "h-by-subject" }, "Per materia"),
          h("ul", { class: "bars", role: "list" }, subjects.map((s) =>
            h("li", { class: "bar-row" },
              h("span", { class: "bar-label" }, h("b", {}, s.short), ` ${s.name}`),
              h("span", { class: "bar", "aria-hidden": "true" },
                h("span", { class: `bar-fill ${s.correct / s.total >= PASS_MARK ? "is-ok" : "is-ko"}`, style: { width: pct(s.correct / s.total) } }),
                h("span", { class: "bar-mark", style: { left: pct(PASS_MARK) } }),
              ),
              h("span", { class: "bar-value" }, `${s.correct}/${s.total}`),
            ),
          )),
        )
      : null,
    h("div", { class: "report-actions" },
      wrong.length ? h("button", { class: "btn btn-primary", type: "button", onclick: () => onRetryWrong(wrong.map((x) => x.qid)) }, `Ripeti gli errori (${wrong.length})`) : null,
      h("button", { class: wrong.length ? "btn btn-ghost" : "btn btn-primary", type: "button", onclick: onRepeat }, "Nuova sessione con le stesse impostazioni"),
    ),
    h("section", { class: "review", "aria-labelledby": "h-review" },
      h("div", { class: "panel-head" }, h("h2", { id: "h-review" }, "Revisione"), tabs),
      reviewList,
    ),
  ].filter(Boolean));
  drawReview();
  window.scrollTo({ top: 0 });
}
