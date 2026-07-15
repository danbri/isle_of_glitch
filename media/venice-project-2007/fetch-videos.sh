#!/usr/bin/env bash
# Fetch the Venice Project / Joost demo corpus (see manifest.json) in the
# best available format. Run from a residential network — YouTube's media
# CDN 403s datacenter IPs. Output lands in ./videos/.
set -e
mkdir -p videos
while read -r id; do
  yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b" --merge-output-format mp4 \
    -o "videos/%(upload_date)s-%(id)s-%(title).60B.%(ext)s" \
    --write-info-json --write-thumbnail "https://youtu.be/$id"
  sleep 2
done < <(python3 -c "import json;[print(v['id']) for v in json.load(open('manifest.json'))['videos']]")
