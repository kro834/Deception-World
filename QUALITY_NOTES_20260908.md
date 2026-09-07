# Archive reading and delivery polish — 2026-09-08

Preserves current main's film direction, approved character art, quotes, world data,
AI retirement and clipboard protection. No hosting migration or new service.

## Changes

- Shared character contents: Japanese chapter titles alongside original archive metadata.
- Native-anchor reading rail for profile, related records, dossier and available transformations.
  IntersectionObserver indicates the current part without a continuous scroll handler.
- Mobile identity precedes artwork in the converted rider / manager / related pages;
  legacy Lejas markup is deliberately excluded from that reorder.
- Reader palette keeps character accent colors, capsule geometry and compact glass surfaces.
  Reduced motion, safe-area header measurement, keyboard focus and 44px targets retained.
- Footer's index is now a real return link using the established hash-settlement path.
- Dream Chapter tablet hero / two-column cast layout; full poster art with captions below it.
  Arrow keys, Home and End select posters and pause automatic switching.
- Preloads distinguish versioned URLs. A 12-second deadline cancels stuck image/fetch/stream
  attempts and releases the shared request for retry, without duplicate native image fetches.
- Slider completion is cancelled on pagehide, blur, hidden visibility and unmount.
- Archive generator and source inspections tolerate Windows and Unix line endings.
  `node scripts/sync-source-parts.mjs --check` checks all 15 split groups without writing files.
- Production traces the complete embedded database package, including its required WASM/data
  assets, so a missing DATABASE_URL does not terminate the server at startup. No database
  content, external credential, migration policy or hosting target is changed.
- `npm run preview` serves the exact built Vercel output on loopback port 8082 (GET/HEAD only).

## Verification

Unit coverage includes image version identity, shared loads, stalled decode/load events/fetch/body,
retry recovery, slider lifecycle, native reader markup and source-parts parity.
Existing content, copy protection and AI retirement regression suites remain enabled.

Final local checks: 306 tests pass; TypeScript passes; ESLint has zero errors (11 existing
warnings). Production Vite build passes, including traced PGLite WASM/data assets. The
generated server stays running and passes all 15 public/retired-route checks. Fresh built
character-page hydration reports no console errors or broken images. The preview harness
is for route/UI verification, not Safari media Range or full authentication certification.

Rendered QA: 320px / 390px phone, 768px tablet and 1440px desktop; page overflow,
name wrapping, portrait loading, contents links, sticky rail, form dialog opening/closing,
Dream poster fit/caption separation and character dialog width. Chromium viewport tests
are not a claim of physical iPhone Safari testing.

## Publication

Publication stays on GitHub main. Before this update, the optional staged Vercel Actions path
failed because its three deployment credentials were unset; the existing public host was live.
A successful push must not be treated as proof of deployed content. Check the public dossier
for `dossier-reader` markup and the versioned `styles-dossier-reader` stylesheet after delivery.
