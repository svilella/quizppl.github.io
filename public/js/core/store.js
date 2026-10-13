/**
 * Persistenza dello stato dell'utente: statistiche per domanda, domande segnate,
 * storico sessioni, preferenze, sessione in corso.
 *
 * L'app parla solo con l'interfaccia restituita da createStore(); il
 * "backend" è intercambiabile: oggi localStorage (con fallback in memoria),
 * domani un backend remoto con la stessa forma { load(), save(state) }.
 */
const KEY = "ppl-quiz:v1";
const MAX_SESSIONS = 60;
export const EXPORT_APP = "banco-domande-ppl";
export const EXPORT_VERSION = 1;

export const localBackend = {
  load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  },
};

const emptyState = () => ({ v: 1, stats: {}, flags: {}, sessions: [], prefs: {}, current: null });

export function createStore(backend = localBackend) {
  const state = { ...emptyState(), ...(backend.load() || {}) };
  state.flags ||= {};
  const persist = () => backend.save(state);

  return {
    /** statistiche per domanda: { [id]: { seen, ok, last, lastOk, streak } } */
    get stats() { return state.stats; },
    /** domande segnate: { [id]: timestamp } */
    get flags() { return state.flags; },
    get sessions() { return state.sessions; },
    get prefs() { return state.prefs; },
    get current() { return state.current; },

    recordAnswer(qid, ok, at = Date.now()) {
      const s = state.stats[qid] || { seen: 0, ok: 0, last: 0, lastOk: false, streak: 0 };
      s.streak = ok ? (s.streak ?? (s.lastOk ? 1 : 0)) + 1 : 0;   // risposte giuste consecutive
      s.seen += 1;
      s.ok += ok ? 1 : 0;
      s.last = at;
      s.lastOk = ok;
      state.stats[qid] = s;
      persist();
    },

    isFlagged: (qid) => Boolean(state.flags[qid]),
    toggleFlag(qid) {
      if (state.flags[qid]) delete state.flags[qid];
      else state.flags[qid] = Date.now();
      persist();
      return Boolean(state.flags[qid]);
    },

    saveCurrent(snapshot) { state.current = snapshot; persist(); },
    clearCurrent() { state.current = null; persist(); },

    addSession(summary) {
      state.sessions = [summary, ...state.sessions.filter((s) => s.id !== summary.id)].slice(0, MAX_SESSIONS);
      persist();
    },

    setPrefs(patch) { Object.assign(state.prefs, patch); persist(); },

    /** Copia completa dei progressi, da salvare in un file. */
    exportData() {
      const { stats, flags, sessions, prefs } = state;
      return { app: EXPORT_APP, version: EXPORT_VERSION, exported: new Date().toISOString(), stats, flags, sessions, prefs };
    },

    /**
     * Unisce un file esportato con i dati presenti (utile per passare da un
     * dispositivo all'altro senza perdere nulla). Per ogni domanda vince il
     * tentativo più recente; segnate e sessioni vengono unite.
     */
    importData(data) {
      if (!data || data.app !== EXPORT_APP || typeof data.stats !== "object") {
        throw new Error("Il file non è un'esportazione di Banco Domande PPL.");
      }
      let questions = 0;
      for (const [qid, theirs] of Object.entries(data.stats || {})) {
        const mine = state.stats[qid];
        if (!theirs || typeof theirs.last !== "number") continue;
        if (!mine || theirs.last > mine.last) {
          state.stats[qid] = { ...theirs, seen: Math.max(theirs.seen || 0, mine?.seen || 0), ok: Math.max(theirs.ok || 0, mine?.ok || 0) };
          questions++;
        }
      }
      let flags = 0;
      for (const [qid, ts] of Object.entries(data.flags || {})) {
        if (!state.flags[qid]) { state.flags[qid] = ts; flags++; }
      }
      const known = new Set(state.sessions.map((s) => s.id));
      const added = (data.sessions || []).filter((s) => s?.id && !known.has(s.id));
      state.sessions = [...state.sessions, ...added].sort((a, b) => b.ended - a.ended).slice(0, MAX_SESSIONS);
      persist();
      return { questions, flags, sessions: added.length };
    },
  };
}
