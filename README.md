# Banco Domande PPL

Web app statica per allenarsi sui quiz d'esame APPL/PPL: sessioni casuali per una o più materie,
esito immediato, spiegazioni (predisposte), report finale, storico locale.

Nessun framework, nessuna build: HTML + CSS + moduli ES. Si pubblica copiando la cartella `public/`
su qualunque hosting statico (GitHub Pages, Netlify, Cloudflare Pages, un server qualsiasi).

## Struttura

```
public/                    ← il sito, così com'è
  index.html
  css/app.css              token di colore/tipografia in testa, tema chiaro e scuro
  js/
    main.js                avvio e navigazione tra le viste (home → quiz → report)
    core/                  logica pura, senza DOM: testabile e riusabile
      sampler.js           estrazione casuale pesata (penalità per le domande viste di recente)
      session.js           stato di una sessione e calcolo del risultato
      store.js             persistenza con backend intercambiabile (oggi localStorage)
    data/bank.js           caricamento del banco domande e delle spiegazioni
    ui/                    viste e componenti (home, quiz, report, domanda, lightbox)
  data/
    bank.json              materie + domande (generato)
    explanations.json      spiegazioni per id domanda (da compilare)
  img/                     figure delle domande in WebP (generate, nome = hash del contenuto)
tools/
  extract.py               .doc/.docx → bank.json + img/
  artifact_page.py         variante di index.html per la pubblicazione come Artifact su claude.ai
```

## Pubblicazione su GitHub Pages

Il sito è la cartella `public/`, non la radice del repository. Il workflow
`.github/workflows/pages.yml` la pubblica a ogni push su `main`:
in **Settings → Pages → Build and deployment → Source** scegliere **GitHub Actions**.

## Avvio in locale

I moduli ES non funzionano aprendo `index.html` con doppio clic: serve un server.

```bash
cd public && python3 -m http.server 8000
# poi http://localhost:8000
```

## Rigenerare il banco domande

Richiede Python 3.10+, `python-docx`, `Pillow` e LibreOffice (per convertire i `.doc`).

```bash
pip install python-docx pillow
python3 tools/extract.py "/percorso/Quiz_Vilella" --out public
```

Lo script stampa per ogni materia le domande estratte e le anomalie trovate nei sorgenti.

### Formato `bank.json`

```jsonc
{
  "subjects": [{ "id": "navigazione", "code": 6, "short": "NAV", "name": "Navigazione aerea" }],
  "questions": [{
    "id": "navigazione-075",          // stabile: <materia>-<numero a 3 cifre>
    "subject": "navigazione",
    "num": 75,                         // numero nel documento originale
    "mark": "?*",                      // opzionale: marcatore presente nel sorgente
    "text": "Riferimenti: figura 1. Qual è la TC…",
    "extra": "METAR …",                // opzionale: blocco preformattato (METAR, SIGMET, dati)
    "answers": ["078°.", "258°.", "082°.", "262°."],
    "correct": 1,                      // indice; null se il sorgente non è univoco
    "images": ["2673f42bbf34.webp"]    // opzionale
  }]
}
```

Le domande con `correct: null` restano nel file ma l'app non le propone.

## Spiegazioni

`public/data/explanations.json` viene letto solo alla prima apertura di una spiegazione.

```json
{
  "version": 1,
  "items": {
    "navigazione-075": {
      "text": "La TC è l'angolo tra il Nord vero e la rotta…\n\n- punto uno\n- punto due",
      "source": "facoltativo"
    }
  }
}
```

Il testo supporta paragrafi (riga vuota), elenchi `- `, `**grassetto**` e `*corsivo*`.
Se una domanda non ha spiegazione, l'app lo dice nel pannello.

## Estrazione casuale

Peso di ogni domanda: `1 − 0,6 · e^(−giorni dall'ultima volta / 3)`; 1 se mai vista.
Appena vista vale 0,40, dopo 1 giorno 0,57, dopo 3 giorni 0,78, dopo una settimana 0,94.
Le costanti sono in `js/core/sampler.js`. Con più materie la sessione si ripartisce in parti
uguali oppure in proporzione al numero di domande di ciascuna.

## Aspetto e logo

Colori e font sono i token in testa a `css/app.css`. Il logo si imposta in `js/config.js` (`BRAND.logo`):
se il file non esiste o la voce è `null`, la testata si mostra senza logo.

## Dati dell’utente

Statistiche per domanda, storico sessioni, preferenze e sessione in corso stanno nel
`localStorage` del browser (chiave `ppl-quiz:v1`): ogni persona che usa l'app ha i propri dati,
senza account. Per sincronizzarli tra dispositivi basta un backend con la stessa forma di
`localBackend` (`load()` / `save(state)`) passato a `createStore()`.

## Anomalie nei documenti sorgente

| Domanda | Problema | Gestione |
|---|---|---|
| NAV 48, 73, 77 · PRO 5 · COM 69 | nessuna risposta marcata con `*` (domande segnate `?*` nel sorgente) | escluse |
| COM 82 | due risposte marcate (B e C) | esclusa |
| AER 26 | dopo le risposte compare un secondo blocco A–D (copia di quelle della 27) | blocco ignorato |
