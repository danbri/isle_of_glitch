#!/usr/bin/env python3
"""Inject dataset/basemap/qids JSON into the app template.
Emits ../index.html (artifact-ready fragment, no doctype/html/body)
and ../standalone.html (wrapped, for direct browsing)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

def blob(name):
    return json.dumps(json.load(open(os.path.join(ROOT, "data", name))),
                      separators=(",", ":"), ensure_ascii=False)

tpl = open(os.path.join(HERE, "app_template.html")).read()
out = (tpl.replace("__DATASET__", blob("dataset.json"))
          .replace("__BASEMAP__", blob("basemap.json"))
          .replace("__QIDS__", blob("qids.json")))
open(os.path.join(ROOT, "index.html"), "w").write(out)
wrapped = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
           "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
           "</head>\n<body>\n" + out + "\n</body>\n</html>\n")
open(os.path.join(ROOT, "standalone.html"), "w").write(wrapped)
print(f"index.html: {len(out)} bytes; standalone.html: {len(wrapped)} bytes")
