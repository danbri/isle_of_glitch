#!/usr/bin/env python3
"""
Watch the running world and speak only when something has CHANGED.

Two things this gets right that the first version did not.

RATES, NOT TOTALS. blockedBirths only ever increases, so a threshold on the
total fires once and then forever, and an alarm that is always on carries no
information. What matters is refusals per hundred steps.

TRANSITIONS, NOT STATES. "code on disk is newer than the server" is true from
the moment a file is saved until the moment it is restarted, which can be an
hour of identical messages. Report the edge.

All the logic is here rather than split between shell and python: the first
version tested an unset shell variable and announced that energy had been
minted, which is the single most alarming thing this world can say.
"""
import json, sys, time, urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8899/status'
prev = None
prev_stale = False

while True:
    try:
        with urllib.request.urlopen(URL, timeout=8) as r:
            d = json.load(r)
    except Exception:
        time.sleep(60)
        continue

    msgs = []
    step = d.get('steps') or 0
    blocked = d.get('blockedBirths') or 0
    disk = (d.get('onDisk') or {}).get('simVersion')
    stale = bool(disk and d.get('simVersion') != disk)

    if prev:
        ds = step - prev['step']
        db = blocked - prev['blocked']
        if ds > 0:
            per100 = db * 100.0 / ds
            if per100 > 50:
                msgs.append(f'births refused at {per100:.0f} per 100 steps ({db} in {ds})')

    if stale and not prev_stale:
        msgs.append(f'sim code on disk ({disk}) is newer than the running server')

    minted = d.get('mintedEnergy')
    # Explicitly a number, not a truthiness test: 0 and None both mean nothing
    # was minted, and only a real non-zero should raise the alarm.
    if isinstance(minted, (int, float)) and minted != 0:
        msgs.append(f'ENERGY MINTED: {minted}')

    lin = d.get('lineages')
    if isinstance(lin, int) and 0 < lin <= 3:
        msgs.append(f'lineages {lin} — near-clonal')

    if msgs:
        print(' | '.join(msgs), flush=True)

    prev = {'step': step, 'blocked': blocked}
    prev_stale = stale
    time.sleep(45)
