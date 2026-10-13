/**
 * Selezione delle domande con ripasso intelligente (ripetizione dilazionata).
 *
 * Ogni domanda ha una "serie" = risposte giuste consecutive. La serie decide
 * dopo quanto la domanda torna "in scadenza":
 *
 *   serie       0 (sbagliata)  1     2     3     4      5+
 *   intervallo  6 ore          1 g   3 g   7 g   16 g   35 g
 *
 * Il peso nell'estrazione casuale ne deriva:
 *   - mai vista                          → 1
 *   - sbagliata, in scadenza             → 2.5   (torna più spesso)
 *   - sbagliata, appena vista            → da 0.5 a 2.5 man mano che passa il tempo
 *   - giusta, in scadenza                → 1
 *   - giusta, non ancora in scadenza     → da 0.25 a 1 (le domande che sai si diradano)
 */
export const INTERVAL_DAYS = [0.25, 1, 3, 7, 16, 35];
const DAY = 86_400_000;

const streakOf = (stat) => stat.streak ?? (stat.lastOk ? 1 : 0);

/** Frazione dell'intervallo trascorsa dall'ultimo tentativo (≥ 1 = in scadenza). */
export function dueRatio(stat, now = Date.now()) {
  if (!stat?.last) return Infinity;
  const interval = INTERVAL_DAYS[Math.min(streakOf(stat), INTERVAL_DAYS.length - 1)] * DAY;
  return Math.max(0, now - stat.last) / interval;
}

/** Da ripassare: già vista e sbagliata l'ultima volta, oppure giusta ma con l'intervallo scaduto. */
export function needsReview(stat, now = Date.now()) {
  return Boolean(stat?.last) && (!stat.lastOk || dueRatio(stat, now) >= 1);
}

export function weightFor(stat, now = Date.now()) {
  if (!stat?.last) return 1;
  const r = dueRatio(stat, now);
  if (!stat.lastOk) return r >= 1 ? 2.5 : 0.5 + 2 * r;
  return r >= 1 ? 1 : 0.25 + 0.75 * r;
}

/**
 * Campionamento pesato senza reinserimento (Efraimidis–Spirakis):
 * chiave = u^(1/w), si tengono le k chiavi più alte.
 */
export function weightedSample(items, k, weight, rand = Math.random) {
  return items
    .map((it) => ({ it, key: Math.pow(rand(), 1 / Math.max(weight(it), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.it);
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ripartisce `total` domande tra i gruppi.
 *  - "equal":        stessa quota per materia (il resto va alle materie con più domande)
 *  - "proportional": quota proporzionale alla dimensione di ciascun gruppo
 * Se un gruppo non ha abbastanza domande, l'eccedenza passa agli altri.
 */
export function allocate(groups, total, mode = "equal") {
  const sizes = groups.map((g) => g.length);
  const cap = Math.min(total, sizes.reduce((a, b) => a + b, 0));
  const out = sizes.map(() => 0);
  let left = cap;
  while (left > 0) {
    const open = sizes.map((s, i) => i).filter((i) => out[i] < sizes[i]);
    if (!open.length) break;
    const base = mode === "proportional"
      ? open.reduce((a, i) => a + (sizes[i] - out[i]), 0)
      : open.length;
    let given = 0;
    for (const i of open) {
      const share = mode === "proportional" ? (sizes[i] - out[i]) / base : 1 / base;
      const n = Math.min(sizes[i] - out[i], Math.floor(left * share));
      out[i] += n;
      given += n;
    }
    if (given === 0) {
      open.sort((a, b) => (sizes[b] - out[b]) - (sizes[a] - out[a]));
      for (const i of open) {
        if (left - given === 0) break;
        out[i]++;
        given++;
      }
    }
    left -= given;
  }
  return out;
}

function groupBySubject(pool) {
  const by = new Map();
  for (const q of pool) {
    if (!by.has(q.subject)) by.set(q.subject, []);
    by.get(q.subject).push(q);
  }
  return by;
}

/** Sessione di allenamento: domande mescolate tra le materie. */
export function buildSession(pool, { count, distribution = "equal", stats = {}, now = Date.now() }) {
  const groups = [...groupBySubject(pool).values()];
  const quotas = allocate(groups, count, distribution);
  const w = (q) => weightFor(stats[q.id], now);
  return shuffle(groups.flatMap((g, i) => weightedSample(g, quotas[i], w)));
}

/**
 * Simulazione d'esame: per ogni materia il numero di domande previsto,
 * raggruppate per materia come nei fogli d'esame reali.
 */
export function buildExam(bank, subjects, { stats = {}, now = Date.now() } = {}) {
  const w = (q) => weightFor(stats[q.id], now);
  return subjects.flatMap((sid) => {
    const paper = bank.exam.papers[sid];
    const qs = bank.bySubject.get(sid) || [];
    return shuffle(weightedSample(qs, Math.min(paper?.questions ?? 0, qs.length), w));
  });
}
