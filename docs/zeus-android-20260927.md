# Zeus gesture and Android follow-up — 2026-09-27

## Changes

- Hold-start snapshots bounds, grab offset and containing-block scale. Movement uses one
  requestAnimationFrame and individual CSS translate, without per-frame layout reads.
- Release commits the final pointer sample once. A swipe or displaced release cannot
  accidentally navigate; scroll before the hold cancels the pending tap.
- Pointer cancellation, a second touch, Escape, backgrounding and major viewport changes
  restore the gesture origin and release capture, scheduled work and the touch guard.
- Android scroll collision checks settle after 140 ms, versus 72 ms elsewhere. Portal
  observation ignores text/card mutations unrelated to dialogs or the side menu.
- Android's held button keeps its rim and scale but uses a bounded shadow, no filter
  tween and no idle will-change layer. Capable devices retain the existing full renderer.
- Source-inspection tests normalize CRLF before examining LF-delimited blocks; no
  production copy, images or layout were changed to satisfy those tests.

## Verification

- 715 tests passed, including actual Zeus handler simulations at containing-block
  scales 1, 0.75 and 1.2, interruption recovery and Android/non-Android settling.
- Typecheck and ESLint passed (12 existing warnings, no errors).
- Production Vite/Nitro build succeeded; PGLite runtime assets are packaged.
- Production preview: 10 public routes return 200; 7 retired AI routes return 404.
- Browser checks at 390 × 844, 768 × 1024 and 1440 × 900: button stays in the
  viewport, no horizontal overflow. Tap returns to the top; dialog navigation closes
  the dialog and restores the body portal; menu hides/inerts the button.
- No browser console errors or broken completed images were observed.
- Android-specific behavior is covered by automated tests. No physical Android device
  or Samsung Internet session was available; real-device frame rate is not asserted.

Publication remains GitHub main only. Hosting promotion is checked separately;
do not substitute a manual deployment if its credentials gate fails.
