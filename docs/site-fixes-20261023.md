# Site stability follow-up — 2026-10-23

This is a follow-up to the Rexonance 94-finding review, not a declaration that
every historical finding is closed. It preserves the owner's artwork, Japanese
copy, specifications, transformation timing, and rider-rail hold/scroll contract.
The release incorporates upstream `3c2e1d8e14b6780b2b9cb4ea7067494c0242bfd8`,
including Dream's readability/navigation and compact live-region follow-up,
FAR FROM's owner-text/artwork updates, archive touch/scroll fixes, and shared
loader/Zeus refinements, without rewriting that work.

## Changes

- Form switching holds the last presented responsive image while preparing the
  canvas. It no longer exposes the newly selected form before preparation under
  a delayed decode. Rapid retargeting ignores abandoned results and releases
  image handlers, timers, frame callbacks, and canvas sheets on cleanup.
- Synchronous decoder exceptions are caught by the form loader, stage warm-up,
  and shared asset loader. The shared loader releases its failed candidate and
  remains retryable. The form loader may still use loaded pixels after a decoder
  exception; a failed next image leaves the last readable image and its alt.
- Forced colors skips canvas morphing. Changing to forced colors during a morph
  restores the image in the same media update that suppresses the canvas.
- The Latin brand and narrow hero kicker reserve their measured loaded-font
  dimensions. This prevents the observed 35.047px brand displacement and 24px
  hero displacement during late successful font delivery. The kicker remains
  two rows at 467px and one row at 468px.
- Short reading units `犬として` and `『終焉』へ` stay together, including in the
  system descriptions. Their visible text is unchanged. The existing OS/version
  and `必要部位` protections remain intact.
- English labels/units receive local `lang="en"` markup without applying English
  to Japanese prose or duplicating the accessible numeric counters. The Zen
  font request now asks for its actual 500/700 faces, not a nonexistent 600 face.

## Verification and evidence

The final integrated production build passed types, lint (0 errors; 12 existing
warnings), source-parts synchronization (15 groups), and the unit suite (2,873
passed, 5 skipped, 0 failed). Build preparation deliberately used `npm run
prebuild` followed by Vite, without executing a database migration locally.

The component-level browser runs used Chrome and Playwright WebKit, at
1280×900 and 320×900: 28 conditions and 10,754 animation-frame samples. Delayed
decode, rapid selection, slow/failed image requests, synchronous decode failure,
font outage, reentry, standard return, initial forced colors, and changes to
forced colors/reduced motion were covered. The 12 preparation scenarios have
zero target-source samples before the first painted canvas. No browser exception
or duplicate full-resolution MAX/ULTRA request was observed. Forced colors is an
intentional immediate image switch and is not subject to the preparation hold.
The diagnostic `earlyTargetFrames` also includes normal frames *after* a morph;
it must not be interpreted as a before-preparation failure count.

Font tests distinguished healthy delivery, delayed successful delivery, and
deliberate outage. Ten delayed-success widths (320, 360, 375, 390, 400, 414, 467,
468, 1024, 1440px) had zero displacement of the Japanese brand, hero heading,
and lede. Six final healthy widths (320, 390, 467, 468, 1024, 1440px) kept all
three measured occurrences of the protected Japanese phrases on one line.
CDP identified actual rendered faces and symbol fallbacks rather than relying
only on CSS declarations.

Reproducible browser scripts:

```sh
BASE_URL=http://127.0.0.1:8269 EXPECT_FIXED=1 OUT_DIR=output/morph/chromium node scripts/verify-rexonance-morph-readiness.mjs
BASE_URL=http://127.0.0.1:8269 EXPECT_FIXED=1 BROWSER=webkit OUT_DIR=output/morph/webkit node scripts/verify-rexonance-morph-readiness.mjs
BASE_URL=http://127.0.0.1:8269 EXPECT_FIXED=1 MORPH_WIDTH=320 MORPH_MODES=delayed,rapid,forced-toggle OUT_DIR=output/morph/320 node scripts/verify-rexonance-morph-readiness.mjs
BASE_URL=http://127.0.0.1:8269 FONT_MODE=delayed WIDTHS=320,390,467,468,1024,1440 node scripts/probe-rexonance-font-delivery.mjs
BASE_URL=http://127.0.0.1:8269 node scripts/verify-site-health.mjs
BASE_URL=http://127.0.0.1:8269 node scripts/verify-rexonance-operability.mjs
BASE_URL=http://127.0.0.1:8269 node scripts/verify-dream-navigation-recovery.mjs
```

Raw local evidence is retained outside the temporary checkout in the project
mirror's `audit-artifacts/site-fixes-20261023/`. Its work-state report records
the final whole-site reruns and, separately, the release SHA, workflow result,
and public-address checks. Publication follows `docs/production-release.md`;
local browser success is not evidence that a deployment is live.

## Remaining boundaries

- An unsuccessful one-pixel `drawImage` alpha probe is not proof of a blank
  compositor frame. WebKit recorded 23 such samples and Chrome's initial forced
  colors case recorded two. Every run retains
  `compositorContinuity: "unverified"`. F19 is improved, not certified as fully
  resolved at every painted frame. Physical iPhone/iPad/Safari was not tested.
- Permanent image failure keeps the old image/alt while the selected form's
  description stays selected. No rollback UI or new snapshot architecture was
  introduced in this patch.
- Healthy font delivery still contains 83 font files / 1,208,848 response-body
  bytes (CSS responses excluded). The 600 request cleanup did not reduce those
  bytes. There is no claim of universal loading-speed improvement or F44 closure.
- A 1.359px local-navigation width difference remains after the Noto swap at
  1024/1440px. The measured brand/hero fixes do not imply zero reflow everywhere.
- The English language markup is structurally tested; VoiceOver pronunciation
  and physical-device speech remain unverified (F55 remains partial).
- Gallery review was read-only. No test image, title edit, database setting,
  account, or external post was created. The existing 5 skipped unit checks stay
  explicitly skipped.
