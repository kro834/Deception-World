# Liquid grid and pickup visibility repair

## Scope

Restore two-axis dragging in multi-row, multi-column Liquid Glass tab rails and
improve pickup plus-glyph visibility. Keep existing layouts, touch ownership,
hold enlargement, tap timing, and page scrolling outside the rails.

## Cause and repair

`initRail` classified every multi-row grid using the initial drag direction.
Both the moving lens and release selection then used a fixed coordinate on the
other axis. A native Chrome touch path across the first row and then down one
row reproduced a roughly 77 px vertical error before the repair.

Only genuinely one-row or one-column rails now constrain their axis. Grids keep
both pointer coordinates live, including when the gesture changes direction.
The iPhone two-column layout and landscape iPad one-column layout are unchanged.

Shared slide-open thumbs and episode pickup buttons now have an opaque dark
surface, white boundary, and a white plus with a 2.4 px stroke. Held/dragging
thumbs retain the contrast. The episode selector explicitly outranks the
global frosted `.ios26-glass` background and the World Neo theme. No gesture or
size rules are replaced. Remote `main` update `acd731a` was fast-forwarded into
the checkout before final validation, preserving that separate design update.

## Verification

- `npm test`: 401 passed, including bent grid dragging, horizontal/vertical
  constraints, and pointer cancellation unlocking the viewport.
- `npm run typecheck`, `npm run build`: passed. No external database migration
  was run (`DATABASE_URL` unset).
- `npm run lint`: no errors; 11 pre-existing warnings.
- Source-parts parity: all 15 groups synchronized.
- `verify-liquid-grid.mjs`: six native gesture paths per engine in Chrome and
  WebKit at 390×844 / 1024×768. Checks lens movement, final selection, panel
  identity, hold state, page lock during dragging, and unlock after release.
  Chrome uses CDP touch; WebKit uses mouse pointer input, not physical iOS touch.
- `verify-hero-touch.mjs`: Chrome touch scrolling over 44 named surfaces plus
  gutters, stable dimensions across all eight rider selections, 20×16 px hold
  enlargement, 80 ms lens and 100 ms portrait transitions.
- `verify-anime-ui.mjs`: 35/35 existing interaction checks passed.
- `verify-pickup-contrast.mjs`: World column/episode controls and Saga FormPickup
  at both sizes. Verifies opaque backgrounds, white glyphs, contrast ≥3:1,
  host containment, and normal/holding/dragging states. Screenshots visually
  inspected for both phone and tablet layouts.

These are browser checks, not measurements on physical iPhone/iPad devices.
Delivery uses the established GitHub `main` update workflow; Grok publication
is separate and is not inferred from a successful push.
