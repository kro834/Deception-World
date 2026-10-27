# Ciel's post-inferno sequin surface

The ten-tap secret retains the existing fire and burned-document contract.
After the fire finishes, the screen is completely black for 750ms; only then
is the sequin surface mounted inside the same modal. The original document
remains inert and burned until a real reload. It is not a new route or an
automatic restoration of the site.

## Rendering and interaction

Three.js renders one instanced mesh of thick, bevel-lit discs. Each instance
stores its angle at the last input, angular velocity, target angle, start time,
rotation axis and stable seed. The vertex shader evaluates the analytic damped
spring, including overshoot; normal frames change only the clock uniform.
A swept brush visits only nearby grid cells and samples the same spring when
retargeting, so a reversed stroke continues smoothly from the current pose.
Fine mouse hover brushes, while touch/pen require contact. Crossing controls
or leaving the surface breaks the stroke. The light follows the pointer.

Front/back shading is evaluated per fragment. Backside image UV comes from the
rotated world/screen coordinate, so the supplied picture joins continuously
and is not mirrored tile by tile. Cover fit fills the screen, with the upper
face kept in view; a separate control shows the complete portrait. Original
composition is retained in the delivery images.

The renderer bounds pixel ratio and tile count, sleeps after the spring settles,
pauses when hidden, and has an interactive Canvas2D fallback for reduced motion,
economy or unavailable/lost WebGL. Buttons provide the same face and image-fit
operations by keyboard. Three and the image are not fetched before the black
interval has elapsed.

## Asset preparation

The supplied image is 1086×1448. WebP delivery versions are 768×1024 (85,330B)
and 1086×1448 (133,042B); the latter filename records the requested maximum
width, not an upscale. Source metadata is stripped. Exact hashes, source size
and delivery sizes are in `public/ciel-sequin-20261028/artwork.json`.

```sh
node scripts/build-ciel-sequin-art.mjs --source=/path/to/owner-artwork.png
node scripts/build-ciel-sequin-art.mjs --check
```

The original attachment and browser evidence are retained in the sibling
handoff folder `handoff/ciel-sequin-20261028/`. Hardware iPad support must be
reported separately from viewport/WebKit simulation and software WebGL tests.

## Verification evidence

Chromium and WebKit rendered the real WebGL path at 320px, iPad-like portrait
and landscape, and desktop sizes. Reduced motion and blocked WebGL retained
interactive 2D brushing. Local checks include opposite strokes, complete image
orientation/continuity, resizing with the selected faces retained, explicit
context loss, full↔reduced and full↔economy three times, and reload restoring
the original site. After springs settled, actual WebGL render calls stopped
across a 700ms sample; a synthetic hidden signal paused rendering and return
painted once. These are browser tests, not physical iPad/background-tab proof.
