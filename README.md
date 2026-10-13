# PPL Question Bank

Web app statica per allenarsi sui quiz d'esame APPL/PPL:

- **allenamento** su una o più materie con esito immediato e ripasso intelligente;
- **simulazione d'esame** con numero di domande e tempo previsti per ogni materia;
- **domande segnate**, **segnalazione errori**, spiegazioni (predisposte), report finale;
- **esporta / importa** i progressi per cambiare dispositivo.

Nessun framework, nessuna build: HTML + CSS + moduli ES. Si pubblica copiando la cartella `public/`
su qualunque hosting statico (GitHub Pages, Netlify, Cloudflare Pages, un server qualsiasi).

## Struttura

```
public/                    ← il sito, così com'è
  index.html
  css/app.css              token di colore/tipografia in testa, tema chiaro e scuro
  js/
    main.js                avvio e navigazione tra le viste (home → allenamento | esame → report)
    config.js              logo e destinazione delle segnalazioni
    core/                  logica pura, senza DOM: testabile e riusabile
      sampler.js           ripasso intelligente ed estrazione delle domande (allenamento ed esame)
      session.js           stato di una sessione (allenamento o esame) e calcolo del risultato
      store.js             persistenza, domande segnate, esporta/importa (oggi localStorage)
    data/bank.js           caricamento di banco domande, struttura d'esame e spiegazioni
    ui/
      home.js              materie, scelta della modalità, storico
      quiz.js              allenamento: una domanda alla volta, esito immediato
      exam.js              simulazione d'esame: timer, griglia delle domande, consegna
      report.js            esito, dettaglio per materia, revisione
      question.js          domanda, risposte, spiegazione, stellina e "segnala errore"
      issue.js             finestra di segnalazione errore
      data-panel.js        esporta / importa i progressi
      modal.js, lightbox.js, dom.js
  data/
    bank.json              materie + domande (generato)
    exam.json              domande e minuti per materia nella simulazione d'esame
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

## Ripasso intelligente

Ogni domanda tiene la sua "serie" di risposte giuste consecutive; un errore la azzera.
La serie decide dopo quanto la domanda torna in scadenza:

| serie | 0 (sbagliata) | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|---|
| intervallo | 6 ore | 1 g | 3 g | 7 g | 16 g | 35 g |

Nell'estrazione casuale una domanda mai vista pesa 1, una sbagliata in scadenza 2,5
(appena sbagliata 0,5, poi sale), una giusta non ancora in scadenza da 0,25 a 1.
"Da ripassare" raccoglie le sbagliate e quelle con l'intervallo scaduto.
Costanti in `js/core/sampler.js`. Con più materie l'allenamento si ripartisce in parti uguali
oppure in proporzione al numero di domande di ciascuna.

## Simulazione d'esame

`public/data/exam.json` definisce, per ogni materia, domande e minuti:

```json
{ "passMark": 0.75, "papers": { "navigazione": { "questions": 20, "minutes": 60 } } }
```

Valori attuali: Regolamentazione e Meteorologia 20 domande in 40 min, Navigazione 20 in 60 min,
le altre materie 12 in 25 min; soglia 75% per materia. Da verificare con la scuola se ENAC
cambia la struttura. Più materie selezionate = un'unica prova con tempi e domande sommati;
l'esame è superato solo se lo è ogni materia. Nessun esito fino alla consegna, risposte
modificabili, consegna automatica allo scadere del tempo; le statistiche si aggiornano alla consegna.

## Segnalazione errori

Il pulsante "Segnala errore" prepara una segnalazione con materia, numero, testo, risposte e
nota, e la apre come issue nel repository indicato in `js/config.js` (`REPORT.github`).
In alternativa la si copia per mandarla con un altro mezzo (`REPORT.email` mostra un indirizzo).

## Aspetto e logo

Colori e font sono i token in testa a `css/app.css`. Il logo si imposta in `js/config.js` (`BRAND.logo`):
se il file non esiste o la voce è `null`, la testata si mostra senza logo.

## Dati dell’utente

Statistiche per domanda, domande segnate, storico sessioni, preferenze e sessione in corso
stanno nel `localStorage` del browser (chiave `ppl-quiz:v1`): ogni persona che usa l'app ha i
propri dati, senza account. Dalla home si esportano in un file JSON e si reimportano su un altro
dispositivo; l'import unisce (per ogni domanda vince il tentativo più recente). Per sincronizzarli tra dispositivi basta un backend con la stessa forma di
`localBackend` (`load()` / `save(state)`) passato a `createStore()`.

## Anomalie nei documenti sorgente

| Domanda | Problema | Gestione |
|---|---|---|
| NAV 48, 73, 77 · PRO 5 · COM 69 | nessuna risposta marcata con `*` (domande segnate `?*` nel sorgente) | escluse |
| COM 82 | due risposte marcate (B e C) | esclusa |
| AER 26 | dopo le risposte compare un secondo blocco A–D (copia di quelle della 27) | blocco ignorato |
