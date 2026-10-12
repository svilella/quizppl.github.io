import { h, pct, formatWhen } from "./dom.js";
import { BRAND } from "../config.js";
import { assetUrl } from "../data/bank.js";

export const PASS_MARK = 0.75; // soglia di superamento dell'esame teorico PPL

const COUNTS = [10, 20, 30, 50];
const POOLS = [
  { id: "all", label: "Tutte" },
  { id: "new", label: "Mai viste" },
  { id: "review", label: "Da ripassare", hint: "sbagliate l'ultima volta" },
];
const DISTRIBUTIONS = [
  { id: "equal", label: "Uguale per materia" },
  { id: "proportional", label: "Proporzionale" },
];

/** Filtra le domande delle materie scelte secondo il tipo di raccolta. */
export function poolFor(bank, stats, subjects, pool) {
  return subjects.flatMap((sid) => bank.bySubject.get(sid) || []).filter((q) => {
    const s = stats[q.id];
    if (pool === "new") return !s;
    if (pool === "review") return s && !s.lastOk;
    return true;
  });
}

export function renderHome(root, { bank, store, onStart, onResume, onDiscard, onOpenSession }) {
  const prefs = store.prefs;
  const state = {
    subjects: new Set(prefs.subjects?.filter((s) => bank.subjectById.has(s)) ?? bank.subjects.map((s) => s.id)),
    count: prefs.count ?? 20,
    distribution: prefs.distribution ?? "equal",
    pool: prefs.pool ?? "all",
  };

  const stats = store.stats;
  const totalSeen = bank.questions.filter((q) => stats[q.id]).length;

  // ---------- materie ----------
  const subjectRows = bank.subjects.map((s) => {
    const qs = bank.bySubject.get(s.id);
    const seen = qs.filter((q) => stats[q.id]);
    const ok = seen.filter((q) => stats[q.id].lastOk).length;
    const btn = h("button", {
      class: "subject",
      type: "button",
      "aria-pressed": String(state.subjects.has(s.id)),
      onclick: () => {
        state.subjects.has(s.id) ? state.subjects.delete(s.id) : state.subjects.add(s.id);
        btn.setAttribute("aria-pressed", String(state.subjects.has(s.id)));
        update();
      },
    },
      h("span", { class: "subject-code" }, s.code),
      h("span", { class: "subject-main" },
        h("span", { class: "subject-name" }, s.name),
        h("span", { class: "subject-meta" },
          `${qs.length} domande · viste ${seen.length}`,
          seen.length ? ` · ${pct(ok / seen.length)} corrette all'ultimo tentativo` : ""),
        h("span", { class: "meter", "aria-hidden": "true" },
          h("span", { class: "meter-ok", style: { width: pct(ok / qs.length) } }),
          h("span", { class: "meter-ko", style: { width: pct((seen.length - ok) / qs.length) } }),
        ),
      ),
      h("span", { class: "subject-check", "aria-hidden": "true" }),
    );
    return btn;
  });

  const selectAll = (on) => {
    state.subjects = new Set(on ? bank.subjects.map((s) => s.id) : []);
    subjectRows.forEach((b, i) => b.setAttribute("aria-pressed", String(state.subjects.has(bank.subjects[i].id))));
    update();
  };

  // ---------- configurazione ----------
  const segmented = (name, options, get, set) => {
    const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": name });
    const draw = () => wrap.replaceChildren(...options.map((o) =>
      h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(get() === o.id),
        title: o.hint || null,
        onclick: () => { set(o.id); draw(); update(); },
      }, o.label),
    ));
    draw();
    return wrap;
  };

  const countInput = h("input", {
    id: "count", type: "number", min: 1, max: 999, inputmode: "numeric", value: state.count,
    "aria-label": "Numero di domande",
    oninput: () => {
      const n = parseInt(countInput.value, 10);
      if (n > 0) { state.count = n; countSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.n === n))); update(); }
    },
  });
  const countSeg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Numero di domande" },
    COUNTS.map((n) => h("button", {
      type: "button", role: "radio", "data-n": n, "aria-checked": String(state.count === n),
      onclick: (e) => {
        state.count = n; countInput.value = n;
        countSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget)));
        update();
      },
    }, n)),
  );

  const distRow = h("div", { class: "field" },
    h("span", { class: "label" }, "Distribuzione tra le materie"),
    segmented("Distribuzione", DISTRIBUTIONS, () => state.distribution, (v) => (state.distribution = v)),
  );

  const available = h("p", { class: "available" });
  const startBtn = h("button", { class: "btn btn-primary btn-start", type: "button", onclick: start });

  function update() {
    const pool = poolFor(bank, stats, [...state.subjects], state.pool);
    const n = Math.min(state.count, pool.length);
    distRow.hidden = state.subjects.size < 2;
    available.textContent = state.subjects.size === 0
      ? "Seleziona almeno una materia."
      : `${pool.length} domande disponibili in ${state.subjects.size === 1 ? "1 materia" : `${state.subjects.size} materie`}.`;
    startBtn.disabled = n === 0;
    startBtn.textContent = n === 0 ? "Nessuna domanda disponibile" : `Inizia · ${n} domande`;
    store.setPrefs({ subjects: [...state.subjects], count: state.count, distribution: state.distribution, pool: state.pool });
  }

  function start() {
    onStart({ subjects: [...state.subjects], count: state.count, distribution: state.distribution, pool: state.pool });
  }

  // ---------- sessione in corso ----------
  const cur = store.current;
  const resumeBanner = cur
    ? h("div", { class: "resume" },
        h("div", {},
          h("strong", {}, "Sessione in corso"),
          h("span", { class: "muted" }, ` · ${cur.choices.filter((c) => c !== null).length} di ${cur.ids.length} risposte date`),
        ),
        h("div", { class: "resume-actions" },
          h("button", { class: "btn btn-ghost", type: "button", onclick: onDiscard }, "Abbandona"),
          h("button", { class: "btn btn-primary", type: "button", onclick: onResume }, "Riprendi"),
        ),
      )
    : null;

  // ---------- storico ----------
  const sessions = store.sessions.slice(0, 8);
  const history = sessions.length
    ? h("section", { class: "panel history", "aria-labelledby": "h-history" },
        h("h2", { id: "h-history" }, "Ultime sessioni"),
        h("ul", { class: "history-list", role: "list" }, sessions.map((s) =>
          h("li", {},
            h("button", { class: "history-item", type: "button", onclick: () => onOpenSession(s) },
              h("span", { class: "history-when" }, formatWhen(s.ended)),
              h("span", { class: "history-subj" }, Object.keys(s.bySubject).map((id) => bank.subjectById.get(id)?.short ?? id).join(" · ")),
              h("span", { class: `pill ${s.score >= PASS_MARK ? "pill-ok" : "pill-ko"}` }, `${s.correct}/${s.total}`),
            ),
          ),
        )),
      )
    : null;

  root.replaceChildren(...[
    h("header", { class: "masthead" },
      brandLogo(),
      h("div", { class: "masthead-text" },
        h("p", { class: "eyebrow" }, "Quiz d’esame APPL · teoria PPL"),
        h("h1", {}, "Banco Domande PPL"),
        h("p", { class: "lede" },
          `${bank.questions.length.toLocaleString("it-IT")} domande in ${bank.subjects.length} materie`,
          totalSeen ? ` · ${totalSeen.toLocaleString("it-IT")} già viste` : ""),
      ),
      ribbon(),
    ),
    resumeBanner,
    h("div", { class: "home-grid" },
      h("section", { class: "panel", "aria-labelledby": "h-subjects" },
        h("div", { class: "panel-head" },
          h("h2", { id: "h-subjects" }, "Materie"),
          h("div", { class: "link-row" },
            h("button", { class: "link", type: "button", onclick: () => selectAll(true) }, "Tutte"),
            h("button", { class: "link", type: "button", onclick: () => selectAll(false) }, "Nessuna"),
          ),
        ),
        h("div", { class: "subject-list" }, subjectRows),
      ),
      h("aside", { class: "config-col" },
        h("section", { class: "panel config", "aria-labelledby": "h-config" },
          h("h2", { id: "h-config" }, "Nuova sessione"),
          h("div", { class: "field" },
            h("label", { class: "label", for: "count" }, "Numero di domande"),
            h("div", { class: "count-row" }, countSeg, countInput),
          ),
          h("div", { class: "field" },
            h("span", { class: "label" }, "Quali domande"),
            segmented("Quali domande", POOLS, () => state.pool, (v) => (state.pool = v)),
          ),
          distRow,
          available,
          startBtn,
          h("p", { class: "fineprint" }, "L'estrazione è casuale e rende un po' meno probabili le domande viste negli ultimi giorni."),
        ),
        history,
      ),
    ),
  ].filter(Boolean));
  update();
}

/** Logo facoltativo (vedi config.js): resta nascosto finché non si carica, sparisce se manca. */
function brandLogo() {
  if (!BRAND.logo) return null;
  const img = h("img", { class: "brand-logo", src: assetUrl(BRAND.logo), alt: BRAND.logoAlt, hidden: true });
  img.addEventListener("load", () => { img.hidden = false; });
  img.addEventListener("error", () => img.remove());
  return img;
}

/** Nastro tricolore decorativo, come nelle slide del corso. */
function ribbon() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 240");
  svg.setAttribute("class", "ribbon");
  svg.setAttribute("aria-hidden", "true");
  const strands = [["--green", -16], ["--white-strand", 0], ["--red", 16]];
  for (const [color, dx] of strands) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", `M${150 + dx} -10 C ${70 + dx} 50, ${215 + dx} 110, ${130 + dx} 170 S ${60 + dx} 230, ${110 + dx} 260`);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", `var(${color})`);
    p.setAttribute("stroke-width", "15");
    p.setAttribute("stroke-linecap", "round");
    svg.append(p);
  }
  return svg;
}
