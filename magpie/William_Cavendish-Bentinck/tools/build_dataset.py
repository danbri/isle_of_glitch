#!/usr/bin/env python3
"""Distil the 162 downloaded BL catalogue records into data/dataset.json
for the single-file explorer app.

Input:  data/records/*.json  (Blacklight JSON:API detail records)
Output: data/dataset.json    (compact: entries, people, places, edges, series)

Place coordinates are a hand-curated gazetteer of the historic place names
appearing in the catalogue titles; several minor places are approximate
(flagged "approx") — good enough for a small-scale overview map.
"""
import glob
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

# ---------------------------------------------------------------- gazetteer
# id: (label, lat, lon, patterns, modern-name-or-None, approx?)
GAZ = {
    "london":      ("London", 51.507, -0.128, r"London|Berkeley Square|Bentinck Street", None, False),
    "calcutta":    ("Calcutta", 22.573, 88.364, r"Calcutta", "Kolkata", False),
    "madras":      ("Madras", 13.083, 80.270, r"Madras", "Chennai", False),
    "bombay":      ("Bombay", 18.940, 72.835, r"Bombay", "Mumbai", False),
    "delhi":       ("Delhi", 28.652, 77.231, r"Delhi", None, False),
    "benares":     ("Benares", 25.318, 83.007, r"Benares", "Varanasi", False),
    "darjeeling":  ("Darjeeling", 27.041, 88.263, r"Darjeeling", None, False),
    "mysore":      ("Mysore", 12.305, 76.655, r"Mysore", "Mysuru", False),
    "bangalore":   ("Bangalore", 12.972, 77.594, r"Bangalore", "Bengaluru", False),
    "lucknow":     ("Oude (Lucknow)", 26.847, 80.947, r"Oude\b", "Awadh / Lucknow", False),
    "lahore":      ("Lahore", 31.558, 74.351, r"Lahore|Runjeet Singh", None, False),
    "murshidabad": ("Moorshedabad", 24.176, 88.271, r"Moorshedabad", "Murshidabad", False),
    "ajmer":       ("Ajmere", 26.450, 74.640, r"Ajmere", "Ajmer", False),
    "bhopal":      ("Bhopaul", 23.259, 77.413, r"Bhopaul", "Bhopal", False),
    "gwalior":     ("Gwalior", 26.218, 78.183, r"Gwalior|Shujawulpore", None, False),
    "nagpur":      ("Nagpore", 21.146, 79.089, r"Nagpore|Nagpur", "Nagpur", False),
    "landour":     ("Landour", 30.459, 78.103, r"Landour", "Mussoorie", False),
    "moradabad":   ("Moradabad", 28.839, 78.777, r"Moradabad", None, False),
    "hapur":       ("Hauper", 28.730, 77.776, r"Hauper", "Hapur", True),
    "shahabad":    ("Shahabad", 25.556, 84.663, r"Shahabad", "Arrah district", True),
    "pratapgarh":  ("Pertaubghur", 25.920, 81.990, r"Pertaubghur", "Pratapgarh", True),
    "sikrora":     ("Secrora", 27.180, 81.470, r"Secrora", "Sikrora, Bahraich", True),
    "hijli":       ("Hidgelee", 21.800, 87.700, r"Hidgelee", "Hijli", True),
    "doab":        ("The Dooab", 27.400, 79.200, r"Dooab", "Ganges-Yamuna Doab", True),
    "yamuna":      ("Jumma river", 27.180, 78.020, r"Jumma\b", "Yamuna", True),
    "ghaghara":    ("Gogra river", 26.780, 82.130, r"Gogra", "Ghaghara", True),
    "bahawalpur":  ("Bhawulpore", 29.395, 71.683, r"Bhawulpore", "Bahawalpur", False),
    "charkhari":   ("Chirkaree", 25.402, 79.750, r"Chirkaree", "Charkhari", True),
    "malaun":      ("Malown fort", 31.080, 76.980, r"Malown", "Malaun", True),
    "fars":        ("Fars (Persia)", 29.610, 52.530, r"\bFars\b|Farsistan", "Shiraz, Iran", True),
    "penang":      ("Straits Settlements", 5.414, 100.330, r"Straits Settlements", "Penang", False),
    "ahmednagar":  ("Ahmednuggur", 19.095, 74.749, r"Ahmednuggur", "Ahmednagar", False),
    "seroor":      ("Seroor", 18.823, 74.375, r"Seroor", "Shirur", True),
    "coorg":       ("Coorg", 12.420, 75.740, r"Coorg", "Kodagu", False),
    "bharatpur":   ("Bhurtpore", 27.217, 77.490, r"Bhurtpore", "Bharatpur", False),
    "agra":        ("Upper Provinces", 27.177, 78.008, r"Upper (&|&amp;|and) Western Provinces", "Bentinck's 1832-33 tour; centred on Agra", True),
    "travancore":  ("Travancore", 8.507, 76.947, r"Travancore", "Thiruvananthapuram", False),
}

# ---------------------------------------------------------------- people
# id: (label, patterns, role)
PEOPLE = {
    "bentinck":    ("Lord William Bentinck", r"Bentinck, (General )?Lord William Cavendish|Lord William (Henry )?Cavendish[- ]Bentinck|Cavendish Bentinck, Governor General", "Governor-General of India 1828-1835"),
    "portland3":   ("3rd Duke of Portland", r"3rd Duke of Portland", "William Henry Cavendish Cavendish-Bentinck, twice Prime Minister; father of Lord William"),
    "clive":       ("Robert Clive", r"\bClive\b", "Clive of India, 1st Baron Clive"),
    "strachey":    ("Henry Strachey", r"Strachey", "Secretary to Lord Clive; 1st Baronet"),
    "elphinstone": ("Mountstuart Elphinstone", r"Elphinstone", "Statesman and historian; Governor of Bombay 1819-1827"),
    "milne":       ("John Milne", r"John Milne", "Correspondent at Bombay, 1834"),
    "court":       ("Court of Directors, EIC", r"Court of Directors", "Governing board of the East India Company, London"),
    "scott":       ("William Scott", r"William Scott, Bentinck Street", "Petitioner, Bentinck Street, London, 1784"),
    "ryan":        ("W. C. B. Ryan", r"Ryan, William Cavendish Bentinck", "Officer, Bengal Army / Bengal Staff Corps, 1850-1875"),
    "metcalfe":    ("Charles Metcalfe", r"Metcalfe", "Member of Council; acting Governor-General 1835-1836"),
    "malcolm":     ("Sir John Malcolm", r"Malcolm, John", "Diplomat; Governor of Bombay 1827-1830"),
    "rammohun":    ("Raja Rammohun Roy", r"Rammohun Roy", "Reformer; ally in the abolition of sati"),
    "ellenborough":("Earl of Ellenborough", r"Ellenborough", "President of the Board of Control 1828-1830"),
    "auber":       ("Peter Auber", r"Auber, Peter", "Secretary to the East India Company"),
    "ranjit":      ("Ranjit Singh", r"Runjeet Singh", "Maharaja of the Sikh Empire; met Bentinck at Rupar, 1831"),
    "curzon_m":    ("Lady Curzon", r"Lady Curzon", "Mary Curzon, Vicereine of India"),
    "kitchener":   ("Lord Kitchener", r"Kitchener", "Commander-in-Chief, India 1902-1909"),
    "portland6":   ("6th Duke & Duchess of Portland", r"Duke and Duchess of Portland", "At the 1903 Delhi Durbar"),
    "adam":        ("Sir Frederick Adam", r"Sir F\. Adam", "Governor of Madras 1832-1837"),
}

def val(a, k):
    v = a.get(k)
    return v["attributes"]["value"] if isinstance(v, dict) else None

def clean(s):
    if not s:
        return ""
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}

def parse_dates(a):
    disp = clean(val(a, "date_range_tsi")) or ""
    s = clean(val(a, "start_date_tsi")) or ""
    e = clean(val(a, "end_date_tsi")) or ""
    def year(t, last=False):
        ys = re.findall(r"\d{4}", t)
        return int(ys[-1] if last else ys[0]) if ys else None
    y0 = year(s) or year(disp)
    y1 = year(e, last=True) or year(disp, last=True) or y0
    exact = None
    m = re.match(r"^(\d{1,2}) (\w{3})\w* (\d{4})$", disp)
    if m and m.group(2)[:3] in MONTHS:
        exact = f"{int(m.group(3)):04d}-{MONTHS[m.group(2)[:3]]:02d}-{int(m.group(1)):02d}"
    return y0, y1, disp, exact

def classify(ref, title):
    if ref.startswith("IOR/Z/E/4/14"):
        return "index-bengal", "Index to Bengal despatches, IOR/Z/E/4/14 (1834-1837)"
    if ref.startswith("IOR/Z/E/4/43"):
        return "index-madras", "Index to Madras military despatches, IOR/Z/E/4/43 (1830-1835)"
    if ref.startswith("IOR/Z/E/4/44"):
        return "index-madras", "Index to Madras military despatches, IOR/Z/E/4/44 (1835-1838)"
    if ref.startswith("IOR/L/MIL"):
        return "military", "Bengal Army service records, IOR/L/MIL"
    if title.lower().startswith("letter") or "letter to" in title.lower():
        return "letter", "Letters"
    if "Snapshot" in title or "Photographer" in title:
        return "photo", "Curzon Collection photographs, Mss Eur F165"
    return "papers", "Private papers"

def topic_of(title, kind):
    if kind.startswith("index"):
        t = re.sub(r"^Bentinck,.*?(Governor General(, and Commander in Chief)?|G\.C\.B\.),\s*", "", title)
        return t.strip().rstrip(",")
    return None

def find_ids(text, table):
    out = []
    for pid, row in table.items():
        if re.search(row[1] if len(row) == 3 else row[3], text, re.I):
            out.append(pid)
    return out

def main():
    entries = []
    for fn in sorted(glob.glob(os.path.join(DATA, "records", "*.json"))):
        d = json.load(open(fn))["data"]
        a = d["attributes"]
        ref = clean(val(a, "reference_ssi"))
        title = clean(val(a, "title_tsi"))
        scope = clean(val(a, "scope_and_content_tsi"))
        names_html = val(a, "related_names_ssim") or ""
        y0, y1, disp, exact = parse_dates(a)
        kind, series = classify(ref, title)
        hay = " ".join([title, scope, clean(names_html)])
        people = find_ids(hay, {k: (v[0], v[1], v[2]) for k, v in PEOPLE.items()})
        place_hay = " ".join([title, scope])
        places = [gid for gid, row in GAZ.items() if re.search(row[3], place_hay, re.I)]
        # every India-side record without a named place still happened at the
        # seat of government; leave unplaced rather than invent.
        entries.append({
            "id": d["id"], "ref": ref, "title": title, "scope": scope,
            "kind": kind, "series": series, "topic": topic_of(title, kind),
            "y0": y0, "y1": y1, "date": disp, "exact": exact,
            "people": people, "places": places,
            "url": f"https://searcharchives.bl.uk/catalog/{d['id']}",
        })

    # correspondence edges: [a, b, weight, label]
    edges = {}
    def edge(a, b, label, ref):
        k = (a, b)
        if k not in edges:
            edges[k] = {"a": a, "b": b, "n": 0, "label": label, "refs": []}
        edges[k]["n"] += 1
        if len(edges[k]["refs"]) < 6:
            edges[k]["refs"].append(ref)

    for e in entries:
        t = e["title"]
        if e["kind"] == "letter":
            m = re.match(r"Letter to (.+?) from (.+?)\.?$", t)
            if m:
                to_ids = find_ids(m.group(1), {k: (v[0], v[1], v[2]) for k, v in PEOPLE.items()})
                fr_ids = find_ids(m.group(2), {k: (v[0], v[1], v[2]) for k, v in PEOPLE.items()})
                for fi in fr_ids or ["?"]:
                    for ti in to_ids:
                        if fi != "?" and fi != ti:
                            edge(fi, ti, "letter", e["ref"])
            if "John Milne" in t:
                edge("milne", "elphinstone", "letter", e["ref"])
                edge("milne", "bentinck", "enclosed copy letter", e["ref"])
            if "William Scott" in t:
                edge("scott", "court", "petition letter", e["ref"])
        elif e["kind"].startswith("index"):
            edge("bentinck", "court", "despatches (indexed)", e["ref"])
        elif e["id"] == "032-002283365":  # Mss Eur E424
            for p in e["people"]:
                if p != "bentinck":
                    edge("bentinck", p, "correspondence circle (Mss Eur E424)", e["ref"])

    dataset = {
        "generated_from": "https://searcharchives.bl.uk/ India Office Records and Private Papers x 'William Cavendish-Bentinck' (162 hits)",
        "entries": entries,
        "people": {k: {"name": v[0], "role": v[2]} for k, v in PEOPLE.items()},
        "places": {k: {"name": v[0], "lat": v[1], "lon": v[2], "modern": v[4], "approx": v[5]}
                   for k, v in GAZ.items()},
        "edges": list(edges.values()),
    }
    out = os.path.join(DATA, "dataset.json")
    s = json.dumps(dataset, separators=(",", ":"), ensure_ascii=False)
    open(out, "w").write(s)
    kinds = {}
    for e in entries:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"entries: {len(entries)}, bytes: {len(s)}, kinds: {kinds}")
    placed = sum(1 for e in entries if e["places"])
    print(f"placed: {placed}, with people: {sum(1 for e in entries if e['people'])}, edges: {len(dataset['edges'])}")

if __name__ == "__main__":
    main()
