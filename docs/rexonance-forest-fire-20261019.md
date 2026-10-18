# Rexonance forest fire — 2026-10-19

## Scope and visual contract

Upgrade the green fire in both the entry-call assembly and the scrolling ZENITH
assembly. Preserve the owner's forest-green colour, whole-body/head/feet/floor
coverage, slow ignition and extinction, exact final artwork, stationary reactor
disc and separately rotating coil. This is not a redesign of the armour or the
site opening.

The reference build is `020e510c21e94aaee0b5fbb411a514821976f604`. Work is isolated
from the owner's dirty primary checkout. No gallery/database writes are part of
this change.

## Rendering and delivery

`scripts/blender/rexonance_flame.py` builds real closed three-dimensional volumes
and renders their heterogeneous density/emission in Blender Cycles. It is a
procedural fire effect, not a claim of a baked fluid simulation, browser
ray tracing, MetalFX, or a new WebGL engine. The reproducible source, render
settings and delivered asset hash are retained alongside the packed atlas.

The runtime uses a transparent animated atlas, with bounded shared decoding,
time interpolation, body-contour placement and restrained front-layer fire.
The artwork and its reactor remain visible through the effect. A lightweight
procedural fallback covers unavailable or failed image decoding. Reduced-motion,
economy and hidden-page paths must not introduce a new fire-atlas download.

## Verification record

The local evidence is kept under `output/playwright/`; these generated screenshots,
intermediate PNGs and Blender scene are not production assets. Compare the same
assembly progress in the reference and candidate, including ignition, maximum
burn and extinction, in both engines. Browser emulation is not physical iPad or
iPhone verification; those checks remain with the owner.

Final commands, results, asset sizes and release identity are recorded here after
the candidate passes its checks.
