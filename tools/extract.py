#!/usr/bin/env python3
"""
Estrae il database di domande PPL dai file Word (.doc / .docx) e produce:

  public/data/bank.json   – materie + domande (formato documentato in README)
  public/img/<file>       – immagini ottimizzate (WebP) referenziate dalle domande

Uso:
  python3 tools/extract.py <cartella_con_i_doc> [--out public]

Convenzioni dei file sorgente (rilevate dall'analisi dei documenti):
  * domanda   → paragrafo in grassetto che inizia con il numero ("12 Testo…"),
                eventualmente preceduto da marcatori "*" o "?*"
  * risposta  → paragrafo che inizia con "A.-", "B. -", "C. –", ...
  * corretta  → asterisco "*" in coda alla risposta (anche su riga a capo
                o su riga a sé stante dopo una tabella)
  * immagini  → ancorate dentro il blocco della domanda; le figure condivise
                ("Riferimenti: figura N") sono riconosciute dalla didascalia
                "FIGURA N" o dalla prima immagine trovata in una domanda che
                cita quella figura
  * tabelle   → le celle vengono unite con " · "
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
from copy import deepcopy
from dataclasses import dataclass, field, asdict
from pathlib import Path

import docx
from docx.oxml.ns import qn
from PIL import Image

NS_MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
NS_VML = "{urn:schemas-microsoft-com:vml}"
NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

# Metadati delle materie: id stabile, sigla, nome per l'interfaccia.
SUBJECTS = {
    1: ("regolamentazione", "REG", "Regolamentazione aeronautica"),
    2: ("aeromobili", "AER", "Conoscenza generale degli aeromobili"),
    3: ("prestazioni", "PRE", "Prestazioni e pianificazione del volo"),
    4: ("medicina", "MED", "Medicina aeronautica e human performance"),
    5: ("meteorologia", "MET", "Meteorologia"),
    6: ("navigazione", "NAV", "Navigazione aerea"),
    7: ("procedure", "PRO", "Procedure operative"),
    8: ("comunicazioni", "COM", "Comunicazioni"),
    9: ("principi-volo", "PDV", "Principi del volo"),
}

RE_QUESTION = re.compile(r"^\s*(?P<mark>[?*\s]*?)\s*(?P<num>\d{1,3})\s*[.)]?\s*(?P<text>[^\d\s.,].*)$", re.S)
RE_ANSWER = re.compile(r"^\s*(?P<pre>\*?)\s*(?P<letter>[A-E])(?:\s*[.):,;]\s*[-–—]?|\s+[-–—]|\s+(?=[A-ZÀ-Ý]))\s*(?P<text>.*)$", re.S)
RE_CAPTION = re.compile(r"^\s*FIGURA\s*(?P<n>\d+)\s*$", re.I)
RE_FIGREF = re.compile(r"figura\s+(?P<n>\d+)", re.I)
RE_STAR = re.compile(r"\s*\*\s*$")


# --------------------------------------------------------------------------- #
#  1. Linearizzazione del documento                                           #
# --------------------------------------------------------------------------- #
@dataclass
class Line:
    text: str
    bold: bool
    images: list[str] = field(default_factory=list)
    cell: bool = False          # proviene da una cella di tabella


def _run_text(r) -> str:
    out = []
    for x in r:
        if x.tag == qn("w:t"):
            out.append(x.text or "")
        elif x.tag == qn("w:tab"):
            out.append("\t")
        elif x.tag in (qn("w:br"), qn("w:cr")):
            out.append("\n")
    return "".join(out)


def _is_bold(r) -> bool:
    rpr = r.find(qn("w:rPr"))
    if rpr is None:
        return False
    b = rpr.find(qn("w:b"))
    return b is not None and b.get(qn("w:val")) not in ("0", "false")


def linearize(path: Path) -> tuple[list[Line], dict[str, bytes]]:
    """Restituisce i paragrafi in ordine di lettura + le immagini (rId → bytes)."""
    d = docx.Document(str(path))
    rels = {k: v for k, v in d.part.rels.items() if "image" in v.reltype}
    blobs = {k: v.target_part.blob for k, v in rels.items()}
    names = {k: Path(v.target_ref).name for k, v in rels.items()}
    lines: list[Line] = []

    def para(el, cell=False):
        el = deepcopy(el)
        for fb in el.iter(NS_MC + "Fallback"):          # evita contenuti duplicati
            fb.getparent().remove(fb)
        # le caselle di testo diventano paragrafi separati, dopo quello che le ospita
        boxes = []
        for tx in list(el.iter(qn("w:txbxContent"))):
            boxes.extend(tx.findall(qn("w:p")))
            tx.getparent().remove(tx)
        texts, bold_chars, total = [], 0, 0
        for r in el.iter(qn("w:r")):
            t = _run_text(r)
            texts.append(t)
            n = len(t.strip())
            total += n
            bold_chars += n if _is_bold(r) else 0
        imgs = [names[b.get(NS_R + "embed")] for b in el.iter(NS_A + "blip") if b.get(NS_R + "embed") in names]
        imgs += [names[i.get(NS_R + "id")] for i in el.iter(NS_VML + "imagedata") if i.get(NS_R + "id") in names]
        lines.append(Line("".join(texts), total > 0 and bold_chars / total > 0.5, imgs, cell))
        for p in boxes:
            para(p, cell)

    def walk(parent, cell=False):
        for el in parent.iterchildren():
            tag = el.tag.split("}")[1]
            if tag == "p":
                para(el, cell)
            elif tag == "tbl":
                for tr in el.iter(qn("w:tr")):
                    row = [clean(" ".join("".join(_run_text(r) for r in p.iter(qn("w:r")))
                                          for p in tc.iter(qn("w:p"))))
                           for tc in tr.findall(qn("w:tc"))]
                    lines.append(Line(" · ".join(c for c in row if c), _row_bold(tr), [], True))
            elif tag == "sdt":
                c = el.find(qn("w:sdtContent"))
                if c is not None:
                    walk(c, cell)

    walk(d.element.body)
    return lines, {names[k]: blobs[k] for k in names}


def _row_bold(tr) -> bool:
    runs = list(tr.iter(qn("w:r")))
    return bool(runs) and all(_is_bold(r) for r in runs if _run_text(r).strip())


# --------------------------------------------------------------------------- #
#  2. Parsing                                                                 #
# --------------------------------------------------------------------------- #
@dataclass
class Answer:
    text: str
    correct: bool = False


@dataclass
class Question:
    num: int
    mark: str
    text: str
    extra: list[str] = field(default_factory=list)     # righe non in grassetto prima delle risposte
    answers: list[Answer] = field(default_factory=list)
    images: list[str] = field(default_factory=list)


def clean(s: str) -> str:
    s = s.replace(" ", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", s).strip()


def parse(lines: list[Line]) -> tuple[list[Question], dict[int, str], list[str]]:
    qs: list[Question] = []
    figures: dict[int, str] = {}
    warnings: list[str] = []
    cur: Question | None = None
    skipping = False
    last_images: list[str] = []          # immagini appena viste, in attesa di didascalia

    def expected_letter():
        return "ABCDE"[len(cur.answers)] if cur and len(cur.answers) < 5 else None

    for i, ln in enumerate(lines):
        raw = ln.text
        t = clean(raw)

        # didascalia di figura condivisa
        cap = RE_CAPTION.match(t)
        if cap and last_images:
            figures[int(cap["n"])] = last_images[0]
            if cur and last_images[0] in cur.images:
                cur.images.remove(last_images[0])
            last_images = []
            continue

        if ln.images:
            last_images = list(ln.images)
            if cur is not None:
                refs = RE_FIGREF.findall(cur.text)
                if refs and cur.answers and int(refs[0]) not in figures:
                    # immagine posta dopo le risposte di una domanda "Riferimenti: figura N"
                    figures[int(refs[0])] = ln.images[0]
                else:
                    for im in ln.images:
                        if im not in cur.images:
                            cur.images.append(im)
        elif t:
            last_images = []

        if not t:
            continue

        # nuova domanda?
        m = RE_QUESTION.match(t)
        if ln.bold and m and not ln.cell and (cur is None or cur.answers):
            num = int(m["num"])
            if cur is None and m["text"].isupper():
                continue                                     # titolo del documento
            cur = Question(num=num, mark=m["mark"].replace(" ", ""), text=m["text"].strip())
            skipping = False
            qs.append(cur)
            if ln.images:
                cur.images.extend(x for x in ln.images if x not in cur.images)
            continue
        if cur is None:
            continue

        # risposta?
        a = RE_ANSWER.match(t)
        if a and not ln.cell and a["letter"] == "A" and cur.answers and not skipping:
            # secondo blocco di risposte senza domanda (refuso nel sorgente): lo si ignora
            warnings.append(f"Q{cur.num}: blocco di risposte orfano ignorato")
            skipping = True
            continue
        if skipping:
            continue
        if a and not ln.cell and a["letter"] == expected_letter():
            body = a["text"]
            star = bool(RE_STAR.search(body)) or bool(a["pre"])
            cur.answers.append(Answer(RE_STAR.sub("", body).strip(), star))
            continue

        # riga a sé con il solo asterisco
        if t == "*" and cur.answers:
            cur.answers[-1].correct = True
            continue

        if cur.answers:
            # continuazione dell'ultima risposta (testo a capo o cella di tabella)
            ans = cur.answers[-1]
            star = bool(RE_STAR.search(t))
            piece = RE_STAR.sub("", t).strip()
            sep = " · " if ln.cell and ans.text else " "
            ans.text = (ans.text + sep + piece).strip()
            ans.correct = ans.correct or star
        elif ln.bold or ln.cell:
            sep = "\n" if ln.cell else " "
            cur.text = (cur.text + sep + t).strip()
        else:
            cur.extra.append(raw.replace("\t", "    ").rstrip())

    # figure condivise
    for q in qs:
        for n in RE_FIGREF.findall(q.text):
            f = figures.get(int(n))
            if f and f not in q.images:
                q.images.append(f)
            elif not f:
                warnings.append(f"Q{q.num}: figura {n} non trovata")

    # normalizzazioni finali
    for q in qs:
        q.text = q.text.replace(" \n", "\n").strip()
        q.text = re.sub(r"\s*\*\s*$", "", q.text)
        q.text = re.sub(r"\?\s*\?$", "?", q.text)
        # rimuove righe vuote in coda / in testa al blocco extra
        while q.extra and not q.extra[-1].strip():
            q.extra.pop()
        while q.extra and not q.extra[0].strip():
            q.extra.pop(0)
        n_ok = sum(a.correct for a in q.answers)
        if n_ok != 1:
            warnings.append(f"Q{q.num}: {n_ok} risposte marcate come corrette")
        if len(q.answers) < 2:
            warnings.append(f"Q{q.num}: solo {len(q.answers)} risposte")

    nums = [q.num for q in qs]
    for a, b in zip(nums, nums[1:]):
        if b != a + 1:
            warnings.append(f"numerazione: Q{a} → Q{b}")
    return qs, figures, warnings


# --------------------------------------------------------------------------- #
#  3. Output                                                                  #
# --------------------------------------------------------------------------- #
def save_image(blob: bytes, out_dir: Path) -> str:
    """Converte in WebP (lossless per i disegni piccoli, lossy per le carte) e deduplica per hash."""
    h = hashlib.sha1(blob).hexdigest()[:12]
    name = f"{h}.webp"
    dest = out_dir / name
    if not dest.exists():
        im = Image.open(io.BytesIO(blob))
        if im.mode in ("P", "LA", "RGBA"):
            bg = Image.new("RGB", im.size, "white")
            im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if max(im.size) > 1800:
            im.thumbnail((1800, 1800), Image.LANCZOS)
        small = im.width * im.height < 250_000
        im.save(dest, "WEBP", lossless=small, quality=82, method=6)
    return name


def to_doc(src: Path, tmp: Path) -> Path:
    if src.suffix.lower() == ".docx":
        return src
    subprocess.run(["soffice", "--headless", "--convert-to", "docx", "--outdir", str(tmp), str(src)],
                   check=True, capture_output=True)
    return tmp / (src.stem + ".docx")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "public")
    args = ap.parse_args()

    img_dir = args.out / "img"
    img_dir.mkdir(parents=True, exist_ok=True)
    bank = {"version": 1, "subjects": [], "questions": []}
    report = []

    files = sorted(p for p in args.src.iterdir() if p.suffix.lower() in (".doc", ".docx"))
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            m = re.search(r"APPL\s+(\d)", f.name)
            if not m:
                print(f"saltato: {f.name}", file=sys.stderr)
                continue
            n = int(m[1])
            sid, short, name = SUBJECTS[n]
            lines, blobs = linearize(to_doc(f, Path(tmp)))
            qs, figures, warnings = parse(lines)
            bank["subjects"].append({"id": sid, "code": n, "short": short, "name": name})
            valid = 0
            for q in qs:
                ok = sum(a.correct for a in q.answers) == 1 and len(q.answers) >= 2
                valid += ok
                bank["questions"].append({
                    "id": f"{sid}-{q.num:03d}",
                    "subject": sid,
                    "num": q.num,
                    **({"mark": q.mark} if q.mark else {}),
                    "text": q.text,
                    **({"extra": "\n".join(q.extra)} if q.extra else {}),
                    "answers": [a.text for a in q.answers],
                    "correct": next((i for i, a in enumerate(q.answers) if a.correct), None) if ok else None,
                    **({"images": [save_image(blobs[i], img_dir) for i in q.images]} if q.images else {}),
                })
            report.append((n, name, len(qs), valid, warnings))

    (args.out / "data").mkdir(exist_ok=True)
    with open(args.out / "data" / "bank.json", "w", encoding="utf-8") as fh:
        json.dump(bank, fh, ensure_ascii=False, separators=(",", ":"))

    for n, name, tot, valid, warns in report:
        print(f"[{n}] {name}: {tot} domande, {valid} utilizzabili")
        for w in warns:
            print(f"      ! {w}")


if __name__ == "__main__":
    main()
