/**
 * Punto d'ingresso: carica i dati, crea lo store e coordina le viste
 * (home → allenamento | simulazione d'esame → report). Ogni vista riceve solo ciò che le serve.
 */
import { loadBank } from "./data/bank.js";
import { createStore } from "./core/store.js";
import { Session } from "./core/session.js";
import { buildSession, buildExam, shuffle } from "./core/sampler.js";
import { renderHome, poolFor } from "./ui/home.js";
import { renderQuiz } from "./ui/quiz.js";
import { renderExam } from "./ui/exam.js";
import { renderReport } from "./ui/report.js";
import { closeModal } from "./ui/modal.js";
import { h } from "./ui/dom.js";

const root = document.getElementById("app");
let teardown = null;

function mount(view, props) {
  teardown?.();
  closeModal();
  teardown = view(root, props) || null;
}

async function boot() {
  let bank;
  try {
    bank = await loadBank();
  } catch (err) {
    root.replaceChildren(h("div", { class: "card error" },
      h("h1", {}, "Il banco domande non si è caricato"),
      h("p", {}, err.message),
      h("p", {}, "Se hai aperto index.html direttamente dal disco, avvia un server locale (vedi README) e ricarica."),
    ));
    return;
  }
  const store = createStore();

  // la sessione salvata potrebbe riferirsi a domande non più presenti
  if (store.current && !store.current.ids.every((id) => bank.byId.has(id))) store.clearCurrent();

  const home = (flash = "") => mount(renderHome, {
    bank,
    store,
    flash,
    onStart: (config) => startPractice(config),
    onStartExam: (config) => startExam(config),
    onResume: () => resume(Session.restore(store.current)),
    onDiscard: () => { store.clearCurrent(); home(); },
    onOpenSession: (summary) => report(summary),
    onDataChanged: (msg) => home(msg),
  });

  function startPractice(config) {
    const pool = poolFor(bank, store, config.subjects, config.pool);
    const picked = buildSession(pool, { ...config, stats: store.stats });
    if (!picked.length) return home();
    play(new Session({ ids: picked.map((q) => q.id), config: { ...config, mode: "practice" } }));
  }

  function startExam({ subjects }) {
    const picked = buildExam(bank, subjects, { stats: store.stats });
    if (!picked.length) return home();
    const minutes = subjects.reduce((a, sid) => a + (bank.exam.papers[sid]?.minutes ?? 0), 0);
    const started = Date.now();
    sit(new Session({
      ids: picked.map((q) => q.id), mode: "exam", started, deadline: started + minutes * 60_000,
      config: { subjects, mode: "exam" },
    }));
  }

  const resume = (session) => (session.isExam ? (session.expired ? submitExam(session) : sit(session)) : play(session));

  function play(session) {
    store.saveCurrent(session.snapshot());
    mount(renderQuiz, {
      bank,
      store,
      session,
      onAnswer: (qid, ok) => { store.recordAnswer(qid, ok); store.saveCurrent(session.snapshot()); },
      onMove: () => store.saveCurrent(session.snapshot()),
      onFinish: () => finish(session),
      onQuit: () => home(), // la sessione resta salvata e si può riprendere dalla home
    });
  }

  function sit(session) {
    store.saveCurrent(session.snapshot());
    mount(renderExam, {
      bank,
      store,
      session,
      onChange: () => store.saveCurrent(session.snapshot()),
      onSubmit: () => submitExam(session),
      onQuit: () => home(), // il tempo continua: si riprende dalla home
    });
  }

  function submitExam(session) {
    // in esame le statistiche si registrano solo alla consegna
    const at = Math.min(Date.now(), session.deadline ?? Infinity);
    session.ids.forEach((qid, i) => {
      const c = session.choices[i];
      if (c !== null) store.recordAnswer(qid, c === bank.byId.get(qid).correct, at);
    });
    finish(session);
  }

  function finish(session) {
    const result = session.result(bank);
    store.clearCurrent();
    if (result.total > 0) store.addSession(result);
    report(result);
  }

  function report(result) {
    mount(renderReport, {
      bank,
      store,
      result,
      onHome: () => home(),
      onRetryWrong: (ids) => play(new Session({
        ids: shuffle(ids.filter((id) => bank.byId.has(id))),
        config: { ...result.config, mode: "practice", retryOf: result.id },
      })),
      onRepeat: () => {
        const c = result.config;
        if (!c?.subjects) return home();
        if (result.mode === "exam") return startExam({ subjects: c.subjects });
        startPractice({ subjects: c.subjects, count: c.count ?? 20, distribution: c.distribution ?? "equal", pool: c.pool ?? "all" });
      },
    });
  }

  home();
}

boot();
