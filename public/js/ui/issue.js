/**
 * "Segnala un errore": prepara una segnalazione con tutti i dati della
 * domanda e la apre come issue GitHub (o la fa copiare, per mandarla
 * all'istruttore con un altro mezzo). Destinazione in config.js → REPORT.
 */
import { h, LETTERS } from "./dom.js";
import { openModal, closeModal } from "./modal.js";
import { REPORT } from "../config.js";

const REASONS = [
  { id: "risposta", label: "La risposta indicata come corretta è sbagliata" },
  { id: "testo", label: "Testo della domanda o delle risposte errato o incompleto" },
  { id: "figura", label: "Figura mancante, sbagliata o illeggibile" },
  { id: "obsoleta", label: "Domanda superata dalla normativa attuale" },
  { id: "altro", label: "Altro" },
];

export function openIssueDialog(q, bank, { chosen = null } = {}) {
  const subject = bank.subjectById.get(q.subject);
  let reason = REASONS[0].id;

  const note = h("textarea", {
    id: "issue-note", rows: 4,
    placeholder: "Descrivi il problema. Se conosci la risposta giusta o la fonte (es. SERA.5005), indicala.",
  });

  const reasonList = h("div", { class: "issue-reasons", role: "radiogroup", "aria-label": "Tipo di problema" },
    REASONS.map((r) => h("label", { class: "issue-reason" },
      h("input", { type: "radio", name: "issue-reason", value: r.id, checked: r.id === reason, onchange: () => { reason = r.id; } }),
      h("span", {}, r.label),
    )),
  );

  const title = () => `[${subject.short} ${q.num}] ${REASONS.find((r) => r.id === reason).label}`;
  const body = () => [
    `**Domanda:** ${subject.short} ${q.num} (\`${q.id}\`) · ${subject.name}`,
    `**Problema:** ${REASONS.find((r) => r.id === reason).label}`,
    "",
    note.value.trim() || "_(nessuna nota)_",
    "",
    "---",
    `> ${q.text.replace(/\n/g, "\n> ")}`,
    "",
    ...q.answers.map((a, i) => `- ${LETTERS[i]}. ${a}${i === q.correct ? "  ← indicata come corretta" : ""}${i === chosen ? "  ← risposta data" : ""}`),
  ].join("\n");

  const status = h("p", { class: "issue-status", role: "status" });

  const githubLink = REPORT.github
    ? h("a", {
        class: "btn btn-primary", target: "_blank", rel: "noopener",
        href: "#",
        onclick: (e) => {
          e.currentTarget.href = `https://github.com/${REPORT.github}/issues/new?` +
            new URLSearchParams({ title: title(), body: body() }).toString();
          status.textContent = "Si apre GitHub con la segnalazione già compilata: controlla e premi “Create”.";
        },
      }, "Apri la segnalazione su GitHub")
    : null;

  const copyBtn = h("button", {
    class: REPORT.github ? "btn btn-ghost" : "btn btn-primary", type: "button",
    onclick: async () => {
      const text = `${title()}\n\n${body()}`;
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = "Testo copiato. Incollalo dove preferisci (email, chat con l'istruttore…).";
      } catch {
        note.value = text;
        note.select();
        status.textContent = "Non riesco a copiare automaticamente: il testo è nel riquadro, copialo con Cmd/Ctrl+C.";
      }
    },
  }, "Copia il testo");

  openModal({
    title: `Segnala un errore · ${subject.short} ${q.num}`,
    body: [
      reasonList,
      h("label", { class: "label", for: "issue-note" }, "Nota"),
      note,
      REPORT.email ? h("p", { class: "fineprint" }, "Puoi anche inviarla a ", h("strong", {}, REPORT.email), ".") : null,
      REPORT.github ? h("p", { class: "fineprint" }, "Per aprire la segnalazione su GitHub serve un account gratuito.") : null,
      status,
    ],
    actions: [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal() }, "Annulla"),
      copyBtn,
      githubLink,
    ].filter(Boolean),
  });
}
