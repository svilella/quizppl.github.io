/**
 * Stato di una sessione di quiz. Nessuna dipendenza dal DOM:
 * l'interfaccia legge lo stato e chiama answer()/next().
 */
export class Session {
  /**
   * @param {object} p
   * @param {string[]} p.ids        id delle domande in ordine
   * @param {object}   p.config     opzioni con cui è stata creata (per "ripeti")
   * @param {(number|null)[]} [p.choices]
   * @param {number}   [p.index]
   * @param {number}   [p.started]
   */
  constructor({ ids, config, choices, index = 0, started = Date.now(), id }) {
    this.id = id || `s${started.toString(36)}`;
    this.ids = ids;
    this.config = config;
    this.choices = choices || ids.map(() => null);
    this.index = index;
    this.started = started;
  }

  static restore(snap) { return new Session(snap); }
  snapshot() {
    const { id, ids, config, choices, index, started } = this;
    return { id, ids, config, choices, index, started };
  }

  get total() { return this.ids.length; }
  get currentId() { return this.ids[this.index]; }
  get currentChoice() { return this.choices[this.index]; }
  get answered() { return this.choices.filter((c) => c !== null).length; }
  get isLast() { return this.index === this.total - 1; }
  get isComplete() { return this.answered === this.total; }

  answer(choice) {
    if (this.choices[this.index] !== null) return false;
    this.choices[this.index] = choice;
    return true;
  }

  next() {
    if (this.index < this.total - 1) this.index++;
  }

  /** Riepilogo calcolato a partire dal banco domande. */
  result(bank) {
    const items = this.ids.map((qid, i) => {
      const q = bank.byId.get(qid);
      const chosen = this.choices[i];
      return { qid, subject: q.subject, chosen, ok: chosen !== null && chosen === q.correct };
    });
    const done = items.filter((x) => x.chosen !== null);
    const correct = done.filter((x) => x.ok).length;
    const bySubject = {};
    for (const it of done) {
      const s = (bySubject[it.subject] ||= { total: 0, correct: 0 });
      s.total++;
      s.correct += it.ok ? 1 : 0;
    }
    return {
      id: this.id,
      started: this.started,
      ended: Date.now(),
      total: done.length,
      correct,
      score: done.length ? correct / done.length : 0,
      bySubject,
      items,
      config: this.config,
    };
  }
}
