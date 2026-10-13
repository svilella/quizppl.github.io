/**
 * Accesso al banco domande (data/bank.json) e alle spiegazioni
 * (data/explanations.json). Tutti i percorsi sono relativi alla pagina,
 * così l'app funziona identica su qualsiasi hosting statico.
 */
const BASE = new URL("../../", import.meta.url);
export const assetUrl = (path) => new URL(path, BASE).href;

export async function loadBank() {
  const [res, examRes] = await Promise.all([
    fetch(assetUrl("data/bank.json")),
    fetch(assetUrl("data/exam.json")).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`Impossibile caricare il banco domande (HTTP ${res.status}).`);
  const raw = await res.json();
  const exam = examRes?.ok ? await examRes.json() : { passMark: 0.75, papers: {} };

  const subjects = raw.subjects.slice().sort((a, b) => a.code - b.code);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  // le domande senza una risposta corretta univoca nel sorgente restano nel file ma non vengono proposte
  const questions = raw.questions.filter((q) => Number.isInteger(q.correct));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const bySubject = new Map(subjects.map((s) => [s.id, []]));
  for (const q of questions) bySubject.get(q.subject)?.push(q);

  return {
    subjects,
    subjectById,
    questions,
    byId,
    bySubject,
    excluded: raw.questions.length - questions.length,
    /** struttura della simulazione d'esame: { passMark, papers: { [materia]: { questions, minutes } } } */
    exam: { passMark: exam.passMark ?? 0.75, source: exam.source, papers: exam.papers || {} },
    imageUrl: (name) => assetUrl(`img/${name}`),
  };
}

/**
 * Spiegazioni: file separato, caricato una sola volta alla prima richiesta.
 * Formato: { "version": 1, "items": { "<id domanda>": { "text": "…", "source": "…" } } }
 * Il testo supporta paragrafi, **grassetto**, *corsivo* ed elenchi "- ".
 */
let explanations = null;
export async function getExplanation(qid) {
  if (!explanations) {
    explanations = fetch(assetUrl("data/explanations.json"))
      .then((r) => (r.ok ? r.json() : { items: {} }))
      .catch(() => ({ items: {} }));
  }
  return (await explanations).items?.[qid] || null;
}
