#!/usr/bin/env bash
# Upload the corpus to archive.org item "theveniceproject".
# Prereq: `ia configure` done (account email + password — NOT stored here),
# and ./videos/ populated by fetch-videos.sh.
set -e
ia upload theveniceproject videos/*.mp4 thumbs/*.jpg thumbs-4x/*.jpg manifest.json \
  --metadata="mediatype:movies" \
  --metadata="collection:opensource_movies" \
  --metadata="title:The Venice Project / Joost (2007) — demo and walkthrough videos" \
  --metadata="date:2007" \
  --metadata="subject:Joost; The Venice Project; P2P television; internet television; 2007; software history" \
  --metadata="description:Screen recordings, beta walkthroughs and official behind-the-scenes interviews documenting The Venice Project (later Joost), the peer-to-peer television service from the founders of Kazaa and Skype, as it looked in 2007. Sources and per-video provenance are in manifest.json; original YouTube URLs and uploaders are credited there. Thumbnails included at native and 4x-upscaled resolution."
