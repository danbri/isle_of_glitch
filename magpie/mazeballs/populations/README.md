# Archived populations

Drop any of these into the live page with **Load** (the page's import control) to
watch an evolved population run. They are genomes only — `genR` and `genM` —
so the page regrows the nervous system from them exactly as evolution did.

| file | what it is |
|---|---|
| `generation-0-unevolved.json` | the chance rate. Everything else must be read against this. |
| `truncation-baseline.json` | 32 generations under the incumbent selection rule. Evolved toward near-immobility. |
| `tournament-k2-wall-refuge.json` | 32 generations under tournament selection, k=2. The wall-refuge strategy: turn command off, thrust saturated, straight line to the boundary. |

## A caveat that is also a result

These were evolved in the two-species world, where the animal had 11 sensor
channels (8 base + 3 for the opposing species). The page runs the single-species
default with 8. The genome does not encode sensor count — development builds the
sensory wiring against whatever channels exist — so they import cleanly, but you
are watching them **with their predator senses removed**.

For these particular populations that is not a distortion. The refuge strategy
was measured to be open-loop: blinding every sense changed contact by 0.005.
Re-imported here at 8 sensors, wall-band occupancy is 0.505 against the 0.447
measured in the world they evolved in. It does not need the senses it lost.

## Provenance

Extracted from `tools/tournament.js --archiveOut` snapshots, seed 1, final
generation. The full 33-snapshot archives are ~890K each and are not committed;
`runs/` stays ignored. What is worth keeping is the endpoint of an arm that a
RESEARCH.md section refers to, at a size that survives in git.
