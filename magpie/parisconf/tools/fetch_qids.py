#!/usr/bin/env python3
"""Resolve Wikidata QIDs for cited people via QLever (per CLAUDE.md: QLever,
not Wikimedia; result cached in data/qids.json — re-runs cost nothing)."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "qids.json")
if os.path.exists(OUT):
    print("cached:", OUT); sys.exit(0)

ARTICLES = {
    "bentinck": "Lord_William_Bentinck",
    "portland3": "William_Cavendish-Bentinck,_3rd_Duke_of_Portland",
    "clive": "Robert_Clive",
    "strachey": "Henry_Strachey,_1st_Baronet",
    "elphinstone": "Mountstuart_Elphinstone",
    "court": "East_India_Company",
    "metcalfe": "Charles_Metcalfe,_1st_Baron_Metcalfe",
    "malcolm": "John_Malcolm",
    "rammohun": "Ram_Mohan_Roy",
    "ellenborough": "Edward_Law,_1st_Earl_of_Ellenborough",
    "ranjit": "Ranjit_Singh",
    "curzon_m": "Mary_Curzon,_Baroness_Curzon_of_Kedleston",
    "kitchener": "Herbert_Kitchener,_1st_Earl_Kitchener",
    "portland6": "William_Cavendish-Bentinck,_6th_Duke_of_Portland",
    "adam": "Frederick_Adam",
    "auber": "Peter_Auber",
    "_durbar": "1903_Delhi_Durbar",
    "_sati": "Sati_(practice)",
    "_macaulay": "Thomas_Babington_Macaulay",
}
vals = " ".join(f"<https://en.wikipedia.org/wiki/{t}>" for t in ARTICLES.values())
q = f"""PREFIX schema: <http://schema.org/>
SELECT ?article ?item WHERE {{ VALUES ?article {{ {vals} }} ?article schema:about ?item . }}"""
r = subprocess.run(
    ["curl", "-sS", "--max-time", "60", "https://qlever.dev/api/wikidata",
     "-H", "Accept: application/sparql-results+json",
     "-H", "User-Agent: isle_of_glitch/magpie-parisconf (danbri@danbri.org)",
     "--data-urlencode", f"query={q}"],
    capture_output=True, text=True, check=True)
res = json.loads(r.stdout)
by_article = {}
for b in res["results"]["bindings"]:
    art = b["article"]["value"].rsplit("/", 1)[1]
    qid = b["item"]["value"].rsplit("/", 1)[1]
    by_article[art] = qid
out = {}
for key, art in ARTICLES.items():
    out[key] = {"wp": f"https://en.wikipedia.org/wiki/{art}", "qid": by_article.get(art)}
json.dump(out, open(OUT, "w"), indent=1)
missing = [k for k, v in out.items() if not v["qid"]]
print("resolved:", len(out) - len(missing), "missing:", missing)
