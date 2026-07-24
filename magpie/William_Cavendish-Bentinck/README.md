# magpie/William_Cavendish-Bentinck — Bentinck Despatches explorer

A self-contained single-file explorer for the 162 records returned by the
British Library *Explore Archives and Manuscripts* search for
**"William Cavendish-Bentinck"** within **India Office Records and Private
Papers**:

> https://searcharchives.bl.uk/?f%5Bcollection_area_ssi%5D%5B%5D=India+Office+Records+and+Private+Papers&q=William+Cavendish-Bentinck&search_field=all_fields

## What's here

| path | what |
|---|---|
| `index.html` | the app as a full standalone page (served by GitHub Pages) |
| `artifact.html` | same app as an Artifact-ready fragment (no doctype/html/body — the artifact host wraps it) |
| `data/search_page_{1,2}.json` | the two search-result pages (Blacklight JSON:API, 100/page) |
| `data/records/*.json` | all 162 individual catalogue records |
| `data/dataset.json` | distilled entries + people + gazetteer + correspondence edges |
| `data/basemap.json` | Natural Earth 1:50m land, clipped to the London–Calcutta corridor, RDP-simplified |
| `data/qids.json` | Wikipedia URLs + Wikidata QIDs for the cast (resolved via QLever, cached) |
| `data/sources/*.txt` | public-domain full texts (archive.org: Keith 1922, Sharp 1920) used to verify every quotation verbatim |
| `tools/` | the pipeline, in run order below |

## Pipeline (all cached — re-runs fetch nothing already on disk)

```
tools/fetch_bl.py        # search pages (note: use curl form below if urllib misbehaves)
tools/fetch_records.sh   # 162 record JSONs, paced 0.5s, resumable
tools/build_basemap.py ne_50m_land.geojson   # Natural Earth -> data/basemap.json
tools/fetch_qids.py      # QLever (NOT Wikimedia) -> data/qids.json
tools/build_dataset.py   # records -> data/dataset.json
tools/build_app.py       # template + JSON -> index.html / artifact.html
```

The app itself makes **zero network requests**: coastlines, records, and
identifiers are all inlined (~260 KB total). Wikipedia/Wikidata/BL links in
the UI are plain outbound hyperlinks for the reader to follow.

## Provenance notes

- Catalogue text (titles, scope notes, dates) is © the British Library
  catalogue, quoted for research; every card links back to its record.
- Index entries (IOR/Z/E/4/…) carry the index volume's date range
  (e.g. 1834–1837), not the date of each underlying despatch.
- The gazetteer maps the catalogue's historic place names (Moorshedabad,
  Bhurtpore, Hidgelee…); entries marked `approx` are district-level guesses.
- **None of the 162 records is digitised**: the BL facet `url_non_blank_si`
  is "No" for all of them, and the same search restricted to digitised items
  returns 0 hits (checked 24 Jul 2026). 145 index entries do carry pointers
  to the despatch volume + page (IOR/E/4/…) — shown on each card.
- Quotations in the "Voices & counter-voices" tab were verified verbatim
  against public-domain full texts cached in `data/sources/` (Keith 1922 for
  the sati minute incl. its army-risk passage; Sharp 1920 for Macaulay, the
  7 Mar 1835 resolution, and Prinsep's dissent). Counter-perspectives with no
  verifiable primary text (Dharma Sabha petition, half-batta memorial,
  Mysore/Coorg/Oudh annexations) appear as clearly-labelled summaries anchored
  to records in this dataset. The "bones of the cotton-weavers" line is
  flagged as an unverified attribution.
