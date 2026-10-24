# Dream Chapter: six-chapter paper theatre

The chapter entrance now contains a manually operated, dimensional paper theatre.
The six numbered wings slide in depth while the chosen chapter's title sheet turns
in the direction of travel. A native six-stop slider, previous/next buttons and
an ordinary chapter link connect the preview to the existing reading experience.
Titles and leads come directly from DREAM_CASES; the scene adds no plot or artwork.

The existing full index, paragraph guide, bookmarks and independent chapter folds
remain available. There is no autoplay, wheel interception, timer or background
render loop. Reduced motion and economy/static/saver modes suppress the turns.
The range works with touch and keyboard; endpoints disable the unavailable arrow.
The preview remains readable without animation or JavaScript.

## Verification

- `scripts/verify-dream-chapter-stage.mjs`: Chrome 1440×900 and WebKit touch at
  390×844, 320×740 and 1024×768. Checks animation, intermediate screenshots,
  arrows, Home/End, touch range selection, fast scrubbing, chapter landing,
  reduced motion and economy mode, bounds and runtime errors.
- `scripts/verify-dream-reader-navigation.mjs`: WebKit 320×640, 390×844,
  1440×1000, 667×375: chapter links, keyboard, related records and history.
- SSR paragraph-guide regression loads the real stage component and counts links
  within the existing index, so the added preview does not weaken the six-link pin.

Artifacts: `output/playwright/dream-chapter-stage/`. These are browser simulations,
not physical iPhone/iPad tests. Publication is tracked by the production workflow
and public release identity, separately from local verification.
