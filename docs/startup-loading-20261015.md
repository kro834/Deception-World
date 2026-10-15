# Startup JavaScript separation — 2026-10-15

The owner requested a larger startup/loading improvement and explicitly asked
for high-performance models rather than the usual cost-conscious team. Three
GPT-6 Astra reviewers audited/implemented independent scopes. Rexonance stays
unchanged; other chats own Dream, image delivery and library/search refinements.

## Delivered scope

- Only accepted embedded previews load the preview bridge and its Zod validator.
  Top-level public pages never import them. The original origin, source, schema,
  version, safe-path and history-root checks remain unchanged. Commands received
  during the chunk fetch are replayed through that original implementation;
  unmount, StrictMode and rejected imports cannot install a late bridge.
- Exhibition and tour search validation use only the exact public artwork/stop
  IDs, not the complete gallery descriptions and tour prose. All 113 works,
  five tours and 35 stops retain their original validation results, text, images,
  ordering, direct links and UI. Exact parity tests catch future catalog drift.
- A compiled-output verifier follows the actual SSR entry/modulepreload roots
  and static ESM edges (not dynamic imports). It counts shared/cyclic chunks
  once, rejects the removed payloads and limits both entry and total critical
  decoded/gzip bytes. A static chunk move cannot evade the dependency budget.
- No root styles, fonts, animation clocks, Rexonance files/preloads, load gate,
  IMPACT/VS, image assets, Japanese copy, or rail gestures were changed.

## Measured evidence

Fresh production builds compared with main `faa5ab25b9b0`:

| JavaScript | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Entry decoded | 528,209 B | 399,506 B | 24.4% |
| Entry reproducible gzip | 162,759 B | 127,904 B | 21.4% |
| Entire SSR critical graph decoded | 657,845 B | 529,142 B | 19.6% |
| Entire SSR critical graph reproducible gzip | 207,380 B | 172,524 B | 16.8% |

Three alternating AB/BA samples, Chrome 390×844 DPR3, CPU4, 60ms latency,
9Mbps, fresh contexts/cache disabled: opening preparation median 1,877.6 →
1,748.3ms; script CPU 0.285 → 0.240s. World preparation 5,578.9 → 5,519.4ms:
this is a small change, not a solved World-layout bottleneck. Rendering and
Google-font/network variability remain; these local, uncompressed transport
samples do not establish equivalent public/device speed gains. The opening's
LCP includes its intentional 6.1-second logo handoff and is not its startup wait.
The compiled decoded/gzip byte reductions above are deterministic.

Public baseline already serves Brotli and immutable hashed JS/CSS. No redundant
compression configuration, broad asset-cache rewrite or service worker was added.

## Verification

- Unit tests: 2,247 pass / fail 0 / existing skips 4. TypeScript, ESLint
  (0 errors / existing warnings 12), source-parts (15 groups) and production
  build passed. Original safety/motion/performance assertions are retained.
- Chrome and WebKit each passed 320/390/844/1024/1440px comparisons: actual
  Japanese fonts loaded, same font/weight/size/spacing/glyph bounds, no overflow;
  real ENTER → World, menu/Escape and browser Back also passed.
- Opening behaviour passed iPhone-size and desktop WebGL, unavailable/stalled
  WebGL, Save-Data, reduced motion, skip/replay, dive and prime-TTL cleanup.
- Phone menu-dream and menu-rexonance transitions passed with no blank frames
  or browser errors. Their engine, cover and face timings were not modified.
- Exhibition/tour direct URL selection, next/reload and invalid values passed
  at 390/1440px. Native iframe tests verified early queued commands arrive once,
  invalid version/path commands are rejected and unaccepted parents never fetch
  the bridge. No public gallery uploads or shared-title edits were made.
- New browser fixtures initially used the wrong label query, then encountered
  Chromium local-network access protection on a fake external parent. The query
  now uses its actual accessible combobox role. Only the disposable iframe-test
  context receives local-network access; browser origin checks and application
  restrictions remain intact. Both native iframe cases passed. Existing product
  assertions and motion/accessibility/performance pins were not weakened.
- The gallery's four-width collection/viewer/focus/scroll/history checks passed.
  Its old full-image-failure assertion timed out on both baseline and candidate:
  the existing viewer correctly retained its standard image, not a total error.
  The verifier now requires that visible accessible fallback and successful
  high-quality retry, and separately aborts both variants to retain total-error
  and next-artwork recovery coverage. Publicly editable/blank titles are checked
  against the live card's number and title, not retired catalog defaults; image
  identity and dimensions remain exact assertions. The completed gallery run
  passed native touch scrolling, reduced motion and all 113 work derivatives.
  No viewer implementation was changed.

Evidence: `output/playwright/startup-v2-ab-correct/report.json`,
`startup-v2-readability/`, `startup-v2-readability-webkit/`,
`startup-boundaries-frames/`, and `/private/tmp/startup-v2-*.log`.

Publication uses the existing verified-main workflow, separately from these
local checks. Physical iPhone/iPad Home Screen apps, real background/foreground
and previously documented Extreme/first-second input issues remain unverified
or outstanding; this JavaScript separation does not claim to resolve them.
