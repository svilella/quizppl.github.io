import { h, pct, formatDuration, formatWhen, LETTERS } from "./dom.js";
import { questionBody, answerList, explanationPanel, questionTools } from "./question.js";

/** Report di fine sessione: esito, dettaglio per materia, revisione domanda per domanda. */
export function renderReport(root, { bank, store, result, onHome, onRetryWrong, onRepeat }) {
  const passMark = result.passMark ?? bank.exam.passMark;
  const isExam = result.mode === "exam";
  const passed = result.passed ?? result.score >= passMark;
  const wrong = result.items.filter((x) => !x.ok && (isExam || x.chosen !== null));
  const skipped = result.items.filter((x) => x.chosen === null).length;
  const reviewable = result.items.filter((x) => isExam || x.chosen !== null);
  let filter = wrong.length ? "wrong" : "all";

  const subjects = Object.entries(result.bySubject)
    .map(([id, s]) => ({ ...bank.subjectById.get(id), ...s, passed: s.passed ?? s.correct / s.total >= passMark }))
    .sort((a, b) => a.code - b.code);
  const failedSubjects = subjects.filter((s) => !s.passed);

  const reviewList = h("ol", { class: "review-list", role: "list" });
  const drawReview = () => {
    const items = reviewable.filter((x) => filter === "all" || !x.ok);
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
      answerList(q, { chosen: it.chosen, reveal: true }),
      expl.panel,
      h("div", { class: "review-actions" },
        h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => expl.toggle() }, "Spiegazione"),
        questionTools(q, bank, store, { chosen: () => it.chosen }),
      ),
    );
    const sub = it.ok ? null
      : it.chosen === null ? `Senza risposta · corretta ${LETTERS[q.correct]}`
      : `Hai risposto ${LETTERS[it.chosen]} · corretta ${LETTERS[q.correct]}`;
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
        sub ? h("span", { class: "review-sub" }, sub) : null,
      ),
      h("span", { class: "chev", "aria-hidden": "true" }),
    );
    return h("li", { class: "review-item" }, head, details);
  };

  const tabs = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Filtro revisione" },
    [["wrong", `Errori (${wrong.length})`], ["all", `Tutte (${reviewable.length})`]].map(([f, label]) =>
      h("button", { type: "button", role: "radio", "data-f": f, onclick: () => { filter = f; drawReview(); } }, label)),
  );

  const verdict = isExam
    ? (passed ? "Esame superato" : failedSubjects.length === subjects.length ? "Esame non superato"
        : `Non superato in ${failedSubjects.map((s) => s.short).join(", ")}`)
    : (passed ? `Sopra la soglia del ${pct(passMark)}` : `Sotto la soglia del ${pct(passMark)}`);

  const duration = result.ended - result.started;
  root.replaceChildren(...[
    h("header", { class: "quiz-bar" },
      h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: onHome }, "← Home"),
      h("div", { class: "quiz-count" }, isExam ? "Esito della simulazione" : "Report"),
      h("span", {}),
    ),
    h("section", { class: `card score ${passed ? "is-ok" : "is-ko"}` },
      h("div", { class: "score-main" },
        h("p", { class: "score-pct" }, pct(result.score)),
        h("p", { class: "score-line" }, h("strong", {}, `${result.correct} corrette su ${result.total}`),
          skipped ? ` · ${skipped} senza risposta` : ""),
        h("p", { class: `pill ${passed ? "pill-ok" : "pill-ko"}` }, verdict),
      ),
      h("dl", { class: "score-facts" },
        h("div", {}, h("dt", {}, "Durata"), h("dd", {}, formatDuration(duration),
          result.timeLimit ? ` di ${Math.round(result.timeLimit / 60000)} min` : "")),
        h("div", {}, h("dt", {}, "Conclusa"), h("dd", {}, formatWhen(result.ended))),
        h("div", {}, h("dt", {}, "Media per domanda"), h("dd", {}, formatDuration(duration / Math.max(1, result.items.length)))),
      ),
    ),
    subjects.length
      ? h("section", { class: "card", "aria-labelledby": "h-by-subject" },
          h("h2", { id: "h-by-subject" }, "Per materia"),
          h("ul", { class: "bars", role: "list" }, subjects.map((s) =>
            h("li", { class: "bar-row" },
              h("span", { class: "bar-label" }, h("b", {}, s.short), ` ${s.name}`,
                isExam ? h("span", { class: `pill ${s.passed ? "pill-ok" : "pill-ko"}` }, s.passed ? "superata" : "non superata") : null),
              h("span", { class: "bar", "aria-hidden": "true" },
                h("span", { class: `bar-fill ${s.passed ? "is-ok" : "is-ko"}`, style: { width: pct(s.correct / s.total) } }),
                h("span", { class: "bar-mark", style: { left: pct(passMark) } }),
              ),
              h("span", { class: "bar-value" }, `${s.correct}/${s.total}`),
            ),
          )),
        )
      : null,
    h("div", { class: "report-actions" },
      wrong.length ? h("button", { class: "btn btn-primary", type: "button", onclick: () => onRetryWrong(wrong.map((x) => x.qid)) }, `Ripeti gli errori (${wrong.length})`) : null,
      h("button", { class: wrong.length ? "btn btn-ghost" : "btn btn-primary", type: "button", onclick: onRepeat },
        isExam ? "Nuova simulazione con le stesse materie" : "Nuova sessione con le stesse impostazioni"),
    ),
    h("section", { class: "review", "aria-labelledby": "h-review" },
      h("div", { class: "panel-head" }, h("h2", { id: "h-review" }, "Revisione"), tabs),
      reviewList,
    ),
  ].filter(Boolean));
  drawReview();
  window.scrollTo({ top: 0 });
}
