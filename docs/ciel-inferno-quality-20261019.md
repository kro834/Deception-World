# Ciel inferno: directional fire and Blender pressure plume

This revision improves the ten-press secret from `be97325`. It does not alter
the deliberate-tap detector, ordinary Ciel navigation, supplied dragon artwork,
or the reload-only burned state. The visible stop button is removed at the
owner's request. Focus goes to the native modal; Escape can still finish the
animation early into the same burned state, not reveal the page underneath.

## Visible changes

- A directional ignition front travels fastest along the mouth's jet, then
  spreads across and behind it. Screen-space upward turbulence, darker gaps,
  soot and short-lived glowing cracks replace the radial green wipe.
- Blender volumes now have multiscale density, individually curled branches
  and a shorter, broader white-green core. Delayed atlas decoding blends in
  over 240 ms rather than abruptly replacing the pressure-ribbon fallback.
- Sparks leave the jet in directional streaks before becoming tumbling ash.
  Low-opacity and off-screen particles are culled; counts are capped at 52 on
  coarse pointers and 84 otherwise.
- Reflected green light, slow smoke and a deeper vignette tie the illustration
  to the surrounding fire. Touch devices omit the large smoke blur and use a
  smaller art glow. No additional effect is downloaded on ordinary one/two taps.
- Canvas-only rendering has an asymmetric burn contour and layered rising
  Bezier tongues rather than a flat outlined circle. Calm/Save-Data paths and
  final renderer disposal remain unchanged.

## Actual Blender generation

Blender 5.2.0, Cycles CPU, 64 samples, 512 x 256 source frames. Thirty-two
frames and an independently rendered closing frame were generated; geometry
and RGBA loop differences are zero, with all eight enclosures facing outward.
The delivery atlas remains 2048 x 512 (256 x 128 tiles, 16 fps), anchored at
[8, 64]. It is 293,294 bytes versus the previous 317,264 bytes, below the
unchanged 600,000-byte ceiling. This is procedural volumetric rendering, not a
fluid simulation. The exact settings, source hashes and per-frame hashes are in
`public/ciel-inferno-20261019/jet-manifest.json`.

Reproduce with the existing Blender script and `build-ciel-inferno-jet.mjs`;
`node scripts/build-ciel-inferno-jet.mjs --check` verifies the generated delivery.
The owner's illustration and its derivatives remain byte-identical.

## Verification scope

The browser verifier triggers the real ten-press interaction, includes an
additional natural 4.25-second capture, asserts no active stop/close controls,
checks black retained pixels and stopped rendering, then uses a real reload to
restore the page. The new quality unit suite covers pixel/DPR ceilings, bounded
Canvas work, cadence, blocked/delayed atlases and idempotent disposal.

Local production-build evidence is under
`output/playwright/ciel-quality-no-controls` (Chrome 320, 1024 and 1440 widths)
and `output/playwright/ciel-quality-no-controls-webkit` (WebKit 320, normal,
reduced motion, no WebGL and blocked jet). These are browser-emulated viewports,
not physical iPhone/iPad verification or a measured low-end frame-time claim.

The full unit suite reports 2,588 passes and five skips; typecheck, focused
ESLint, build, generated-asset checks and the unchanged startup bundle budget
pass. Source-parts consistency remains unchanged (15 groups).
