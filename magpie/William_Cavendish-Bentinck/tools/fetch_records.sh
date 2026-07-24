#!/bin/bash
# Paced curl fetch of individual BL record JSONs; skips existing files.
cd "$(dirname "$0")/.."
UA="isle_of_glitch/magpie-parisconf research fetcher (contact: danbri@danbri.org)"
for id in $(python3 -c "import json;print('\n'.join(json.load(open('data/ids.json'))))"); do
  dest="data/records/${id}.json"
  [ -s "$dest" ] && continue
  for attempt in 1 2 3 4; do
    code=$(curl -sS --max-time 40 -H "User-Agent: $UA" -o "$dest" -w "%{http_code}" "https://searcharchives.bl.uk/catalog/${id}.json" || echo 000)
    if [ "$code" = "200" ] && [ -s "$dest" ]; then break; fi
    echo "retry $attempt $id ($code)"; rm -f "$dest"; sleep $((attempt*2))
  done
  sleep 0.5
done
echo "fetched: $(ls data/records | wc -l)"
