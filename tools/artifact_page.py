#!/usr/bin/env python3
"""Genera la variante "frammento" di index.html per la pubblicazione come Artifact su claude.ai
(che aggiunge da sé doctype/head/body). Uso: python3 tools/artifact_page.py > dist/artifact.html"""
import re, sys
from pathlib import Path
src = (Path(__file__).resolve().parent.parent / "public" / "index.html").read_text(encoding="utf-8")
grab = lambda tag: re.search(rf"<!-- {tag} -->\n(.*?)<!-- /{tag} -->", src, re.S)[1]
sys.stdout.write(grab("page:head") + grab("page:body"))
