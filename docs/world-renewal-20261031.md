# World renewal — 2026-10-31

## Delivered surfaces

`/transformation-lab` uses the existing Rexonance assembly renderer with the four
riders' actual configurations. Its direct playhead adds deterministic frozen
frames, forward/reverse transport, speed, looping, named beats, part enlargement
and same-beat form comparison. Small screens mount only the visible comparison
engine. The URL preserves rider, forms, progress, zoom, speed and comparison;
visibility loss pauses playback. No invented back view or free 3D orbit is used.
Related mechanism records quote existing exported data and link to its source.

`/world-map` indexes published World and Dream characters, organizations, forms,
chapters and episode records. Edges are supported by structured memberships,
reviewed chapter appearances or exact source mentions, not inferred alliances or
identities. Every connection links to its evidence. The keyboard-accessible list
and diagram use the same data. Unknown/unpublished names remain excluded.

The main menu, home artwork stage, World exploration cards, dossiers, library
and search provide entrances. Existing page identities and reading/return systems
remain in place. Gallery's transient preview remains a Back/Forward-only choice;
only its existing explicit 'display on top' action changes the saved artwork.

## Rendering and assets

High quality is the default. Explicit lightweight choice persists locally, with
per-history-entry fallback where storage is blocked. Reduced motion, forced
colors, missing capabilities and runtime context loss retain safe fallbacks.
Network hints suppress speculative preparation rather than selecting a reduced
renderer. Pixel/frame budgets and offscreen lifecycle guards remain bounded.

`public/nanite-surface-20261031/` contains three real Blender 4.5.9 material
re-renders. `provenance.json` attests builder/source/delivery hashes. Every alpha
pixel, 768×224 atlas size, 32px cell and 24-frame cycle matches the approved
original. Entry and scroll rendering share the resolved source URLs; old assets
remain available. Face/eye art, assembly order, reactor motion and final timing
are unchanged. The central Rexonance reactor remains fixed.

Regeneration is documented by `scripts/blender/nanite_surface_polish.py` and
`scripts/build-nanite-surface-polish.mjs`. Asset parity is an automated test.

## Verification

Tests cover URL parsing, canonical identities/evidence/anchors, deterministic
transport, source-only material swaps, blocked storage, speculative loading and
existing scene lifecycle contracts. Run `npm test`, `npm run typecheck`,
`npm run lint`, `npm run build` and `node scripts/sync-source-parts.mjs --check`.
Do not force-exit the test runner to conceal outstanding handles.

Browser QA uses Chrome and WebKit, 320/390px, short landscape and iPad/desktop
sizes. Recorded checks include all four riders' return-to-identical-progress
canvas hashes, failed-image retry, rapid selection, URL/back restoration,
reduced-motion imagery and blocked-storage settings. Five page round trips
with forced GC showed stable document/node/listener counts in the measured
session. This is browser emulation, not physical iPhone/iPad testing.

A single same-quality 1440×900 DPR1 Rexonance scroll measurement (25–75% over six
seconds) recorded 360 frames and zero >33.4ms intervals/long tasks for both
production baseline e00e5356 and the candidate. These samples are not a
cross-device performance guarantee.

Release via `docs/production-release.md`. New routes and versioned nanite assets
are included in the production smoke and hash checks. No schema migration,
account creation or shared-gallery writes are part of this work.
