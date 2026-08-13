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
# The last refusal CAUSE reported. A world at carrying capacity refuses births
# on every sample, for hours, and saying so every 45 seconds is the same
# always-on alarm as before wearing a better sentence. Say it when it changes.
prev_cause = None
prev_clonal = False
# How many consecutive samples a cause has held. A population sitting exactly on
# its ceiling crosses back and forth every minute, and reporting each crossing
# is flapping rather than news.
cause_run = 0
last_seen = None
HOLD = 2

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
                # WHY, not just how often. A refusal at 97% occupancy is the world
                # being full, which is a real limit and a lawful one - the
                # population is pressing against the cell budget and competing
                # for it. A refusal with space to spare is the allocator losing
                # births the world could afford, which is a bug. Reporting the
                # same sentence for both is how a monitor becomes noise: this
                # alarm fired for hours about fragmentation, was fixed, and then
                # fired again at the same rate for the opposite reason.
                f = d.get('freeStats') or {}
                freeSlots = f.get('freeSlots') or 0
                cells = d.get('cellsOwned') or 0
                budget = d.get('cellBudget') or 1
                bodies = d.get('alive') or 0
                slots = d.get('bodySlots') or 1
                occ = 100.0 * cells / budget
                mean = cells / max(1, bodies)
                if bodies >= slots * 0.98:
                    why = f'BODY SLOTS FULL ({bodies}/{slots}) — a real limit'
                elif freeSlots < mean:
                    why = f'CELLS FULL ({occ:.0f}% of budget) — a real limit'
                else:
                    why = (f'space exists ({freeSlots} free, largest hole '
                           f'{f.get("largest", 0)}, mean body {mean:.0f}) — the allocator is losing births')
                cause = why.split('(')[0].strip()
                cause_run = cause_run + 1 if cause == last_seen else 1
                last_seen = cause
                if cause != prev_cause and cause_run >= HOLD:
                    msgs.append(f'births refused at {per100:.0f} per 100 steps: {why}')
                    prev_cause = cause
            else:
                cause_run = cause_run - 1 if cause_run > 0 else 0
                last_seen = None
                if prev_cause is not None and cause_run == 0:
                    msgs.append('births are being placed again')
                    prev_cause = None

    if stale and not prev_stale:
        msgs.append(f'sim code on disk ({disk}) is newer than the running server')

    minted = d.get('mintedEnergy')
    # Explicitly a number, not a truthiness test: 0 and None both mean nothing
    # was minted, and only a real non-zero should raise the alarm.
    if isinstance(minted, (int, float)) and minted != 0:
        msgs.append(f'ENERGY MINTED: {minted}')

    # ON CHANGE, like everything else here. A world that has collapsed to three
    # lineages stays collapsed, and saying so every 45 seconds is the same
    # always-on alarm I have now written three times: first as a cumulative
    # total, then as a persistent refusal cause, now as this.
    lin = d.get('lineages')
    clonal = isinstance(lin, int) and 0 < lin <= 3
    if clonal and not prev_clonal:
        eff = (d.get('linStats') or {}).get('effective')
        msgs.append(f'lineages {lin} — near-clonal' + (f' (effective {eff})' if eff else ''))
    elif prev_clonal and not clonal:
        msgs.append(f'lineages recovered to {lin}')
    prev_clonal = clonal

    if msgs:
        print(' | '.join(msgs), flush=True)

    prev = {'step': step, 'blocked': blocked}
    prev_stale = stale
    time.sleep(45)
