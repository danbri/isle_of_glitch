# Sample drawings: what genomes develop into

> ### ⚠ SUPERSEDED — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md)
>
> This document is **history**. It describes sketches from before the visual language settled, and parts of it are no
> longer true of the code. It is kept because they show what was being aimed at, not as a description of the
> world.
>
> **For what the world actually is and does now, read `WORLD-MANUAL.md`.** Where
> this file disagrees with the manual, the manual is right.

Output of `deno run --allow-all util/draw.mjs`, committed so the shapes can be
seen without a GPU or a run. Regenerate with that command; it is deterministic.

Each cell is drawn as whichever of its continuous capacities dominates:

| glyph | meaning |
|-------|---------|
| `M`   | contractile — muscle |
| `S`   | sensory |
| `A`   | high grip — anchor, sucker |
| `B`   | stiff — bone |
| `o`   | undifferentiated tissue, no capacity above threshold |

Those letters are **descriptions read off the properties**, not stored types.
`lib/evolve.js` `describe()` does the same thing to pick which physics a cell
gets. The genome never writes a type; it writes how properties vary with
position in the egg, and the type is what that variation happens to look like.

## Important caveat

These three genomes are **hand-written, not evolved**. They demonstrate that
bilateral symmetry, segmentation and a stiff skeleton are *reachable* from this
encoding — which is a claim about the encoding, not about what evolution finds.
Whether selection actually discovers these structures in a running world is a
separate question, and as of this writing it is unanswered: development is wired
into reproduction but the population is not yet viable enough to measure it.
See RESEARCH.md.

## The drawings

```

bilateral, segmented, stiff spine
  cells 55  symmetry 1.00  segments 5  elong 1.01  stiffSpan 8.0x
                                                
                   A     A    M                 
                                                
          A     M     A    M     A     A        
       A     M     A     A    M     A     M     
                                                
    A     A     M     A    M     A     A     M  
                                                
       B     M     B     B    M     B     M     
                                                
    A     A     M     A    M     A     A     M  
                                                
       A     M     A     A    M     A     M     
          A     M     A    M     A     A        
                                                
                   A     A    M                 
                                                

worm: narrow, strongly segmented
  cells 37  symmetry 1.00  segments 3  elong 2.02  stiffSpan 2.6x
                                                
                                                
                                                
                                                
       M     B     o     o    M     B     B     
                                                
    M     M     B     o    M     M     B     B  
                                                
       M     B     o     o    M     B     B     
                                                
    M     M     B     o    M     M     B     B  
                                                
       M     B     o     o    M     B     B     
                                                
                                                
                                                
                                                

asymmetric (signed dv) — the control
  cells 46  symmetry 0.50  segments 3  elong 1.35  stiffSpan 1.0x
                                                
                                                
                                                
                                                
       o     o     o     o    o     o     o     
                                                
    o     o     o     o    o     o     o     o  
                                                
       o     o     o     o    o     o     o     
                                                
    M     M     M     M    M     M     M     M  
                                                
       M     M     M     M    M     M     M     
          M     M     M    M     M     M        
                                                
                   M     M    M
```

## Reading them

The first body has a stiff midline (`B`) running along the anterior-posterior
axis with muscle bands (`M`) crossing it at intervals and grip cells (`A`) on
the periphery — a segmented bilaterian with a spine, from five nonzero weights.
Symmetry 1.00 and five segments are *measured off the developed body*, not set.

The second is the same machinery tuned narrow: `presence` weighted against
`|dv|` cuts the body down to a worm, elongation 2.12, with alternating muscle
and stiff blocks along its length.

The third is the control, and it is the important one. It uses **signed** `dv`
rather than `|dv|`, so the genome can tell left from right — and the body comes
out one-sided, symmetry 0.53, muscle along one flank only. If this had also come
out symmetric, the first two would be measuring the lattice rather than the
genome, and symmetry would be something the machinery imposes rather than
something evolution can choose. It does not, so it is not.
