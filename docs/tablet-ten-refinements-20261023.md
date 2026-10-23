# Tablet / fold refinement log — 2026-10-23

Baseline: `7235797d` plus this chat's stable artwork-number QA follow-up.
Scope: existing approved layout, artwork, copy and native interactions. No
gallery writes. Sol audited layout candidates; Luna handled deterministic guards.
Browser viewport/touch emulation is not a physical iPad/fold-device test.

Each numbered loop inspected the prior state, made one small refinement and
remeasured it. Incremental probes inject the edited stylesheet into the baseline
build only for iteration speed. Final acceptance uses a rebuilt production
preview with **no CSS injection** and the navigation regression harness.

| Loop | Finding / refinement                                                                                                                               | Incremental evidence                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 01   | Dossier's 8:5 ceiling made a wider 1024×600 window narrower for reading. Extend the tablet split balance through 2:1.                              | `ten-loop-01-{before,after}`: identity 398.7 → 495.0px; 900/1100 also checked.                         |
| 02   | World at 900×651 abruptly stacked to a 1248px hero just above the old 650px limit. Keep compact broad layout through 740px with a 6:5 lower ratio. | `ten-loop-02-{before,after}`: 900×650/651 and 980×651; two columns retained.                           |
| 03   | Compact reading paper spent too much of its narrower text lane on fixed margins. Use fluid 20–32px inner margins.                                  | `ten-loop-03-{before,after}`: 700×540 paragraph 418 → 440px; upright 820px unchanged.                  |
| 04   | 639×540 gallery viewer retained a full tools row. Extend the compact band to split landscape windows.                                              | `ten-loop-04-{before,after}`: header 119 → 53px, image viewport 219.7 → 300px; 320px phone unchanged.  |
| 05   | Opening viewer tools pushed Close out of the visible header. Use explicit grid lanes with Close spanning the two rows.                             | `ten-loop-05-after`: expanded Close at y25–69 inside the header at 639/900/1024.                       |
| 06   | Outer focus outline was clipped by the scrollable header edge. Inset the outline only in the compact header.                                       | `ten-loop-06-{before,after}`: keyboard-visible outline offset +4 → −3px.                               |
| 07   | Tablet viewer navigation/close targets were 44px. Increase touch targets to 48px, retaining phone/desktop layout.                                  | `ten-loop-07-after`: 639/900/1024 portrait and 390 phone.                                              |
| 08   | Reading position label was 11px. Raise it to 12px without changing owner copy.                                                                     | `ten-loop-08-after` against `ten-loop-03-before`: 639/720/820; label 12px.                             |
| 09   | Tablet reading controls were 44px. Make selectors, summaries and buttons 48px, including split windows.                                            | `ten-loop-09-{before,after}`: 639/720/820; visible button 44 → 48px.                                   |
| 10   | Search category controls stayed 44px on large touch screens. Match the tablet 48px target.                                                         | `ten-loop-10-{before,after}`: all eight at 639/1024 portrait/landscape are 48px; 390 phone stays 44px. |

Evidence lives in `output/playwright/` in this dedicated worktree. The refined
geometry is asserted by `scripts/inspect-tablet-refinements.mjs` with
`VERIFY_REFINEMENTS=1`; CSS/media contracts are in the tablet test files.

## Final acceptance

- Rebuilt production output, no injected CSS: WebKit geometry passes for all five
  surfaces at 320×780, 390×844, 639×540, 700×540, 900×651, 1024×600,
  1024×1366 and 1440×900 (40 page states).
- Chrome and WebKit: menu, Ciel dossier, Dream reading and gallery return flows,
  normal and reduced motion; five successive viewport sizes in each flow. Dream
  and gallery were rerun after the final select/header correction (all pass).
- The final native-select check caught WebKit's fixed menulist appearance; loop
  09 now paints only the select surface/chevron while keeping native selection.
  The actual select target is 48px. The probe also waits for skipped content above
  the reading entry to settle before clicking, as the navigation harness does.
- A DOM-only 80-character title fixture and Tab traversal through the expanded
  gallery tools retain Close at y25–73 on 639×540, 900×600 and 1024×650. No title
  was saved. Removing the grid's empty-row gap preserves the compact header.
- Native Chrome touch: hero swipe surfaces, rider hold/select/vertical scroll,
  rail drag/unlock and liquid grid pass. Drag geometry reads remain zero.
- Local gates: 3,133 tests pass, zero fail, five deliberately skipped; typecheck
  and production build pass; lint zero errors / 12 existing warnings; all 15
  mirrored-source groups match. Latest-main integration is checked again before
  publication; exact production release identity is verified separately.

Physical iPad/fold hardware remains owner verification, not an emulated claim.
