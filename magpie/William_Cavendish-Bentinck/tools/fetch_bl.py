#!/usr/bin/env python3
"""Download BL searcharchives catalogue records for the Cavendish-Bentinck
India Office search (162 hits). Paced, cached: skips files already on disk."""
import json, os, sys, time, urllib.request, urllib.parse

BASE = "https://searcharchives.bl.uk/catalog.json"
PARAMS = {
    "f[collection_area_ssi][]": "India Office Records and Private Papers",
    "q": "William Cavendish-Bentinck",
    "search_field": "all_fields",
    "per_page": "100",
}
UA = "isle_of_glitch/magpie-parisconf research fetcher (contact: danbri@danbri.org)"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return json.load(open(dest))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            d = json.loads(body)
            with open(dest, "wb") as f:
                f.write(body)
            time.sleep(0.6)
            return d
        except Exception as e:
            print(f"  retry {attempt+1} for {url}: {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")

def main():
    os.makedirs(os.path.join(DATA, "records"), exist_ok=True)
    ids = []
    page = 1
    while True:
        p = dict(PARAMS); p["page"] = str(page)
        url = BASE + "?" + urllib.parse.urlencode(p)
        d = get(url, os.path.join(DATA, f"search_page_{page}.json"))
        for doc in d["data"]:
            ids.append(doc["id"])
        meta = d["meta"]["pages"]
        print(f"page {page}/{meta['total_pages']}: {len(ids)}/{meta['total_count']} ids")
        if not meta["next_page"]:
            break
        page = meta["next_page"]
    with open(os.path.join(DATA, "ids.json"), "w") as f:
        json.dump(ids, f, indent=1)
    for i, rid in enumerate(ids):
        dest = os.path.join(DATA, "records", f"{rid}.json")
        get(f"https://searcharchives.bl.uk/catalog/{rid}.json", dest)
        if (i + 1) % 20 == 0:
            print(f"records: {i+1}/{len(ids)}")
    print(f"done: {len(ids)} records")

if __name__ == "__main__":
    main()
