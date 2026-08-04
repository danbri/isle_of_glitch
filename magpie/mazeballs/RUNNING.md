# Running the world server

Everything here is one command. Nothing needs an agent, an editor, or a
half-remembered `nohup` line — if this file is all you have, it is enough.

## Quick reference

```sh
./tools/world start          # start it (or restart if already up)
./tools/world stop           # stop it
./tools/world status         # is it up, what step, how many bodies
./tools/world restart        # stop then start
./tools/world log            # follow the server log
./tools/world tailscale on   # serve it over your tailnet, with HTTPS
./tools/world tailscale off  # stop serving it there
```

Then open <http://127.0.0.1:8899/>. It redirects to the shared world.

## What is actually running

One Deno process holds the simulation and steps it on the GPU forever. It does
not stop when you close a browser tab, and nobody has to be watching for the
world to continue. That is the whole point of it being a server rather than a
page.

The browser is a **viewport**, not a second simulation. It fetches frames of raw
positions and activations and draws them with its own WebGPU. Deno's WebGPU has
compute but no surface — there is no window for it to present to — so the split
is compute in Deno, render in the browser. Deno is shipping numbers; the browser
is drawing them.

Drop the `?watch=1` (open `/world.html` directly) and the page runs its **own**
private simulation instead, which is useful for pushing sliders around without
disturbing the shared run.

## Options

```sh
./tools/world start --beasts 2500 --cells 12 --port 8899
```

| flag | default | meaning |
|---|---|---|
| `--beasts` | 1200 | founder population; also sizes the arena |
| `--cells` | 12 | cells per body at the start (evolution changes this) |
| `--port` | 8899 | |
| `--host` | 0.0.0.0 | `127.0.0.1` to refuse anything but this machine |
| `--drift` | 1 | non-stationary resource field; `0` for a static one |
| `--spf` | 6 | physics steps per scheduler tick |

Memory scales as `beasts × maxCells`, so 1200 beasts reserves 48,000 cell slots
even though only ~25,000 are usually alive. That headroom is deliberate: bodies
grow, and an arena sized for the starting bodies fragments and silently stops
all reproduction (see RESEARCH.md).

## Over tailscale

```sh
./tools/world tailscale on
```

prints an `https://<machine>.<tailnet>.ts.net/` address that works from any
device on your tailnet.

**It has to be HTTPS.** WebGPU is only exposed in a *secure context*. Browsers
exempt `localhost` and `127.0.0.1`, but plain http to any other address —
including a tailnet `100.x` one — is not secure, so `navigator.gpu` does not
exist at all and the page loads and then dies. Tailscale terminates TLS with a
real certificate for the MagicDNS name, which fixes it properly. The page will
tell you if you hit this.

`tailscale serve` persists across reboots and publishes the port to every device
on your tailnet (not the public internet). `./tools/world tailscale off` undoes it.

## Looking at what it is doing

```sh
curl -s localhost:8899/status | python3 -m json.tool
deno run --allow-net tools/shape-report.js     # body shapes and bond strain
```

`shape-report` must be run on an **evolved** population. On a freshly started one
every number reads healthy and means nothing, which has fooled me more than once.

In the page itself, the debug panel has:

- **strain** — colours every bond by how far it is stretched past its rest
  length, blue at rest through red at 5×. Faster than any statistic.
- **solo body** — draws one creature at a time, so it can be seen without a
  thousand others on top of it.
- **cells** / **bonds** / **field** — isolate one layer to work out which of them
  an artifact belongs to.

## Long experiments

```sh
deno run -A tools/ascent-ladder.js                    # hours; writes as it goes
deno run -A tools/ascent-report.js runs/ascent-ladder.jsonl
```

The ladder evolves a population, archives genomes at intervals, and runs each
checkpoint against its predecessor in a fresh neutral world. `ascent-report`
reads a partial file, so you can watch it while it runs.

It runs **five tournaments per rung** and the report never prints a slope
without its standard error. That is not fussiness: a single tournament on one
rung has a spread of about ±0.15, and three separate times in this project a
trend computed from one measurement per rung turned out to be noise — twice
reported as attenuation, once as attenuation reversing, and those three
disagreed with each other including on sign.

## If something looks wrong

| symptom | first thing to check |
|---|---|
| page loads then errors | plain http to a non-localhost address; needs HTTPS |
| `sim 0.0×realtime` | the server's GPU device faulted — `./tools/world log` |
| bodies look stretched or streaky | `shape-report.js`; strain well above 1 means the bond graph cannot satisfy itself |
| generations frozen, population healthy | births failing; the log warns once with the free-list shape |
| nothing renders but the HUD updates | activations may be NaN — see the frame probe in RESEARCH.md |
