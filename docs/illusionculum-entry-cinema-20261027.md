# Illusionculum entry: optical nanites and readable assembly

The entry retains the owner's artwork and four transformation calls. The
armour is generated away from the undersuit, then captured and seated; the
existing shared swarm accepts Illusionculum-only staging so other riders retain
their timing. Rendering readiness and route reveal are verified separately from
visual playback.

## Blender asset

`public/illusionculum-nanites-20261027/cells.webp` is a 768×224 RGBA atlas with
the shared swarm's cell layout. Its optical nanite has four hinged silver
quadrants, glass facets, gold contacts, a recessed light source and a ceramic
back. Cycles renders real geometry under four studio lights, with 24 rotations
and six unfolding poses for each of four tone slots (120 frames). Beads and
spark cells inherit the shared kit. Small sprites use separately downsampled
16px mips. No Blender or real-time ray tracer runs in the website.

Reproduce with Blender 4.5.9 LTS:

```sh
blender -b --factory-startup -t 4 \
  -P scripts/blender/illusionculum_nanite_cells.py -- \
  /private/tmp/illusionculum-nanite-renders 96
node scripts/build-illusionculum-nanites.mjs
node scripts/build-illusionculum-nanites.mjs --check
```

The atlas is 91,730 bytes; the build check enforces the 100KB budget, dimensions,
alpha and exact scene/atlas hashes in `provenance.json`. The Blender scene source
is committed; large raw PNGs and the .blend working scene remain outside public
assets. Browser support requires only the existing Canvas2D path.

## Verification

Browser measurements and intermediate frames are saved under the handoff folder
`illusion-entry-20261027`. iPad checks are WebKit emulation, not physical-device
GPU/FPS certification. Before/after frame gaps are individual test-run samples,
not a stable benchmark across real devices.

## Transition work scheduling

Navigation intent shares completed warmups rather than re-draining the same
streams. Compact entry warms four required sheets instead of six (the page's
scroll scene retains its full set). The gate's critical image list uses three
first-frame/hero images instead of decoding the unused full cutout and orbit
sprites as well. Image fallback attempts decode with a finite deadline.

IC, Far From and Meta Unitas page facades wait for the route cover to release
before preparing their scroll engines. The entry renderer remains active.
Shared rails coalesce initial/resize/controlled-selection geometry updates,
hold those updates under a route cover, and read available space before writing
the lens styles. Pointer/hold/keyboard hit testing remains immediate. The
selection semantics remain synchronous while its decorative geometry waits.

A Chromium trace before the rail change attributed 129.3ms to a synchronous
`liquidrelayout` dispatch, including a 114.8ms Layout. Afterward there is no long
`liquidrelayout` dispatch. A separate 108.8ms initial document Layout remains
in a React stylesheet-load commit. WebKit maximum frame gaps varied between
single runs and did not demonstrate an overall FPS improvement. These are
specific scheduling fixes, not a claim of eliminating all frame drops.
