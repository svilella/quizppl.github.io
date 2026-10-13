import { h } from "./dom.js";

/**
 * "I tuoi progressi": esporta in un file JSON e reimporta (anche su un altro
 * dispositivo). L'import unisce i dati, non cancella nulla.
 */
export function dataPanel(store, { onImported, message = "" } = {}) {
  const status = h("p", { class: "fineprint", role: "status" }, message);

  const exportBtn = h("button", {
    class: "btn btn-ghost btn-small", type: "button",
    onclick: () => {
      const blob = new Blob([JSON.stringify(store.exportData(), null, 1)], { type: "application/json" });
      const a = h("a", {
        href: URL.createObjectURL(blob),
        download: `banco-domande-ppl-progressi-${new Date().toISOString().slice(0, 10)}.json`,
      });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      status.textContent = "File salvato nella cartella Download.";
    },
  }, "Esporta");

  const fileInput = h("input", {
    id: "import-file", type: "file", accept: "application/json,.json", hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      try {
        const res = store.importData(JSON.parse(await file.text()));
        status.textContent = `Importati: ${res.questions} domande aggiornate, ${res.flags} segnate, ${res.sessions} sessioni.`;
        onImported?.(status.textContent);
      } catch (err) {
        status.textContent = err instanceof SyntaxError
          ? "Il file non è leggibile: scegli il .json esportato da questa app."
          : err.message;
      }
    },
  });
  const importBtn = h("button", { class: "btn btn-ghost btn-small", type: "button", onclick: () => fileInput.click() }, "Importa");

  return h("section", { class: "panel data-panel", "aria-labelledby": "h-data" },
    h("h2", { id: "h-data" }, "I tuoi progressi"),
    h("p", { class: "fineprint" },
      "Sono salvati solo in questo browser. Esportali per non perderli o per continuare su un altro dispositivo: ",
      "l'import unisce i dati a quelli presenti."),
    h("div", { class: "link-row" }, exportBtn, importBtn, fileInput),
    status,
  );
}
