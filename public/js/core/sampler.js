/**
 * Selezione casuale pesata delle domande.
 *
 * Ogni domanda ha peso 1 se mai vista; se vista di recente il peso scende
 * fino a (1 − MAX_PENALTY) e torna verso 1 con decadimento esponenziale.
 * La penalità è volutamente leggera: una domanda appena vista resta
 * estraibile, solo meno probabile.
 *
 *   peso = 1 − MAX_PENALTY · e^(−giorni_trascorsi / DECAY_DAYS)
 *
 *   appena vista → 0.40   ·   dopo 1 g → 0.57   ·   dopo 3 g → 0.78   ·   dopo 7 g → 0.94
 */
export const MAX_PENALTY = 0.6;
export const DECAY_DAYS = 3;
const DAY = 86_400_000;

export function weightFor(stat, now = Date.now()) {
  if (!stat?.last) return 1;
  const days = Math.max(0, now - stat.last) / DAY;
  return 1 - MAX_PENALTY * Math.exp(-days / DECAY_DAYS);
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
      // distribuisce le unità residue, prima ai gruppi più capienti
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

/**
 * Costruisce l'elenco di domande di una sessione.
 * @param {object[]} pool       domande candidate (già filtrate)
 * @param {object}   opts       { count, distribution, stats, now }
 */
export function buildSession(pool, { count, distribution = "equal", stats = {}, now = Date.now() }) {
  const bySubject = new Map();
  for (const q of pool) {
    if (!bySubject.has(q.subject)) bySubject.set(q.subject, []);
    bySubject.get(q.subject).push(q);
  }
  const groups = [...bySubject.values()];
  const quotas = allocate(groups, count, distribution);
  const w = (q) => weightFor(stats[q.id], now);
  const picked = groups.flatMap((g, i) => weightedSample(g, quotas[i], w));
  return shuffle(picked);
}
