/**
 * Punto d'ingresso: carica i dati, crea lo store e coordina le tre viste
 * (home → quiz → report). Ogni vista riceve solo ciò che le serve.
 */
import { loadBank } from "./data/bank.js";
import { createStore } from "./core/store.js";
import { Session } from "./core/session.js";
import { buildSession, shuffle } from "./core/sampler.js";
import { renderHome, poolFor } from "./ui/home.js";
import { renderQuiz } from "./ui/quiz.js";
import { renderReport } from "./ui/report.js";
import { h } from "./ui/dom.js";

const root = document.getElementById("app");
let teardown = null;

function mount(view, props) {
  teardown?.();
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

  const home = () => mount(renderHome, {
    bank,
    store,
    onStart: (config) => startNew(config),
    onResume: () => play(Session.restore(store.current)),
    onDiscard: () => { store.clearCurrent(); home(); },
    onOpenSession: (summary) => report(summary),
  });

  function startNew(config) {
    const pool = poolFor(bank, store.stats, config.subjects, config.pool);
    const picked = buildSession(pool, { ...config, stats: store.stats });
    if (!picked.length) return home();
    play(new Session({ ids: picked.map((q) => q.id), config }));
  }

  function play(session) {
    store.saveCurrent(session.snapshot());
    mount(renderQuiz, {
      bank,
      session,
      onAnswer: (qid, ok) => { store.recordAnswer(qid, ok); store.saveCurrent(session.snapshot()); },
      onMove: () => store.saveCurrent(session.snapshot()),
      onFinish: () => finish(session),
      onQuit: () => home(), // la sessione resta salvata e si può riprendere dalla home
    });
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
      result,
      onHome: home,
      onRetryWrong: (ids) => play(new Session({ ids: shuffle(ids), config: { ...result.config, retryOf: result.id } })),
      onRepeat: () => (result.config?.subjects ? startNew({ ...result.config, retryOf: undefined }) : home()),
    });
  }

  home();
}

boot();
