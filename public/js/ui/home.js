import { h, pct, formatWhen } from "./dom.js";
import { BRAND } from "../config.js";
import { assetUrl } from "../data/bank.js";
import { needsReview } from "../core/sampler.js";
import { dataPanel } from "./data-panel.js";

const COUNTS = [10, 20, 30, 50];
const MODES = [
  { id: "practice", label: "Allenamento" },
  { id: "exam", label: "Esame simulato" },
];
const DISTRIBUTIONS = [
  { id: "equal", label: "Uguale per materia" },
  { id: "proportional", label: "Proporzionale" },
];

/** Filtra le domande delle materie scelte secondo il tipo di raccolta. */
export function poolFor(bank, store, subjects, pool, now = Date.now()) {
  const { stats, flags } = store;
  return subjects.flatMap((sid) => bank.bySubject.get(sid) || []).filter((q) => {
    if (pool === "new") return !stats[q.id];
    if (pool === "review") return needsReview(stats[q.id], now);
    if (pool === "flagged") return Boolean(flags[q.id]);
    return true;
  });
}

export function renderHome(root, { bank, store, onStart, onStartExam, onResume, onDiscard, onOpenSession, onDataChanged, flash = "" }) {
  const prefs = store.prefs;
  const state = {
    mode: prefs.mode ?? "practice",
    subjects: new Set(prefs.subjects?.filter((s) => bank.subjectById.has(s)) ?? bank.subjects.map((s) => s.id)),
    count: prefs.count ?? 20,
    distribution: prefs.distribution ?? "equal",
    pool: prefs.pool ?? "all",
  };

  const { stats, flags } = store;
  const now = Date.now();
  const totalSeen = bank.questions.filter((q) => stats[q.id]).length;

  // ---------- materie ----------
  const subjectRows = bank.subjects.map((s) => {
    const qs = bank.bySubject.get(s.id);
    const seen = qs.filter((q) => stats[q.id]);
    const ok = seen.filter((q) => stats[q.id].lastOk).length;
    const due = qs.filter((q) => needsReview(stats[q.id], now)).length;
    const paper = bank.exam.papers[s.id];
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
          seen.length ? ` · ${pct(ok / seen.length)} giuste` : "",
          due ? ` · ${due} da ripassare` : ""),
        h("span", { class: "subject-meta subject-exam" },
          paper ? `Esame: ${paper.questions} domande in ${paper.minutes} min` : ""),
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

  // ---------- controlli ----------
  const segmented = (name, options, get, set) => {
    const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": name });
    wrap.draw = () => wrap.replaceChildren(...options().map((o) =>
      h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(get() === o.id),
        title: o.hint || null,
        onclick: () => { set(o.id); update(); },
      }, o.label),
    ));
    return wrap;
  };

  const modeSeg = segmented("Modalità", () => MODES, () => state.mode, (v) => (state.mode = v));
  modeSeg.classList.add("segmented-wide");

  const countInput = h("input", {
    id: "count", type: "number", min: 1, max: 999, inputmode: "numeric", value: state.count,
    "aria-label": "Numero di domande",
    oninput: () => {
      const n = parseInt(countInput.value, 10);
      if (n > 0) { state.count = n; update(); }
    },
  });
  const countSeg = segmented("Numero di domande", () => COUNTS.map((n) => ({ id: n, label: n })),
    () => state.count, (v) => { state.count = v; countInput.value = v; });

  const poolSeg = segmented("Quali domande", () => {
    const sel = [...state.subjects];
    const n = (p) => poolFor(bank, store, sel, p, now).length;
    return [
      { id: "all", label: "Tutte" },
      { id: "new", label: `Mai viste (${n("new")})` },
      { id: "review", label: `Da ripassare (${n("review")})`, hint: "sbagliate l'ultima volta o in scadenza di ripasso" },
      { id: "flagged", label: `Segnate (${n("flagged")})` },
    ];
  }, () => state.pool, (v) => (state.pool = v));

  const distSeg = segmented("Distribuzione", () => DISTRIBUTIONS, () => state.distribution, (v) => (state.distribution = v));
  const distRow = h("div", { class: "field" }, h("span", { class: "label" }, "Distribuzione tra le materie"), distSeg);

  const available = h("p", { class: "available" });
  const startBtn = h("button", { class: "btn btn-primary btn-start", type: "button", onclick: start });

  const practiceFields = h("div", { class: "mode-fields" },
    h("div", { class: "field" },
      h("label", { class: "label", for: "count" }, "Numero di domande"),
      h("div", { class: "count-row" }, countSeg, countInput),
    ),
    h("div", { class: "field" }, h("span", { class: "label" }, "Quali domande"), poolSeg),
    distRow,
    h("p", { class: "fineprint" },
      "Ripasso intelligente: le domande sbagliate tornano più spesso, quelle che sai si diradano ",
      "(dopo una risposta giusta riappaiono tra 1 giorno, poi 3, 7, 16 e 35)."),
  );

  const examTable = h("div", { class: "exam-table" });
  const examFields = h("div", { class: "mode-fields" },
    examTable,
    h("p", { class: "fineprint" },
      `Come all'esame: nessun esito fino alla consegna, risposte modificabili, tempo limite. `,
      `Si supera con almeno il ${Math.round(bank.exam.passMark * 100)}% in ogni materia.`),
  );

  function drawExamTable() {
    const rows = bank.subjects.filter((s) => state.subjects.has(s.id) && bank.exam.papers[s.id]);
    const totQ = rows.reduce((a, s) => a + Math.min(bank.exam.papers[s.id].questions, bank.bySubject.get(s.id).length), 0);
    const totM = rows.reduce((a, s) => a + bank.exam.papers[s.id].minutes, 0);
    examTable.replaceChildren(
      rows.length
        ? h("table", {},
            h("thead", {}, h("tr", {}, h("th", {}, "Materia"), h("th", {}, "Domande"), h("th", {}, "Tempo"))),
            h("tbody", {}, rows.map((s) => h("tr", {},
              h("td", {}, h("b", {}, s.short), ` ${s.name}`),
              h("td", {}, bank.exam.papers[s.id].questions),
              h("td", {}, `${bank.exam.papers[s.id].minutes} min`),
            ))),
            rows.length > 1 ? h("tfoot", {}, h("tr", {}, h("td", {}, "Totale"), h("td", {}, totQ), h("td", {}, `${totM} min`))) : null,
          )
        : h("p", { class: "muted" }, "Seleziona una o più materie."),
    );
    return { totQ, totM };
  }

  function update() {
    modeSeg.draw(); countSeg.draw(); poolSeg.draw(); distSeg.draw();
    const sel = [...state.subjects];
    const exam = state.mode === "exam";
    practiceFields.hidden = exam;
    examFields.hidden = !exam;
    root.querySelector(".home-grid")?.classList.toggle("is-exam", exam);
    if (exam) {
      const { totQ, totM } = drawExamTable();
      available.textContent = "";
      startBtn.disabled = totQ === 0;
      startBtn.textContent = totQ === 0 ? "Seleziona le materie" : `Inizia · ${totQ} domande, ${totM} min`;
    } else {
      const pool = poolFor(bank, store, sel, state.pool, now);
      const n = Math.min(state.count, pool.length);
      distRow.hidden = state.subjects.size < 2;
      available.textContent = state.subjects.size === 0
        ? "Seleziona almeno una materia."
        : `${pool.length} domande disponibili in ${state.subjects.size === 1 ? "1 materia" : `${state.subjects.size} materie`}.`;
      startBtn.disabled = n === 0;
      startBtn.textContent = n === 0 ? "Nessuna domanda disponibile" : `Inizia · ${n} domande`;
    }
    store.setPrefs({ mode: state.mode, subjects: sel, count: state.count, distribution: state.distribution, pool: state.pool });
  }

  function start() {
    const subjects = bank.subjects.map((s) => s.id).filter((id) => state.subjects.has(id));
    if (state.mode === "exam") onStartExam({ subjects });
    else onStart({ subjects, count: state.count, distribution: state.distribution, pool: state.pool });
  }

  // ---------- sessione in corso ----------
  const cur = store.current;
  const resumeBanner = cur
    ? h("div", { class: "resume" },
        h("div", {},
          h("strong", {}, cur.mode === "exam" ? "Simulazione d'esame in corso" : "Sessione in corso"),
          h("span", { class: "muted" },
            ` · ${cur.choices.filter((c) => c !== null).length} di ${cur.ids.length} risposte date`,
            cur.deadline ? ` · ${Math.max(0, Math.ceil((cur.deadline - Date.now()) / 60000))} min rimasti` : ""),
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
              h("span", { class: "history-subj" },
                s.mode === "exam" ? h("span", { class: "tag" }, "Esame") : null,
                Object.keys(s.bySubject).map((id) => bank.subjectById.get(id)?.short ?? id).join(" · ")),
              h("span", { class: `pill ${(s.passed ?? s.score >= bank.exam.passMark) ? "pill-ok" : "pill-ko"}` }, `${s.correct}/${s.total}`),
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
          totalSeen ? ` · ${totalSeen.toLocaleString("it-IT")} già viste` : "",
          Object.keys(flags).length ? ` · ${Object.keys(flags).length} segnate` : ""),
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
          modeSeg,
          practiceFields,
          examFields,
          available,
          startBtn,
        ),
        history,
        dataPanel(store, { onImported: onDataChanged, message: flash }),
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
