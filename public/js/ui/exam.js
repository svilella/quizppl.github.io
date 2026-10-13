import { h, LETTERS } from "./dom.js";
import { questionBody, answerList, questionTools } from "./question.js";
import { lightboxOpen } from "./lightbox.js";
import { modalOpen } from "./modal.js";

const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

/**
 * Vista simulazione d'esame: nessun esito fino alla consegna, risposte
 * modificabili, navigazione libera, tempo limite con consegna automatica.
 * Tastiera: A–E o 1–5 per rispondere · ← → per spostarsi.
 */
export function renderExam(root, { bank, store, session, onChange, onSubmit, onQuit }) {
  let confirming = false;
  const timer = h("div", { class: "exam-timer", role: "timer", "aria-live": "off" });

  const tick = () => {
    const left = session.timeLeft();
    timer.textContent = clock(left);
    timer.classList.toggle("is-low", left < 5 * 60_000);
    if (left === 0) { stop(); onSubmit(); }
  };
  const interval = setInterval(tick, 1000);
  const stop = () => clearInterval(interval);

  // numeri delle domande, raggruppati per materia come nei fogli d'esame
  const groups = [];
  session.ids.forEach((qid, i) => {
    const sid = bank.byId.get(qid).subject;
    if (!groups.length || groups.at(-1).sid !== sid) groups.push({ sid, items: [] });
    groups.at(-1).items.push(i);
  });

  function draw() {
    const q = bank.byId.get(session.currentId);
    const subject = bank.subjectById.get(q.subject);

    const choose = (i) => {
      session.answer(i);
      onChange();
      draw();
    };
    const move = (fn) => { fn(); onChange(); draw(); window.scrollTo({ top: 0 }); };

    const grid = h("nav", { class: "card exam-grid", "aria-label": "Domande dell'esame" },
      groups.map((g) => h("div", { class: "exam-group" },
        h("p", { class: "exam-group-label" }, h("b", {}, bank.subjectById.get(g.sid).short), ` ${bank.subjectById.get(g.sid).name}`),
        h("ol", { class: "exam-cells", role: "list" }, g.items.map((i) => {
          const cls = [
            "cell",
            session.choices[i] !== null && "is-done",
            i === session.index && "is-current",
            store.isFlagged(session.ids[i]) && "is-flagged",
          ].filter(Boolean).join(" ");
          return h("li", {}, h("button", {
            class: cls, type: "button",
            "aria-label": `Domanda ${i + 1}${session.choices[i] !== null ? ", risposta data" : ""}`,
            "aria-current": i === session.index ? "true" : null,
            onclick: () => move(() => session.goTo(i)),
          }, i + 1));
        })),
      )),
      h("p", { class: "exam-legend" },
        h("span", { class: "cell is-done", "aria-hidden": "true" }), " risposta data   ",
        h("span", { class: "cell is-flagged", "aria-hidden": "true" }), " segnata"),
    );

    const unanswered = session.unanswered;
    const actions = confirming
      ? h("div", { class: "card exam-confirm", role: "alertdialog", "aria-label": "Conferma consegna" },
          h("p", {}, unanswered
            ? h("strong", {}, `Hai ${unanswered} ${unanswered === 1 ? "domanda" : "domande"} senza risposta, che contano come errate.`)
            : h("strong", {}, "Hai risposto a tutte le domande."),
            " Dopo la consegna non potrai più modificare le risposte."),
          h("div", { class: "exam-confirm-actions" },
            h("button", { class: "btn btn-ghost", type: "button", onclick: () => { confirming = false; draw(); } }, "Continua l'esame"),
            h("button", { class: "btn btn-primary", type: "button", onclick: () => { stop(); onSubmit(); } }, "Consegna ora"),
          ),
        )
      : h("div", { class: "quiz-actions" },
          h("button", { class: "btn btn-ghost", type: "button", disabled: session.isFirst, onclick: () => move(() => session.prev()) }, "← Precedente"),
          session.isLast
            ? h("button", { class: "btn btn-primary", type: "button", onclick: () => { confirming = true; draw(); } }, "Consegna")
            : h("button", { class: "btn btn-primary", type: "button", onclick: () => move(() => session.next()) }, "Successiva →"),
        );

    root.replaceChildren(
      h("header", { class: "quiz-bar" },
        h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => { stop(); onQuit(); }, title: "Il tempo continua a scorrere" }, "← Esci"),
        h("div", { class: "exam-head" }, h("span", { class: "exam-label" }, "Simulazione d'esame"), timer),
        h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => { confirming = true; draw(); } }, "Consegna"),
      ),
      h("p", { class: "exam-progress" },
        `Domanda ${session.index + 1} di ${session.total} · ${session.answered} ${session.answered === 1 ? "risposta data" : "risposte date"}`),
      h("article", { class: "card question" },
        h("div", { class: "q-head" },
          h("span", { class: "chip" }, h("b", {}, subject.short), ` ${subject.name}`),
          h("span", { class: "q-num" }, `n. ${q.num}`),
        ),
        questionBody(q, bank),
        answerList(q, { chosen: session.currentChoice, onChoose: choose, reveal: false }),
        questionTools(q, bank, store, { chosen: () => session.currentChoice }),
      ),
      actions,
      grid,
    );
    // la stellina cambia lo stato della griglia: la ridisegno al clic
    root.querySelector(".tool-star")?.addEventListener("click", () => setTimeout(draw, 0));
    tick();
  }

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || lightboxOpen() || modalOpen() || confirming) return;
    if (e.target.closest?.("input, textarea")) return;
    const k = e.key.toUpperCase();
    const q = bank.byId.get(session.currentId);
    const idx = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : "12345".indexOf(k);
    if (idx >= 0 && idx < q.answers.length) {
      e.preventDefault(); session.answer(idx); onChange(); draw();
    } else if (k === "ARROWRIGHT" && !session.isLast) {
      e.preventDefault(); session.next(); onChange(); draw();
    } else if (k === "ARROWLEFT" && !session.isFirst) {
      e.preventDefault(); session.prev(); onChange(); draw();
    }
  };
  document.addEventListener("keydown", onKey);
  draw();
  return () => { stop(); document.removeEventListener("keydown", onKey); };
}
