# Rexonance suit-up redesign — RESONANCE FIELD (2026-10-21)

Owner: 「blenderやThree.jsなどの使用での、ナノマシンや炎のブラッシュアップも許可します。
装着方式はダイナミックでありつつ、何度見ても飽きない様な革新性や素晴らしさを追求して…
仕上げてください。」 then 「さらに改善して」.

Scope: the entry call (`/rexonance-saga` from the World menu) and the scroll
runway `.rzn-suitup`. Base `a966ec2`. The Ciel easter egg, the fixed fit
order, the pixel-exact finished figure, the unlit visor lit from the reactor,
the reduced-motion / economy / Save-Data still, the touch budgets and the
"same-origin assets only" rule all stay as they are.

## What is weak now (frames: `scratchpad/suitup/base-*`)

1. **A locked-off camera on an inert stage.** Nothing in the composition
   moves but the particles. On repeat viewings the eye reads "a figure with
   effects on it", never a shot. The locks (each DEUS！) are local sparks; the
   frame itself never answers them.
2. **The swarm reads as confetti.** The chips are loose clouds around the
   silhouette (scroll .12, .74; entry 700–1500). Nothing says where the
   material is flowing from or to, so the assembly has no legible force.
3. **One depth plane.** Fire, chips and plates all sit at the body's plane.
   No far field, no near bokeh, no parallax: the figure is a flat cut-out.
4. **Every viewing is the same frame set.** With a single authored swarm,
   the fifth viewing is identical to the first — the opposite of 「何度見ても
   飽きない」.
5. **The build-up to REXONANCE DEUS！ is undifferentiated.** The climax is
   the pinned light-up; the minute before it has no rising line.

## Concepts considered

A. **Resonance field (chosen).** The hero stands inside a visible magnetic
   field anchored at the P14 reactor: tens of thousands of fine nanites on
   helical field lines around the body, drawn as light-trail toolpaths with
   real depth (behind and in front of the body). The field *charges* on
   RIDER！, *converges* on each group as its plates print (legs, waist, arms,
   chest, shoulders, tail, helmet, in the fixed order), *whips* outward on
   every lock, *implodes* into the reactor before the seal and *detonates*
   with the light-up. A closed-form camera (push, punch, follow, settle) and
   an impact grammar (one-frame luminance pop, radial burst) answer each lock.
   A per-visit **take** (seed fixed for the visit) chooses the field's arms,
   handedness, twist, palette lead and camera take, so repeat viewings differ
   while scrubbing stays exact within a visit.
B. **Lattice crystallisation.** Plates form as glowing wire lattices that
   crystallise into the art. Beautiful but it fights the owner's pinned
   plate staging (jigs, clamps, conduits) and would need the engine files.
   Deferred to phase 2 as an option inside the engines.
C. **Blender-baked flow fields / normal-mapped glints.** Prebaked flow
   textures sampled by the swarm. Rejected for now: it adds assets and a
   dependency on the engines' chip renderer; the closed-form field gives the
   same legible flow with no new bytes.

## Why A, and how it meets the contracts

- **Performance.** The field is a raw WebGL layer (no three.js: the
  cinema-polish record keeps "no startup 3D dependency", and a 400-line
  shader module costs nothing at startup). One static vertex buffer (8 bytes
  a vertex, 4 vertices a particle), one draw call a canvas, a dozen uniforms a
  frame; the vertex shader computes every pose closed-form from progress and
  per-particle hashes. Desktop 12,000 particles on two canvases (behind and
  in front of the 2D scene), touch 3,000 on the back canvas only, both at a
  reduced backing resolution (0.7× / 0.5× of DPR ≤ 2). The scene's governor
  passes a quality factor that draws a prefix of the (hash-shuffled) buffer.
  No per-frame allocation; the JS side writes one Float32Array of state.
- **Fallback.** Feature-detected (webgl2, then webgl); a failed context,
  compile, link or a lost context leaves the current 2D scene exactly as it
  is. Resources are released on route leave, on hidden and at the call's end
  (`loseContext`, zero-sized canvases, elements removed).
- **Scrubbing.** Every value is a function of the clock: the helix phase, the
  charge, the attractor, the impulses (windows after each lock, played in
  reverse when scrubbing back), the camera and the flash. No integration, no
  frame history. The seed is fixed per live session.
- **Pixel-exact finish.** The camera is identity before the wake and from the
  collapse's end on (entry 1960 ms canonical, scroll q .86), the field has
  zero charge by the light-up's end (entry 2400, scroll .93), the flash only
  draws on moving frames, and the finished frame is untouched.
- **Accessibility / still tiers.** Nothing mounts under reduced motion,
  economy, Save-Data/2G or forced colours (the scenes never go live there).
  The field canvases are `aria-hidden` descendants of decorative layers;
  keyboard semantics are unchanged.
- **Touch.** Back canvas only, 3,000 particles, half-resolution backing;
  the camera still moves (a compositor transform), the impact grammar keeps
  its one-frame pop but no radial burst.

## The opening (owner, later on 2026-10-21)

「炎がアンダースーツを段々と覆っていき、爆散。ナノマシンと化し、そこから装着
シークエンスが始まります。」 The fire engulfs the undersuit, shifts to complete
combustion (pale cyan/blue, a faint pink-violet fringe), bursts (爆散), and
the burst's fragments cool into the pink / cyan sparks that are the nanites;
the suit-up starts from them. Nothing burns on through the assembly (the
afterburn goes). The fire engineer owns `rexonance-flame.js`,
`rexonance-ignition.js` and the new `rexonance-fire/` module, with a
closed-form `fireFragmentPose(seed, phase, out)` for each burst fragment.

The field answers this: its **wake is the burst**. Every particle is born
at a fragment's handoff position with its velocity, hot in the combustion's
colour, flies out under drag, cools into its spark tone and is swept onto
its field line by the wake's end — that transformation is the moment. The
birth is a per-particle attribute (`aBirth`, four 16-bit words: position
and velocity) filled from a swappable fragment source: the model fragment
(thrown off the fire's sampled skin, `sampleFlameBirth`) until
`fireFragmentPose` lands, then the fire's own handoff at its cooling phase,
so positions and velocities are the fire's exactly. The camera punches on
the burst and settles as the field forms. The scroll's fire mapping
(q → fire phase) lives in one place, `rexonance-field/field-clock.js`, read
by the scene, the swarm and the field, so the engulf's longer runway
(q ≈ .01 → .10–.12) is one constant change. The earlier idea of births
"pouring out of the afterburn" is withdrawn with the afterburn.

## Timeline (shared score; each scene maps its own clock)

| beat | entry (canonical ms) | scroll (q) | field |
| --- | --- | --- | --- |
| engulf | 0–420 (elapsed 0–1420) | fire start → burst (`field-clock.js`) | nothing: the fire's |
| wake = burst | 420–650 | burst → .16 | fragments born hot, fly, cool, take their lines; camera punch |
| legs / waist / arms / chest | lock 880 / 1000 / 1120 / 1240 | the four DEUS！ windows | converge on the group, whip on the lock |
| shoulders, tail+ribbons, helmet | 1450 / 1720 / 1890 | .62–.848 | follow up the body |
| collapse | 1890–1980 | helm lock–.86 | spirals into the reactor; camera settles to identity |
| detonate | 1980–2400 (light-up) | .90–.93 | one outward burst with the light, then gone |

## Built

### The field (new modules)

- `src/lib/rexonance-field/field-seed.js` — hashes, per-visit seed, takes.
- `src/lib/rexonance-field/field-score.js` — the score and its closed-form
  state (charge, attractor, tightness, impulses, collapse, detonation).
- `src/lib/rexonance-field/field-camera.js` — camera and impact grammar.
- `src/lib/rexonance-field/field-pose.js` — the particle pose (JS reference
  of the shader) and the shared shape constants.
- `src/lib/rexonance-field/field-gl.js` — the WebGL layer (its shaders carry
  the same constants; the fragment stage declares no uniform, since a
  highp/mediump mismatch on a shared uniform fails the link on real
  drivers).
- `src/lib/rexonance-field/field-entry.ts` — the entry score from the
  pinned call tables; `index.js` / `index.d.ts` — the chunk both scenes
  import lazily.
- `scripts/rexonance-field.test.mjs` — the contracts above as tests.
- Composition: `rexonance-suit-nanites.tsx` (entry: the layer's canvases on
  the flight canvas's box, the camera as `scale`/`translate` on the figure's
  box — never `transform`, which the jolt animates — the rays on the flight
  canvas with no composite operation), `rexonance-resonance.js` (scroll: the
  camera on the whole frame's view, the swarm sizing by it; the layer behind
  and before `.rzn-canvas`; the pop and rays with "lighter"),
  `styles-rexonance-calls.css`, `styles-rexonance-zenith.css`.
- The camera and the impacts belong to the layer: where WebGL is refused,
  both scenes are exactly the 2D scenes they were.

### The engines (after BASE READY 75fec44)

- Entry (`rexonance-suit-extras.ts`): every chip is still born in the
  burst's one interval (468–688; the afterburn births were withdrawn with
  the afterburn). Each tile flies its own flight (`FLIGHT_SPREAD` 0.72–1.28
  of 170 ms; the plan's spawn covers the longest). Docking darts in with an
  inertial overshoot (ease-out-back, ~5 % of the stand, never into the
  plate) and settles exactly onto the 2 px gap by 0.94, where the existing
  compression rings it down. The firebrand handoff cools over 72 ms and its
  carrier lingers to 136 ms (was 45 / 80). No pinned clock, fit or art
  changed; the existing call-swarm pins hold.
- Scroll (`rexonance-assembly-nanites.js`): an ornament's chip (tail,
  ribbons) stays banked through its braking and capture and turns face-on
  only as it unfolds, so no face-on rings hang at the hover points through
  the long tail/ribbon flights around q ≈ .75.

## Verification

Frames (this container renders with software GL, so motion is judged on
frame sequences): `scratchpad/suitup/f2-desk-entry`, `f2-desk-scroll`
(the field), `f3-phone-entry`, `f3-phone-scroll` (touch: one canvas, every
side), `f4-desk-scroll` (the tail's and ribbons' flights), `f5-desk-entry`,
`f5-phone-entry`, `f6-desk-scroll` (the burst birth: white-hot fragments
on the body at canonical ~435, pink/cyan sparks flying by ~470, the field's
lines by ~650). Contact sheets `figs-*.png` / `sheet.png` beside them. A
caveat on the scroll captures: the scene's preparation takes ~15 s here, and
any frame shot before `data-rzn-state="live"` shows the loading stand-in
(the undersuit, 000 %) — the capture helper now waits for `live`. Gates:
`npm test`, `npm run typecheck`, `npm run lint` (recorded in the commit).

## Next

Thin the 2D cocoon's far band where the field now carries depth; hand the
field's attractor to the chip rivers so chips enter plates along the field
lines; option B (lattice crystallisation) inside the plate staging; near
bokeh from the kit's bokeh sprites keyed to the camera's push.
