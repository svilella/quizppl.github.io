/**
 * Persistenza dello stato dell'utente (statistiche per domanda, storico
 * sessioni, preferenze, sessione in corso).
 *
 * L'app parla solo con l'interfaccia restituita da createStore(); il
 * "backend" è intercambiabile: oggi localStorage (con fallback in memoria),
 * domani un backend remoto con la stessa forma { load(), save(state) }.
 */
const KEY = "ppl-quiz:v1";
const MAX_SESSIONS = 40;

export const localBackend = {
  load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  },
};

const emptyState = () => ({ v: 1, stats: {}, sessions: [], prefs: {}, current: null });

export function createStore(backend = localBackend) {
  const state = { ...emptyState(), ...(backend.load() || {}) };
  const persist = () => backend.save(state);

  return {
    /** statistiche per domanda: { [id]: { seen, ok, last, lastOk } } */
    get stats() { return state.stats; },
    get sessions() { return state.sessions; },
    get prefs() { return state.prefs; },
    get current() { return state.current; },

    recordAnswer(qid, ok, at = Date.now()) {
      const s = state.stats[qid] || { seen: 0, ok: 0, last: 0, lastOk: false };
      s.seen += 1;
      s.ok += ok ? 1 : 0;
      s.last = at;
      s.lastOk = ok;
      state.stats[qid] = s;
      persist();
    },

    saveCurrent(snapshot) { state.current = snapshot; persist(); },
    clearCurrent() { state.current = null; persist(); },

    addSession(summary) {
      state.sessions.unshift(summary);
      state.sessions.length = Math.min(state.sessions.length, MAX_SESSIONS);
      persist();
    },

    setPrefs(patch) { Object.assign(state.prefs, patch); persist(); },

    reset() {
      Object.assign(state, emptyState());
      persist();
    },
  };
}
