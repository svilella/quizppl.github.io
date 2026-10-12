import { h } from "./dom.js";
import { questionBody, answerList, explanationPanel } from "./question.js";
import { lightboxOpen } from "./lightbox.js";

/**
 * Vista quiz: una domanda alla volta, esito immediato.
 * Tastiera: A–E o 1–5 per rispondere · Invio / → per proseguire · S per la spiegazione.
 */
export function renderQuiz(root, { bank, session, onAnswer, onMove, onFinish, onQuit }) {
  let keyHandler;

  function draw() {
    const q = bank.byId.get(session.currentId);
    const subject = bank.subjectById.get(q.subject);
    const chosen = session.currentChoice;
    const answered = chosen !== null;
    const expl = explanationPanel(q);

    const progress = h("ol", { class: "track", "aria-label": "Avanzamento" },
      session.ids.map((qid, i) => {
        const c = session.choices[i];
        const ok = c !== null && c === bank.byId.get(qid).correct;
        const cls = i === session.index ? "is-current" : c === null ? "" : ok ? "is-ok" : "is-ko";
        return h("li", { class: cls, title: `Domanda ${i + 1}` });
      }),
    );

    const explBtn = h("button", {
      class: "btn btn-ghost", type: "button", "aria-expanded": "false",
      onclick: async () => explBtn.setAttribute("aria-expanded", String(await expl.toggle())),
    }, "Spiegazione");

    const nextBtn = h("button", {
      class: "btn btn-primary", type: "button",
      onclick: () => {
        if (session.isLast) return onFinish();
        session.next();
        onMove();
        draw();
        window.scrollTo({ top: 0 });
      },
    }, session.isLast ? "Vedi il report" : "Prossima domanda");

    const choose = (i) => {
      if (!session.answer(i)) return;
      onAnswer(q.id, i === q.correct);
      draw();
      root.querySelector(".quiz-actions .btn-primary")?.focus({ preventScroll: true });
    };

    root.replaceChildren(
      h("header", { class: "quiz-bar" },
        h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: onQuit }, "← Esci"),
        h("div", { class: "quiz-count" },
          h("strong", {}, session.index + 1), ` / ${session.total}`),
        h("button", {
          class: "btn btn-ghost btn-small", type: "button", onclick: onFinish,
          disabled: session.answered === 0,
          title: "Chiudi la sessione e vai al report",
        }, "Termina"),
      ),
      progress,
      h("article", { class: "card question", "aria-live": "polite" },
        h("div", { class: "q-head" },
          h("span", { class: "chip" }, h("b", {}, subject.short), ` ${subject.name}`),
          h("span", { class: "q-num" }, `n. ${q.num}`),
        ),
        questionBody(q, bank),
        answerList(q, { chosen, onChoose: answered ? null : choose }),
        answered
          ? h("div", { class: `verdict ${chosen === q.correct ? "is-ok" : "is-ko"}`, role: "status" },
              chosen === q.correct ? "Risposta corretta" : `Risposta errata · la corretta è la ${"ABCDE"[q.correct]}`)
          : null,
        expl.panel,
      ),
      h("div", { class: "quiz-actions" },
        answered ? explBtn : h("span", { class: "hint" }, "Scegli una risposta · tasti A–D"),
        answered ? nextBtn : null,
      ),
    );

    keyHandler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || lightboxOpen()) return;
      if (e.target.closest?.("input, textarea")) return;
      const k = e.key.toUpperCase();
      if (!answered) {
        const idx = "ABCDE".indexOf(k) >= 0 ? "ABCDE".indexOf(k) : "12345".indexOf(k);
        if (idx >= 0 && idx < q.answers.length) { e.preventDefault(); choose(idx); }
      } else if (k === "ENTER" || k === "ARROWRIGHT") {
        if (e.target.closest?.("button") && k === "ENTER") return; // il pulsante focalizzato gestisce l'Invio
        e.preventDefault(); nextBtn.click();
      } else if (k === "S") {
        explBtn.click();
      }
    };
  }

  const listener = (e) => keyHandler?.(e);
  document.addEventListener("keydown", listener);
  draw();
  return () => document.removeEventListener("keydown", listener);
}
