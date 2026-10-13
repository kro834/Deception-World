# RISING classified report (2026-10-14)

## Scope

- After RISING THE WORLD → RE DIVE…?, the archive offers the owner's
  「世界構造異常に関する統合観測報告」 as a fictional classified file.
  This is story presentation, not authentication or an access-control boundary.
- The report is the complete submitted draft: 4,360 characters / 108 paragraphs,
  SHA-256 `cf8b32a1c99a2e8d50d9718a849f7f1f934d2a1eef3085864598c0655c361ffa`.
  Punctuation, paragraph breaks, wording and withheld subject identity are intact.
- Regular character/manager dossiers and their assets remain available. Only
  the post-RISING archive contents and its unlocked menu shortcut changed.
- The RISING/RE DIVE engines, scene clocks, ground, flash limits, Japanese
  fonts, Extreme IMPACT/VS and Rexonance timings were not changed.

## Reader

- A native dialog mounts its plain-text body only when opened. It has a fixed
  header/footer and an independently scrollable article, no continuous animation,
  extra images, database writes or additional backend requirements.
- Escape and both close controls release the shared body lock synchronously,
  returning focus and scroll to the cover. Rotation returns to the archive under
  the header instead of restoring an obsolete absolute page position. History
  navigation dismisses the file without dragging the destination back.
- Keyboard focus cycles within the dialog; controls retain a 44px minimum and
  forced-colour focus indicators. The floating Zeus shortcut is hidden only
  inside this reader, preventing it from covering report text on narrow screens.
- Lifecycle and conditional mounting were reviewed with the React best-practices
  skill. Real browser actions/screenshots followed the Playwright skill.

## Verification

- `npm test`: 2,223 pass / fail 0 / existing skip 4. TypeScript passed. ESLint:
  0 errors / 12 existing warnings. Source-parts check: 15 groups. Vite build passed.
- On the built preview at port 8199, `verify-classified-file.mjs` passed Chrome
  320×640, 390×844 DPR3, 1024×768 and 1440×900; WebKit 390×844 DPR3 and 1024×768.
  Each uses the actual RISING controls, exact full DOM text, 12 repeated open/close
  cycles, native modal/body lock, keyboard scrolling/focus, rotation and real
  client-side menu/history return. Horizontal text overflow was zero.
- Screenshots were visually inspected, including the narrow reader after the
  shortcut-overlap repair. Viewport-resize completion is awaited on WebKit;
  the 2px rotation/return-position pin is unchanged.
- `verify-rising-world.mjs` / `redive` passed Pixel, landscape tablet1024 and
  desktop, each in real WebGL, CSS and reduced-motion tiers (nine landings and
  nine frame-exact flash audits). Each opens the complete report and restores
  the cover on close; the cover remains wholly visible on the landing spread.
  General flashes were at most one per second; red flashes were zero.
- Existing archive-content pins were updated with one-line owner-reason comments.
  Accessibility, fonts, motion, timing and flash safety pins were not weakened.
- The Rexonance recovery verifier's Ciel case no longer targets the removed
  classified-area character card. It unlocks the archive with the real RISING
  controls, opens/closes the report, and uses the existing unlocked Ciel menu.
  The same held-request/history/new-cut-in assertions passed; no application
  timing, route or cancellation logic changed.
- Browser engine/emulation results are not physical iPhone/iPad or installed-PWA
  validation. No claim of real-device coverage is made.

Publication is performed by the existing verified main workflow; public identity
and the live reader are checked separately after the normal main push.
