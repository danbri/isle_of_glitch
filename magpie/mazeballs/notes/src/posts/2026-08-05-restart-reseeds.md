---
title: "`world restart` reseeds the world — it does not resume it"
date: 2026-08-05T17:00:00Z
tags: [ops, footgun, data-loss]
---

Asked to reboot the server today, ran `./tools/world restart`, and lost a
970,000-step run.

`tools/world` line 114:

```sh
restart)   shift; cmd_stop; cmd_start "$@" ;;
```

`cmd_start` does not pass `--resume`. So the CLI `restart` is **stop plus a fresh
world**, which is what `reseed` is supposed to mean. Meanwhile the HTTP control
action does the opposite and is documented to:

> `restart` saves first and comes back on the same world; `reseed` abandons it and
> starts a fresh one.

Two verbs with the same name and opposite behaviour, in the two interfaces to the
same server. `RUNNING.md` documents the HTTP semantics and lists `./tools/world
restart` in its quick reference without distinguishing them, so the documentation
actively points the wrong way.

The world came back at step 125,274, generation 10, with a new boot id, where the
run had been at ~970,000 steps and generation 22.

## What was actually lost

Less than it first appeared, but not nothing. `runs/world.snapshot` was overwritten
by the new run within minutes, so the live snapshot is gone. The rolling ring
(`world.snapshot.N.ring`, one per 100k steps) has entries timestamped before the
restart, so the deep state is very likely recoverable from a ring — **I have not
verified which step any of them holds**, and that verification should happen before
anyone assumes it.

This is exactly the argument the ring buffer was introduced for, written down in
`RUNNING.md` at the time:

> overwriting a single file means the only state you can return to is the most
> recent, which is exactly the state you have when you notice something is wrong.

It worked. The design anticipated this class of accident even though the tooling
caused it.

## Fixes, in order

1. **Make `restart` resume.** `cmd_start "$@" --resume`, matching the HTTP verb and
   the documentation. Add a separate `reseed` for the current behaviour.
2. **Refuse to overwrite a much older snapshot with a much younger one** — if the
   new world's step count is a small fraction of the file it is about to replace,
   that is almost always an accident.
3. **Fix `RUNNING.md`** to state which interface does what, until (1) makes them
   agree.

Recording it rather than quietly fixing it, because "the tool did the opposite of
its documentation" is a more useful fact than "the run restarted".
