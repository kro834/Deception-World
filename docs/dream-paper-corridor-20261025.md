# Dream Chapter — six-layer paper corridor

Astra designed and implemented the new chapter theatre; the parent agent performed
browser review, requested a second mobile composition pass, and owns verification.
The baseline is main b8e707379cc509434adc54fed7cf181859861b13. Integration and
publication belong to the parallel site-wide coordinator, not this feature branch.

## Result

The previous numbered plates are now a perspective cut-paper corridor with six
arched layers, a moon, a hinged double door and a physical-looking paper plinth.
Selecting a chapter opens the layers in sequence and the door, with a direction
matched to movement and a distinct paper accent. These are CSS 3D surfaces, not a
new raster asset or a WebGL scene. Only the decorative corridor is remounted;
the reading copy and its link stay mounted and opaque.

Six chapter-name paper keys, a native range and previous/next buttons share one
selection state. The links still open the canonical chapter folds. DREAM_CASES
provides all chapter names and text; there is no new plot or chapter artwork.

On desktop the corridor and controls are on the left, the reading entrance on the
right. On phones the order is corridor, keys/range, copy. The 290px corridor is
preserved, and the scenery plus controls fit together on 320×740 and 390×844.
The DOM follows that order. The existing variable navigation offset keeps fragment
landings below the fixed menu, including its two-line 320px state.

The animation is finite (at most 800ms); there is no autoplay, RAF loop, scroll or
pointer-move listener. Reduced motion, economy, static, saver and motion-disabled
settings display the finished scene while retaining all selection controls.

## Verification

`AUDIT_OUT=output/playwright/dream-astra/verified node scripts/verify-dream-chapter-stage.mjs`
checks Chrome desktop and WebKit desktop, phone, 320px, iPad landscape/portrait and
short landscape. It covers real fragment landing, six keys, slider keyboard and
touch, endpoints, finite animation, opaque copy, fast scrubbing, chapter links,
history, hit sizes, overflow, scenery/control sightlines and all calm modes.
`BASE` can target the integrated production preview or public URL, and `CASES`
can select matrix entries. `LIVE_FONTS=1` keeps external font loading enabled.

- Dedicated stage browser matrix: all 7 conditions passed with no runtime errors.
- External fonts enabled: Chrome desktop and WebKit phone also passed.
- Existing WebKit reader-navigation: 320, 390, 1440 and short landscape passed.
- Existing WebKit scroll-work: phone/landscape/desktop passed, zero repeated style
  reads and zero programme rerenders while scrolling.
- `node --test scripts/dream-*.test.mjs`: 231 passed, 1 skipped.
- Target TSX ESLint, `git diff --check`, source-parts parity: passed.
- Initial full typecheck identified a pre-existing duplicate `abilities` key in
  world/rider-page.tsx:1282. The site-wide World owner has taken that repair;
  this feature does not modify their file. Integrated gates establish final status.
- Static screenshots were independently reviewed by Astra after the second pass.
  Chrome/WebKit are browser simulations; no physical iPhone or iPad was used.

Before/after evidence: `output/playwright/dream-astra/`. Exact public release identity
and live operation are required before reporting publication complete.
