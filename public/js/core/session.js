/**
 * Stato di una sessione. Nessuna dipendenza dal DOM: l'interfaccia legge lo
 * stato e chiama answer()/next()/goTo().
 *
 * mode "practice": esito immediato, la risposta non si cambia.
 * mode "exam":     nessun esito fino alla consegna, risposte modificabili,
 *                  tempo limite (deadline), ci si sposta liberamente.
 */
export class Session {
  constructor({ ids, config, choices, index = 0, started = Date.now(), id, mode = "practice", deadline = null }) {
    this.id = id || `s${started.toString(36)}`;
    this.ids = ids;
    this.config = config;
    this.mode = mode;
    this.deadline = deadline;
    this.choices = choices || ids.map(() => null);
    this.index = index;
    this.started = started;
  }

  static restore(snap) { return new Session(snap); }
  snapshot() {
    const { id, ids, config, choices, index, started, mode, deadline } = this;
    return { id, ids, config, choices, index, started, mode, deadline };
  }

  get isExam() { return this.mode === "exam"; }
  get total() { return this.ids.length; }
  get currentId() { return this.ids[this.index]; }
  get currentChoice() { return this.choices[this.index]; }
  get answered() { return this.choices.filter((c) => c !== null).length; }
  get unanswered() { return this.total - this.answered; }
  get isFirst() { return this.index === 0; }
  get isLast() { return this.index === this.total - 1; }
  get isComplete() { return this.answered === this.total; }
  timeLeft(now = Date.now()) { return this.deadline ? Math.max(0, this.deadline - now) : Infinity; }
  get expired() { return this.timeLeft() === 0; }

  answer(choice) {
    if (!this.isExam && this.choices[this.index] !== null) return false;
    this.choices[this.index] = choice;
    return true;
  }

  next() { if (this.index < this.total - 1) this.index++; }
  prev() { if (this.index > 0) this.index--; }
  goTo(i) { if (i >= 0 && i < this.total) this.index = i; }

  /**
   * Riepilogo calcolato a partire dal banco domande.
   * In allenamento contano solo le domande risposte; in esame tutte
   * (una domanda senza risposta vale come errata, come all'esame vero).
   */
  result(bank) {
    const passMark = bank.exam.passMark;
    const items = this.ids.map((qid, i) => {
      const q = bank.byId.get(qid);
      const chosen = this.choices[i];
      return { qid, subject: q.subject, chosen, ok: chosen !== null && chosen === q.correct };
    });
    const counted = this.isExam ? items : items.filter((x) => x.chosen !== null);
    const correct = counted.filter((x) => x.ok).length;
    const bySubject = {};
    for (const it of counted) {
      const s = (bySubject[it.subject] ||= { total: 0, correct: 0 });
      s.total++;
      s.correct += it.ok ? 1 : 0;
    }
    for (const s of Object.values(bySubject)) s.passed = s.correct / s.total >= passMark;
    const score = counted.length ? correct / counted.length : 0;
    return {
      id: this.id,
      mode: this.mode,
      started: this.started,
      ended: Math.min(Date.now(), this.deadline ?? Infinity),
      timeLimit: this.deadline ? this.deadline - this.started : null,
      total: counted.length,
      correct,
      score,
      passMark,
      // in esame si supera solo se si supera ogni materia
      passed: this.isExam ? Object.values(bySubject).every((s) => s.passed) : score >= passMark,
      bySubject,
      items,
      config: this.config,
    };
  }
}
