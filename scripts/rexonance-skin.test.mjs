// Rexonance's skin (owner, 2026-11-11): the armour grown from the reactor as
// one continuous front of liquid nanite metal (src/lib/rexonance-suit-skin.ts)
// over a field baked from the art (rexonance-suit-skin-field.ts,
// scripts/build-rexonance-skin.mjs) — the bake and its order (torso, limbs,
// hands and feet, the helmet last, the face closing), the two clocks (never
// stepped, scrubbable, the classic engines whole under it before it fades),
// the droplets at the front only, the cells taken in from the air, and the
// device budget.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_SUIT_LIGHT,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_PIXELS,
  REXONANCE_SUIT_SNAP,
} from "../src/lib/rexonance-calls.ts";
import { ASSEMBLY_BEATS, ASSEMBLY_PARTS } from "../src/lib/rexonance-resonance.js";
import { MOVIE_DURATION_MS, MOVIE_LEAVE_EVENT } from "../src/lib/assembly-movie.ts";
import { LEAVE_FADE_MS, LEAVE_FROM, LEAVE_SLACK } from "../src/lib/rexonance-suit-leave.ts";
import {
  SKIN_ENTRY_PARTS,
  SKIN_PART_REACH,
  SKIN_SCROLL_PARTS,
} from "../src/lib/rexonance-suit-skin-marks.ts";
import { NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";
import {
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
} from "../src/lib/rexonance-suit.ts";
import {
  SKIN_FACE_FROM,
  SKIN_FIELD_SIZE,
  SKIN_MASK,
  SKIN_REGION,
  buildSkinField,
  skinRegionOf,
  skinRegions,
} from "../src/lib/rexonance-suit-skin-field.ts";
import {
  REXONANCE_SKIN_FIELD,
  SKIN_BAND,
  SKIN_BANDS,
  SKIN_ENTRY,
  SKIN_QUALITY,
  SKIN_RETRACT,
  SKIN_RETRACT_FADE_MS,
  SKIN_RETRACT_MS,
  SKIN_RETRACT_FLUSH,
  SKIN_RETRACT_PULL,
  SKIN_SAMPLE,
  SKIN_SCROLL,
  SKIN_CELL_POSE,
  SKIN_CELL_SHARE,
  SKIN_CELL_SIZE,
  SKIN_RETRACT_CELLS,
  SKIN_WHOLE,
  SkinCells,
  buildSkinCellSheet,
  cellEase,
  createSkinFrame,
  drawSkinDroplets,
  skinBudget,
  skinFrame,
  skinReach,
  skinRetractFrame,
  skinRetractReach,
  skinSamples,
} from "../src/lib/rexonance-suit-skin.ts";
import {
  SKIN_FIELD_FILE,
  SKIN_MARKS_FILE,
  SKIN_PART_GROUPS,
  bakeSkinField,
  skinFieldInput,
  skinMarks,
  skinMarksSource,
} from "./build-rexonance-skin.mjs";

const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path) => readFileSync(file(path), "utf8");
const { width: W, height: H } = SKIN_FIELD_SIZE;
const input = await skinFieldInput();
const bake = await bakeSkinField();
const committed = await sharp(file(SKIN_FIELD_FILE)).raw().toBuffer({ resolveWithObject: true });
const regions = skinRegions(
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_TILE,
  REXONANCE_SUIT_SIZE.width,
  W,
  H,
);
const mean = (pick) => {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < W * H; i += 1)
    if (bake.field[i] >= 0 && pick(i)) {
      sum += bake.field[i];
      count += 1;
    }
  assert.ok(count > 0);
  return sum / count;
};

test("the committed field picture is the bake, small, and where the page loads it from", () => {
  assert.equal(`public${REXONANCE_SKIN_FIELD}`, SKIN_FIELD_FILE);
  assert.deepEqual(
    [committed.info.width, committed.info.height, committed.info.channels],
    [W, H, 3],
  );
  assert.equal(
    Buffer.compare(committed.data, Buffer.from(bake.texture.buffer)),
    0,
    "run scripts/build-rexonance-skin.mjs",
  );
  assert.ok(statSync(file(SKIN_FIELD_FILE)).size < 48 * 1024, "the field stays under 48 KB");
  assert.equal(W, Math.ceil(REXONANCE_SUIT_SIZE.width / 3));
  assert.equal(H, Math.ceil(REXONANCE_SUIT_SIZE.height / 3));
});

test("every plate has a region, and the helmet's three are the head's", () => {
  const seen = new Set(REXONANCE_SUIT_PIECES.map((piece) => skinRegionOf(piece.id)));
  for (const region of Object.values(SKIN_REGION))
    if (region !== SKIN_REGION.none) assert.ok(seen.has(region), `region ${region}`);
  assert.equal(skinRegionOf("helmet-visor"), SKIN_REGION.face);
  assert.equal(skinRegionOf("arm-fist-l"), SKIN_REGION.hands);
  assert.equal(skinRegionOf("boot-foot-r"), SKIN_REGION.feet);
  assert.equal(skinRegionOf("boot-shin-r"), SKIN_REGION.legs);
  assert.equal(skinRegionOf("belt-jewel"), SKIN_REGION.torso);
  // The head's mask is the helmet's plates, its tile-stepped boundary rounded.
  let heads = 0;
  let moved = 0;
  for (let i = 0; i < W * H; i += 1) {
    if (input.alpha[i] <= 127 || regions[i] === SKIN_REGION.none) continue;
    const head = [SKIN_REGION.jaw, SKIN_REGION.head, SKIN_REGION.face].includes(regions[i]);
    if (head) heads += 1;
    if (bake.head[i] !== (head ? 1 : 0)) moved += 1;
  }
  assert.ok(heads > 500 && moved < heads * 0.08, `${moved} of ${heads} head cells rounded`);
});

test("the field grows from the reactor: torso, then limbs, then hands and feet", () => {
  const core = Math.round(input.core[1]) * W + Math.round(input.core[0]);
  assert.ok(bake.field[core] >= 0 && bake.field[core] < 0.06, "the reactor is the origin");
  for (let i = 0; i < W * H; i += 1) {
    const inside = input.alpha[i] > 127;
    assert.equal(bake.field[i] >= 0, inside, "the field covers the armour exactly");
    if (inside) assert.ok(bake.field[i] <= 1);
  }
  const of = (region) => mean((i) => regions[i] === region);
  const torso = of(SKIN_REGION.torso);
  const arms = of(SKIN_REGION.arms);
  const legs = of(SKIN_REGION.legs);
  const hands = of(SKIN_REGION.hands);
  const feet = of(SKIN_REGION.feet);
  assert.ok(torso < arms && torso < legs, "the torso first");
  assert.ok(arms < hands, "the arms before the hands");
  assert.ok(legs < feet, "the legs before the feet");
  assert.ok(feet > 0.8, "the feet are the body's last");
  assert.ok(of(SKIN_REGION.tail) > torso, "the tail grows out of the body");
  // Left and right run together.
  const side = (region, left) =>
    mean((i) => regions[i] === region && i % W < input.core[0] === left);
  for (const region of [SKIN_REGION.hands, SKIN_REGION.feet])
    assert.ok(
      Math.abs(side(region, true) - side(region, false)) < 0.12,
      `region ${region} is even`,
    );
});

test("the helmet rises from the neck and the face closes last, on the visor", () => {
  const skull = mean((i) => regions[i] === SKIN_REGION.head || regions[i] === SKIN_REGION.jaw);
  const face = mean((i) => regions[i] === SKIN_REGION.face);
  assert.ok(skull < SKIN_FACE_FROM && face >= SKIN_FACE_FROM);
  let low = 0;
  let high = 0;
  let lows = 0;
  let highs = 0;
  let top = H;
  let bottom = 0;
  for (let i = 0; i < W * H; i += 1)
    if (bake.head[i] && regions[i] !== SKIN_REGION.face) {
      top = Math.min(top, Math.floor(i / W));
      bottom = Math.max(bottom, Math.floor(i / W));
    }
  for (let i = 0; i < W * H; i += 1) {
    if (!bake.head[i] || regions[i] === SKIN_REGION.face) continue;
    const y = Math.floor(i / W);
    if (y > bottom - (bottom - top) * 0.25) {
      low += bake.field[i];
      lows += 1;
    } else if (y < top + (bottom - top) * 0.25) {
      high += bake.field[i];
      highs += 1;
    }
  }
  assert.ok(low / lows < high / highs - 0.2, "the neck before the crest");
  // The last cell of all is at the visor.
  let last = -1;
  for (let i = 0; i < W * H; i += 1)
    if (bake.head[i] && (last < 0 || bake.field[i] > bake.field[last])) last = i;
  assert.equal(regions[last], SKIN_REGION.face);
  assert.ok(Math.hypot((last % W) - input.visor[0], Math.floor(last / W) - input.visor[1]) < 14);
  assert.ok(bake.field[last] > 0.95, "and the head's field runs its whole range");
});

test("the picture carries the field, the veins and the mask, dilated past the silhouette", () => {
  const t = bake.texture;
  let veins = 0;
  for (let i = 0; i < W * H; i += 1) {
    const inside = input.alpha[i] > 127;
    const mask = t[i * 3 + 2];
    if (inside) {
      assert.equal(mask, bake.head[i] ? SKIN_MASK.head : SKIN_MASK.body);
      assert.ok(
        Math.abs(t[i * 3] - bake.field[i] * 255) <= 1,
        "the field, dithered within a level",
      );
      if (t[i * 3 + 1] > 200) veins += 1;
    } else assert.ok([0, SKIN_MASK.bodyEdge, SKIN_MASK.headEdge].includes(mask));
  }
  assert.ok(veins > 300 && veins < 2400, `the veins are thin paths (${veins} cells)`);
  // A cell just outside the silhouette carries its neighbour's field, not 1.
  let checked = 0;
  let strays = 0;
  for (let y = 1; y < H - 1; y += 1)
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      if (input.alpha[i] > 127 || input.alpha[i + 1] <= 127) continue;
      let nearest = 255;
      for (const j of [i + 1, i - 1, i + W, i - W, i + W + 1, i - W + 1])
        if (input.alpha[j] > 127) nearest = Math.min(nearest, Math.abs(t[i * 3] - t[j * 3]));
      if (nearest >= 16) strays += 1;
      assert.notEqual(t[i * 3 + 2], 0);
      checked += 1;
    }
  assert.ok(checked > 100);
  // (Only where the head's edge meets the body's do the two fields mix.)
  assert.ok(strays < checked * 0.02, `${strays} of ${checked} edge cells stray`);
  // The shader reads the head from the mask's upper range.
  assert.match(read("src/lib/rexonance-suit-skin.ts"), /step\(0\.69, fld\.b\)/);
  assert.ok(SKIN_MASK.headEdge / 255 > 0.69 && SKIN_MASK.body / 255 < 0.69);
});

test("the bake is deterministic and survives an empty or headless figure", () => {
  const again = buildSkinField(input);
  assert.equal(
    Buffer.compare(Buffer.from(again.texture.buffer), Buffer.from(bake.texture.buffer)),
    0,
  );
  const empty = buildSkinField({ ...input, alpha: new Uint8Array(W * H) });
  assert.ok(empty.field.every((value) => value === -1));
  const noHead = buildSkinField({
    ...input,
    region: regions.map((region) =>
      region >= SKIN_REGION.jaw && region <= SKIN_REGION.face ? SKIN_REGION.torso : region,
    ),
  });
  assert.ok(noHead.head.every((value) => value === 0));
});

const sweep = (timeline, from, to, step) => {
  const frames = [];
  for (let x = from; x <= to + step / 2; x += step)
    frames.push({ x, ...skinFrame(createSkinFrame(), timeline, x) });
  return frames;
};

for (const [name, timeline, from, to, step] of [
  ["entry", SKIN_ENTRY, 0, 2400, 4],
  ["scroll", SKIN_SCROLL, 0, 1, 0.0005],
]) {
  test(`${name}: the fronts are continuous and eased, never stepped, and scrub both ways`, () => {
    const frames = sweep(timeline, from, to, step);
    let moved = 0;
    for (let n = 1; n < frames.length; n += 1) {
      const a = frames[n - 1];
      const b = frames[n];
      for (const key of ["body", "head"]) {
        assert.ok(b[key] >= a[key] - 1e-12, `${key} never retreats at ${b.x}`);
        assert.ok(b[key] - a[key] < 0.02, `${key} never jumps at ${b.x}`);
      }
      assert.ok(Math.abs(b.alpha - a.alpha) < 0.25 && Math.abs(b.classic - a.classic) < 0.6);
      if (b.body > a.body) moved += 1;
    }
    // The body's front decelerates the whole way (an ease-out, not linear).
    const body = frames.filter((frame) => frame.x > timeline.body[0] && frame.x < timeline.body[1]);
    for (let n = 2; n < body.length; n += 1)
      assert.ok(body[n].body - body[n - 1].body <= body[n - 1].body - body[n - 2].body + 1e-9);
    assert.ok(moved > 100, "many small steps, not a few large ones");
    // Closed-form: the frame at a clock value does not depend on the path.
    const direct = skinFrame(createSkinFrame(), timeline, frames[40].x);
    const reused = createSkinFrame();
    skinFrame(reused, timeline, to);
    skinFrame(reused, timeline, frames[40].x);
    assert.deepEqual(reused, direct);
  });

  test(`${name}: the classic engines are whole under the skin before it fades, and never both gone`, () => {
    const frames = sweep(timeline, from, to, step);
    for (const frame of frames) {
      assert.ok(frame.alpha >= 1 - frame.classic - 1e-9, `something is drawn at ${frame.x}`);
      if (frame.x <= timeline.leave[0] || frame.x >= timeline.fade[1]) {
        // The armour is gone; only its lit emitters may still stand over the
        // classic engines' held lights (the next test).
        assert.equal(frame.shell, false);
        assert.equal(frame.alpha, 0);
        assert.equal(frame.classic, 1);
      }
      assert.equal(frame.on, frame.x > timeline.leave[0] && frame.x < timeline.glow[1]);
      if (!frame.on) assert.equal(frame.glow, 0);
      if (frame.alpha < 1 && frame.x > timeline.back[0])
        assert.equal(frame.classic, 1, "the skin fades only over a whole suit");
    }
    assert.ok(timeline.back[1] <= timeline.fade[0]);
    // The armour is whole (body and head) before the classic canvases return.
    const closing = skinFrame(createSkinFrame(), timeline, timeline.back[0]);
    assert.equal(closing.body, SKIN_WHOLE);
    assert.ok(closing.head > SKIN_WHOLE - 1e-9);
    // The helmet starts after the torso is on and while the limbs finish.
    assert.ok(timeline.head[0] > timeline.body[0] && timeline.head[0] < timeline.body[1]);
    assert.ok(timeline.head[1] > timeline.body[1], "the helmet is last");
    const helmetStarts = skinFrame(createSkinFrame(), timeline, timeline.head[0]);
    assert.ok(helmetStarts.body > 0.6, "most of the body is on before the helmet rises");
  });
}

test("the skin sits inside each scene's own beats", () => {
  // The entry (canonical ms): after the fire's burst, the helmet closed at
  // its clamp, gone before the light.
  const burst = NANITE_FIRE_PHASES.burstStart * 2400;
  assert.ok(SKIN_ENTRY.leave[0] >= burst);
  assert.ok(
    SKIN_ENTRY.leave[1] <= NANITE_FIRE_PHASES.flameEnd * 2400 + 1e-9,
    "the classic canvas leaves with the fire's last fragments",
  );
  assert.ok(Math.abs(SKIN_ENTRY.head[1] - REXONANCE_SUIT_SNAP.helm) <= 20);
  assert.ok(SKIN_ENTRY.fade[1] <= REXONANCE_SUIT_LIGHT.from);
  assert.equal(REXONANCE_SUIT_LIGHT.from, REXONANCE_CALL_BEATS[4].start);
  assert.ok(
    (SKIN_ENTRY.head[1] - SKIN_ENTRY.body[0]) / 1000 > 1.2,
    "a suit-up of about a second and a half",
  );
  // The scroll (progress): after the fire (its end at (q - .02) / .48), and
  // closed before the seal (0.86) and the light (0.9).
  const resonance = read("src/lib/rexonance-resonance.js");
  assert.match(resonance, /seal: \[0\.86, 0\.9\],/);
  assert.match(resonance, /light: \[0\.9, 0\.915\],/);
  assert.ok(SKIN_SCROLL.leave[0] >= 0.02 + NANITE_FIRE_PHASES.flameEnd * 0.48);
  assert.ok(SKIN_SCROLL.head[1] < 0.86 && SKIN_SCROLL.fade[1] < 0.9);
});

test("each emitter lights a moment after the shell over it is whole; the reactor first, the eyes last", () => {
  // The lagged fronts: the front as it stood `lag` ago, on both clocks.
  for (const timeline of [SKIN_ENTRY, SKIN_SCROLL]) {
    const span = timeline.fade[1] - timeline.leave[0];
    for (let k = 0; k <= 200; k += 1) {
      const x = timeline.leave[0] + (span * k) / 200;
      const now = skinFrame(createSkinFrame(), timeline, x);
      const then = skinFrame(createSkinFrame(), timeline, x - timeline.lag);
      assert.equal(now.litBody, then.body);
      assert.equal(now.litHead, then.head);
      assert.ok(now.litBody <= now.body && now.litHead <= now.head);
      // Growing, the emitters are at full gain and the eyes are not the skin's.
      assert.deepEqual([now.lights, now.eyes, now.reactor, now.flow], [1, 0, 1, 1]);
    }
  }
  // About 60 ms: the entry's exactly, the scroll's at the auto movie's pace.
  assert.equal(SKIN_ENTRY.lag, 60);
  assert.ok(SKIN_SCROLL.lag * MOVIE_DURATION_MS >= 60 && SKIN_SCROLL.lag * MOVIE_DURATION_MS < 120);
  const shader = read("src/lib/rexonance-suit-skin.ts");
  // Lit from the lagged front, the bands behind it; a bloom that settles.
  assert.match(shader, /float since = \(mix\(uLit\.x, uLit\.y, crown\) - fld\.r\) \/ BAND - \$\{SKIN_BANDS\.toFixed\(1\)\};/);
  assert.match(shader, /float lamp = smoothstep\(0\.0, 0\.6, since\);/);
  assert.match(shader, /float bloom = lamp \* gain \* \(1\.0 - smoothstep\(0\.6, 3\.2, since\)\) \* 0\.35/);
  // The reactor's disc lights as soon as its cells set: the trigger.
  assert.match(shader, /disc \* smoothstep\(1\.0, 2\.5, a\) \* min\(uGlow\.w, 1\.0\)/);
  // The eyes' box takes the eyes' gain (0 while growing): the scene lights them.
  assert.match(shader, /float gain = mix\(uGlow\.y, uGlow\.z, eyes\);/);
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(surge, /eyes: \[\s*REXONANCE_SUIT_FACE\.x,\s*REXONANCE_SUIT_FACE\.y,/);
  assert.match(surge, /reactor: \[REXONANCE_SUIT_MARKS\.core\[0\], REXONANCE_SUIT_MARKS\.core\[1\], REACTOR_DISC\]/);
  // Gold is never an emitter (no gold forms anywhere it did not).
  assert.match(shader, /float gold = step\(c\.b, c\.g\) \* step\(c\.g, c\.r\);\s*return smoothstep\(0\.16, 0\.42, sat\) \* \(1\.0 - gold\)/);
  // Once the armour has faded, the lit emitters alone stay over the classic
  // engines' held lights until those have lit: no dark gap, no second pop.
  for (const timeline of [SKIN_ENTRY, SKIN_SCROLL]) {
    assert.ok(timeline.glow[0] >= timeline.fade[1] && timeline.glow[1] > timeline.glow[0]);
    const fading = skinFrame(createSkinFrame(), timeline, (timeline.fade[0] + timeline.fade[1]) / 2);
    assert.equal(fading.glow, 1);
    const after = skinFrame(createSkinFrame(), timeline, (timeline.fade[1] + timeline.glow[0]) / 2);
    assert.deepEqual([after.alpha, after.glow, after.on, after.shell, after.classic], [0, 1, true, false, 1]);
    assert.equal(skinFrame(createSkinFrame(), timeline, timeline.glow[1]).glow, 0);
  }
  // The call's light has run out through the body before they go, and they
  // are gone before the face's squares scatter and the eyes light (last).
  assert.ok(SKIN_ENTRY.glow[0] >= REXONANCE_SUIT_LIGHT.from + REXONANCE_SUIT_LIGHT.spread);
  assert.ok(SKIN_ENTRY.glow[1] < REXONANCE_SUIT_PIXELS.scatter);
  // The scroll's: inside the scene's light, gone before a chosen form evolves.
  assert.ok(SKIN_SCROLL.glow[0] > ASSEMBLY_BEATS.light[0]);
  assert.ok(SKIN_SCROLL.glow[1] <= ASSEMBLY_BEATS.light[1] && SKIN_SCROLL.glow[1] <= ASSEMBLY_BEATS.form[0]);
  assert.match(shader, /float lone = art\.a \* glowing \* lit \* step\(\$\{SKIN_BANDS\.toFixed\(1\)\}, a\) \* uGlow\.x \* \(1\.0 - uAlpha\);/);
  // The eyes, last, bloom a little past their light (the call's halo).
  const css = read("src/styles-rexonance-calls.css");
  assert.match(css, /\.rx-suit\[data-skin\]\s*\.rx-suit-halo\.is-eyes \{\s*animation: rxSuitEyeBloom 270ms/);
  assert.match(css, /@keyframes rxSuitEyeBloom \{[^}]*\}\s*44% \{\s*opacity: 1;\s*transform: scale\(1\.15\);/);
});

test("each HUD label lights when the front reaches the part it names", () => {
  // The committed marks are the bake's.
  const marks = skinMarks(bake);
  assert.equal(read(SKIN_MARKS_FILE), skinMarksSource(marks), "run scripts/build-rexonance-skin.mjs");
  assert.deepEqual({ ...SKIN_PART_REACH }, marks.reach);
  assert.deepEqual(Object.keys(SKIN_PART_GROUPS), ASSEMBLY_PARTS);
  assert.deepEqual(Object.keys(SKIN_ENTRY_PARTS).sort(), [...REXONANCE_SUIT_PARTS].sort());
  assert.equal(SKIN_SCROLL_PARTS.length, ASSEMBLY_PARTS.length);
  // At its mark the front's lip is at the middle of the part, on each clock.
  const front = (timeline, x, head) => {
    const frame = skinFrame(createSkinFrame(), timeline, x);
    return head ? frame.head : frame.body;
  };
  for (const part of REXONANCE_SUIT_PARTS) {
    const head = part === "HEAD";
    assert.ok(Math.abs(front(SKIN_ENTRY, SKIN_ENTRY_PARTS[part], head) - SKIN_PART_REACH[part]) < 0.01, part);
    assert.ok(Math.abs(skinReach(SKIN_ENTRY, SKIN_PART_REACH[part], head) - SKIN_ENTRY_PARTS[part]) <= 0.5);
  }
  ASSEMBLY_PARTS.forEach((part, index) => {
    const head = part === "HEAD";
    assert.ok(Math.abs(front(SKIN_SCROLL, SKIN_SCROLL_PARTS[index], head) - SKIN_PART_REACH[part]) < 0.01, part);
  });
  // Never before the front is there: a tenth of the part's cells is under
  // the lip when its label lights, and none of it before the part's first.
  const order = (marksOf) => Object.entries(marksOf).sort((a, b) => a[1] - b[1]).map(([part]) => part);
  // From the reactor out: the chest, the arms, the legs, the helmet last.
  assert.deepEqual(order(SKIN_ENTRY_PARTS), ["CHEST", "ARMS", "LEGS", "HEAD"]);
  assert.deepEqual(
    order(Object.fromEntries(ASSEMBLY_PARTS.map((part, index) => [part, SKIN_SCROLL_PARTS[index]]))),
    ["CHEST", "WAIST", "ARMS", "TAIL", "LEGS", "HEAD"],
  );
  assert.ok(SKIN_ENTRY_PARTS.CHEST > SKIN_ENTRY.body[0] && SKIN_ENTRY_PARTS.LEGS < SKIN_ENTRY.body[1]);
  assert.ok(SKIN_ENTRY_PARTS.HEAD > SKIN_ENTRY.head[0] && SKIN_ENTRY_PARTS.HEAD < SKIN_ENTRY.head[1]);
  assert.ok(SKIN_SCROLL_PARTS.at(-1) > SKIN_SCROLL.head[0] && SKIN_SCROLL_PARTS.at(-1) < SKIN_SCROLL.head[1]);
  // The legs' label no longer leads the front: the old beat (the first
  // DEUS！, the scroll's first quarter of the chant) would light it with the
  // lip still above the knees.
  assert.ok(SKIN_PART_REACH.LEGS > SKIN_PART_REACH.ARMS && SKIN_PART_REACH.ARMS > SKIN_PART_REACH.CHEST);
  // The call: each label carries its mark, used only under the skin; the
  // classic call keeps its beats (the plates' own snaps), and LOCK its own.
  const call = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
  assert.match(call, /"--rx-suit-skin-lock": `\$\{entryElapsedTime\(SKIN_ENTRY_PARTS\[part\]\)\}ms`,/);
  const css = read("src/styles-rexonance-calls.css");
  assert.match(
    css,
    /\.rx-suit\[data-skin\]\s*\.rx-suit-callout:not\(\.is-lock\) \{\s*--rx-suit-lock: var\(--rx-suit-skin-lock\);/,
  );
  assert.match(css, /--rx-suit-lock: calc\(var\(--rx-call-chant-start\) \+ 230ms \+ var\(--rx-suit-i\) \* 120ms\);/);
  // The scroll scene and the auto movie (which drives the scroll): the
  // shared engine reads the page's marks while the skin is live over it,
  // and its own (each part's last tile) otherwise and on every other page.
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(page, /hudParts: \(runway\) => \("rznSkin" in runway\.dataset \? SKIN_SCROLL_PARTS : null\),/);
  const engine = read("src/lib/rexonance-resonance.js");
  assert.match(engine, /const hudPartsOf = typeof config\.hudParts === "function" \? config\.hudParts : null;/);
  assert.match(engine, /const partAt = hudPartsOf\?\.\(runway\) \?\? null;/);
  assert.match(engine, /setFlag\(part, "data-on", progress >= \(\(partAt \?\? plan\.partDone\)\[index\] \|\| 2\)\),/);
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(surge, /flagSkin\(skinLive\);/);
  assert.match(surge, /endLeave\(true\);\s*flagSkin\(false\);/);
  // Under the skin a label lighting strikes no plate lock (and no shake).
  assert.match(surge, /q >= lastQ - 0\.001 && !skinLive\)/);
});

test("the shared scene stops drawing while the skin covers it whole — Rexonance's config only", () => {
  // One playhead decides: the surge layer flags the runway only once it has
  // put the scene's canvases at opacity 0, and clears the flag (telling the
  // engine to draw again) before it raises them.
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(page, /covered: \(_progress, runway\) => "rznCovered" in runway\.dataset,/);
  const layer = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(
    layer,
    /const hidden = value <= 0\.001;\s*if \(!hidden\) flagCovered\(false\);\s*for \(const element of[\s\S]*?\}\s*if \(hidden\) flagCovered\(true\);/,
  );
  assert.match(
    layer,
    /delete runway\.dataset\.rznCovered;\s*runway\.dispatchEvent\(new Event\("rexonance:assembly-redraw"\)\);/,
  );
  // Whenever the skin's armour is opaque over the figure the flag can be up;
  // the canvases are hidden only inside that span.
  for (let q = 0; q <= 1; q += 0.001) {
    const frame = skinFrame(createSkinFrame(), SKIN_SCROLL, q);
    if (frame.classic <= 0.001) assert.equal(frame.alpha, 1, `the skin is whole at ${q}`);
  }
  const engine = read("src/lib/rexonance-resonance.js");
  assert.match(engine, /const coveredAt = typeof config\.covered === "function" \? config\.covered : null;/);
  // The frame draws nothing, but the welded plates and the gold keep pace,
  // so the first frame back is whole; the field's layer is cleared.
  assert.match(
    engine,
    /coveredDrawn = Boolean\(coveredAt && !wire && nano && coveredAt\(progress, runway\)\);\s*if \(coveredDrawn\) \{\s*syncSettled\(paintedBy\(progress\), seal >= 1\);\s*if \(goldLayer\) syncGold\(progress\);\s*lastDrawMs = 0;\s*if \(field && fieldProgress >= 0\) \{\s*fieldProgress = -1;\s*field\.clear\(\);\s*\}\s*return;/,
  );
  // The skin coming or going over a resting frame draws it again.
  assert.match(engine, /runway\.addEventListener\?\.\("rexonance:assembly-redraw", redrawAssembly\);/);
  assert.match(engine, /runway\.removeEventListener\?\.\("rexonance:assembly-redraw", redrawAssembly\);/);
  assert.match(
    read("src/components/rexonance-saga/rexonance-suit-surge.tsx"),
    /runway\.dispatchEvent\(new Event\("rexonance:assembly-redraw"\)\);/,
  );
  // No other page's suit-up passes either hook.
  const walk = (dir) =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );
  const users = walk("src")
    .filter((path) => /\.(tsx?|jsx?)$/.test(path))
    .filter((path) => /\b(hudParts|covered)\??:\s*\(/.test(read(path)));
  // (Rexonance's own two stages: the page's runway and the lab's.)
  assert.deepEqual(users.sort(), [
    "src/components/rexonance-saga/rexonance-saga.tsx",
    "src/lib/rexonance-resonance.d.ts",
    "src/lib/transformation-lab-rexonance.ts",
  ]);
  assert.match(
    read("src/lib/transformation-lab-rexonance.ts"),
    /covered: \(_progress, runway\) => "rznCovered" in runway\.dataset,/,
  );
});

test("the retract: lights out, the face opens, the helmet sinks, the limbs are drawn in, the reactor dims last", () => {
  assert.equal(SKIN_RETRACT_MS, 1600);
  assert.ok(SKIN_RETRACT_FADE_MS >= 150 && SKIN_RETRACT_FADE_MS <= 300);
  const at = (ms) => skinRetractFrame(createSkinFrame(), ms);
  // It starts on the finished, lit suit and ends on the bare body.
  const first = at(0);
  assert.deepEqual(
    [first.body, first.head, first.lights, first.eyes, first.reactor, first.alpha, first.classic],
    [SKIN_WHOLE, SKIN_WHOLE, 1, 1, 1, 1, 0],
  );
  const end = at(SKIN_RETRACT_MS);
  assert.ok(end.body <= -SKIN_BAND * 0.6 && end.head <= -SKIN_BAND * 0.6, "nothing of the shell is left");
  assert.equal(end.reactor, 0);
  assert.deepEqual(at(SKIN_RETRACT_MS + 500), end);
  let previous = first;
  let faceOpen = -1;
  let helmetGone = -1;
  let bodyMoves = -1;
  let armourGoes = -1;
  let bodyGone = -1;
  const steps = [];
  for (let ms = 4; ms <= SKIN_RETRACT_MS; ms += 4) {
    const frame = at(ms);
    // The fronts only recede, without a jump; the droplets run inward.
    for (const key of ["body", "head"]) {
      assert.ok(frame[key] <= previous[key] + 1e-12, `${key} never grows back at ${ms}`);
      assert.ok(previous[key] - frame[key] < 0.03, `${key} never jumps at ${ms}`);
    }
    assert.equal(frame.flow, -1);
    assert.ok(frame.on && frame.shell && frame.alpha === 1 && frame.classic === 0 && frame.glow === 0);
    if (faceOpen < 0 && frame.head <= SKIN_FACE_FROM) faceOpen = ms;
    if (helmetGone < 0 && frame.head <= 0) helmetGone = ms;
    if (bodyMoves < 0 && frame.body < SKIN_WHOLE) bodyMoves = ms;
    if (armourGoes < 0 && frame.body < 1) armourGoes = ms;
    if (bodyGone < 0 && frame.body <= 0) bodyGone = ms;
    if (ms > SKIN_RETRACT_FLUSH[1] && ms <= SKIN_RETRACT.body[1]) steps.push(previous.body - frame.body);
    previous = frame;
  }
  // 1. The lights go out first: the eyes, then the emitters, before any of
  // the shell has left (its first texel goes once the front is under 1).
  assert.equal(at(SKIN_RETRACT.eyes[1]).eyes, 0);
  assert.ok(at(SKIN_RETRACT.eyes[1]).head > 1, "the eyes are dark before the visor opens");
  assert.ok(at(SKIN_RETRACT.eyes[1]).lights > 0.8, "the eyes before the emitters");
  assert.equal(at(SKIN_RETRACT.lights[1]).lights, 0);
  assert.ok(SKIN_RETRACT.lights[1] < SKIN_RETRACT.body[0] && SKIN_RETRACT.lights[1] < faceOpen);
  assert.ok(at(SKIN_RETRACT.lights[1]).body > 1.25, "the lights are out before any armour leaves");
  // 2–3. The face opens (by 0.3 s), then the helmet sinks (by 0.6 s) …
  assert.ok(faceOpen > 150 && faceOpen <= 300, `the face is open at ${faceOpen}`);
  assert.ok(helmetGone > faceOpen && helmetGone <= 600, `the helmet is down at ${helmetGone}`);
  // 4. … while the body's front falls through the finished bands behind a
  // whole suit (they hold no armour: receding through them on the pull's
  // own curve left the body untouched until 1000 ms), so the limbs' far
  // ends start for the chest as the helmet is down, and ever faster.
  assert.ok(bodyMoves > SKIN_RETRACT_FLUSH[0] && bodyMoves <= SKIN_RETRACT_FLUSH[0] + 8);
  assert.ok(SKIN_RETRACT_FLUSH[0] >= SKIN_RETRACT.helmet[0] && SKIN_RETRACT_FLUSH[1] <= SKIN_RETRACT.helmet[1]);
  assert.ok(at(SKIN_RETRACT_FLUSH[1]).body > 0.98, "the flush takes none of the armour off");
  assert.ok(armourGoes > faceOpen && armourGoes >= helmetGone - 60 && armourGoes <= 680, `the limbs' ends go at ${armourGoes}`);
  assert.ok(at(1000).body < 0.85 && at(1000).body > 0.6, "no still half second in the middle");
  for (let n = 1; n < steps.length; n += 1)
    assert.ok(steps[n] >= steps[n - 1] - 1e-9, "the pull accelerates");
  assert.ok(SKIN_RETRACT_PULL > 2 && SKIN_RETRACT_PULL <= 3);
  // The feet (the field's far end) leave first, the chest (its origin) last.
  const feetGone = (() => {
    for (let ms = 0; ms <= SKIN_RETRACT_MS; ms += 4) if (at(ms).body < 0.9) return ms;
  })();
  assert.ok(feetGone < bodyGone - 300);
  // 5. The reactor is lit through all of it, pulses once, and dims last.
  for (let ms = 0; ms <= SKIN_RETRACT.pulse[0]; ms += 20) assert.equal(at(ms).reactor, 1);
  assert.ok(at((SKIN_RETRACT.pulse[0] + SKIN_RETRACT.pulse[1]) / 2).reactor > 1.2, "one last pulse");
  assert.ok(at(bodyGone).reactor > 0.1, "still lit as the chest closes into it");
  assert.ok(bodyGone > 1400 && bodyGone < SKIN_RETRACT_MS);
  assert.ok(at(SKIN_RETRACT_MS - 20).reactor > 0 && at(SKIN_RETRACT_MS - 20).reactor < 0.1);
  // Closed-form.
  const reused = createSkinFrame();
  skinRetractFrame(reused, 1500);
  skinRetractFrame(reused, 420);
  assert.deepEqual(reused, at(420));
});

test("the retract plays where the suit leaves; a plain scroll back stays the build's own reverse", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  // One event, the movie's and the replay link's.
  assert.match(surge, new RegExp(`const RETRACT_EVENT = "${MOVIE_LEAVE_EVENT}";`));
  const guide = read("src/components/rexonance-saga/rexonance-assembly-guide.tsx");
  assert.match(guide, /<a href="#assembly" onClick=\{replayAfterRetract\}>/);
  assert.match(guide, new RegExp(`const RETRACT_EVENT = "${MOVIE_LEAVE_EVENT}";`));
  assert.match(guide, /new CustomEvent<RetractDetail>\(RETRACT_EVENT, \{\s*cancelable: true,/);
  // Nothing to play (or a modified click): the plain link, as it was.
  assert.match(guide, /if \(!leave\.defaultPrevented\) \{\s*delete anchor\.dataset\.leave;\s*return;\s*\}\s*event\.preventDefault\(\);/);
  assert.match(guide, /anchor\.dataset\.leave = "go";\s*anchor\.click\(\);/);
  // The hook: over the finished standard suit with the skin in hand, the
  // retract on its own clock; another form or no skin, and the still tiers
  // (reduced motion, economy), a short fade.
  assert.match(surge, /if \(lastQ < RETRACT_FROM\) return;/);
  assert.match(surge, /const RETRACT_FROM = LEAVE_FROM;/);
  assert.match(surge, /const RETRACT_FADE_MS = LEAVE_FADE_MS;/);
  assert.equal(LEAVE_FROM, 0.93);
  assert.equal(LEAVE_FADE_MS, 250);
  assert.equal(SKIN_RETRACT_FADE_MS, 250);
  assert.match(
    surge,
    /if \(grown && !grown\.renderer\.lost && runway\.dataset\.form === "standard"\) \{[\s\S]*?if \(!leave\.begin\("retract", performance\.now\(\), detail\.done\)\) return;\s*event\.preventDefault\(\);/,
  );
  assert.match(
    surge,
    /if \(!visible \|\| !still \|\| !reducedMotion\(\)\) return;[\s\S]*?if \(fadeOut\(\[still\]\)\) event\.preventDefault\(\);/,
  );
  assert.match(surge, /if \(fadeOut\(classicLayers\(\)\)\) event\.preventDefault\(\);/);
  // The page moves only once it is over; the reader's own scroll ends it
  // (the leave's own state: rexonance-suit-leave.ts, tested apart).
  assert.match(
    surge,
    /const step = leave\.step\(\s*now,\s*target,\s*!retracting \|\| skinLive,\s*retracting && grown \? grown\.lib\.SKIN_RETRACT_MS : Number\.POSITIVE_INFINITY,\s*slack,\s*\);/,
  );
  assert.match(surge, /const slack = direct \? 0 : LEAVE_SLACK;/);
  assert.equal(LEAVE_SLACK, 0.012);
  // Without a retract in play the skin is the playhead's alone: scrubbing
  // back runs the same frames in reverse (the closed-form test above).
  assert.match(surge, /const leaving = step !== "" && step !== "moved" && retracting;/);
  assert.match(
    surge,
    /\? leaving\s*\? grown\.lib\.skinRetractFrame\(grown\.frame, leave\.ms\)\s*: grown\.lib\.skinFrame\(grown\.frame, grown\.lib\.SKIN_SCROLL, q\)/,
  );
  assert.equal(surge.match(/leave\.begin\("retract"/g).length, 1, "only a leave starts it");
  assert.equal(surge.match(/skinRetractFrame\(/g).length, 1);
  // The entry has no retract: the call hands the suit to the page.
  const entry = surge.slice(surge.indexOf("export function EntrySurge()"), surge.indexOf("export function ScrollSurgeCanvas"));
  assert.doesNotMatch(entry, /skinRetractFrame|RETRACT_EVENT/);
  // The driver stays on the body, finished: the retract ends on the skin's
  // base (the undersuit with the driver), and the body never moves.
  assert.match(surge, /grown\.renderer\.render\(growing, now \/ 1000, 1\);/);
});


test("the bands are narrow (a front, never a cross-fade)", () => {
  assert.ok(SKIN_BAND <= 0.08);
  assert.equal(SKIN_BANDS, 5);
  assert.ok(Math.abs(SKIN_WHOLE - (1 + 5.4 * SKIN_BAND)) < 1e-9);
  const shader = read("src/lib/rexonance-suit-skin.ts");
  assert.match(shader, new RegExp(`const float BAND = \\$\\{SKIN_BAND\\.toFixed\\(3\\)\\};`));
  for (const stage of ["Liquid chrome", "The fibres", "The cells", "The panel lines", "The lip"])
    assert.ok(shader.includes(stage), stage);
  assert.match(shader, /precision highp float;/);
});

test("the droplets are budgeted per device, sorted along the field, and live only at the front", () => {
  const device = ({
    coarse = false,
    reduced = false,
    cores = 8,
    width = 1440,
    height = 900,
    memory,
  } = {}) => ({
    matchMedia: (query) => ({
      matches: query.includes("reduced-motion")
        ? reduced
        : query.includes("coarse")
          ? coarse
          : false,
    }),
    navigator: { hardwareConcurrency: cores, deviceMemory: memory },
    innerWidth: width,
    innerHeight: height,
  });
  const desktop = skinBudget(device());
  const tablet = skinBudget(device({ coarse: true, width: 820, height: 1180 }));
  const phone = skinBudget(device({ coarse: true, width: 390, height: 844 }));
  const low = skinBudget(device({ coarse: true, width: 390, height: 844, cores: 4 }));
  assert.ok(
    desktop.samples > tablet.samples &&
      tablet.samples > phone.samples &&
      phone.samples > low.samples,
  );
  for (const budget of [desktop, tablet, phone, low])
    assert.ok(budget.ratio <= 2, "the pixel ratio is capped at 2");
  assert.ok(low.ratio < phone.ratio);
  assert.equal(skinBudget(device({ reduced: true })), null);
  assert.equal(skinBudget(device({ coarse: true, reduced: true })), null);
  assert.deepEqual(
    [...SKIN_QUALITY].sort((a, b) => b - a),
    [...SKIN_QUALITY],
    "quality only falls with the governor",
  );
  assert.ok(SKIN_QUALITY.at(-1) >= 0.5);

  // The page reads the picture back as RGBA.
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1)
    rgba.set([bake.texture[i * 3], bake.texture[i * 3 + 1], bake.texture[i * 3 + 2], 255], i * 4);
  for (const budget of [desktop, phone]) {
    const field = skinSamples(rgba, W, H, budget.samples);
    const total = field.bodySamples + field.headSamples;
    assert.ok(total > budget.samples * 0.8 && total < budget.samples * 1.2);
    assert.equal(field.samples.length, total * SKIN_SAMPLE);
    const check = (first, count) => {
      for (let n = 0; n < count; n += 1) {
        const o = (first + n) * SKIN_SAMPLE;
        if (n)
          assert.ok(
            field.samples[o + 2] >= field.samples[o - SKIN_SAMPLE + 2],
            "sorted by the field",
          );
        assert.ok(
          Math.abs(Math.hypot(field.samples[o + 3], field.samples[o + 4]) - 1) < 1e-4,
          "a unit direction",
        );
        const cell = Math.floor(field.samples[o + 1]) * W + Math.floor(field.samples[o]);
        assert.ok(input.alpha[cell] > 127, "on the armour");
      }
    };
    check(0, field.bodySamples);
    check(field.bodySamples, field.headSamples);
    // Drawn: only near the front, never more than the live budget.
    const drawn = [];
    const context = {
      beginPath() {},
      fill() {},
      // (Round droplets: a square read as confetti.)
      moveTo() {},
      arc: (x, y, r) => {
        assert.ok(r > 0 && r < 3);
        drawn.push([x, y]);
      },
      fillStyle: "",
    };
    const live = (body, head) => {
      drawn.length = 0;
      drawSkinDroplets(
        context,
        field,
        { body, head, alpha: 1, classic: 0, on: true, flow },
        3,
        1000,
        1,
      );
      return drawn.length;
    };
    let flow = 1;
    assert.equal(live(0, 0), 0, "none before the front leaves the reactor");
    assert.equal(live(SKIN_WHOLE, SKIN_WHOLE), 0, "none on the finished suit");
    let most = 0;
    for (let f = 0.02; f < 1.05; f += 0.02) most = Math.max(most, live(f, 0));
    assert.ok(most > 20, "the front carries droplets");
    assert.ok(
      most <= (budget === desktop ? 600 : 250) * 1.6,
      `at most about the live budget (${most})`,
    );
    // Each stays within a band or two of the front (in cells of the field).
    live(0.5, 0);
    for (const [x, y] of drawn) {
      const cx = Math.min(W - 1, Math.max(0, Math.round(x / 3)));
      const cy = Math.min(H - 1, Math.max(0, Math.round(y / 3)));
      let near = false;
      for (let dy = -9; dy <= 9 && !near; dy += 1)
        for (let dx = -9; dx <= 9 && !near; dx += 1) {
          const j = (cy + dy) * W + cx + dx;
          if (
            j >= 0 &&
            j < W * H &&
            bake.field[j] >= 0 &&
            Math.abs(bake.field[j] - 0.5) < 2 * SKIN_BAND
          )
            near = true;
        }
      assert.ok(near, "a droplet is at the front");
    }
    // Receding (the retract), the same droplets run the other way.
    const out = drawn.map(([x, y]) => [x, y]);
    flow = -1;
    live(0.5, 0);
    assert.equal(drawn.length, out.length);
    assert.ok(drawn.some(([x, y], n) => Math.hypot(x - out[n][0], y - out[n][1]) > 4));
    flow = 1;
  }
});

test("the skin takes over only when it and the nanite engine are ready, and hands back cleanly", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  // Engaged before its front is due, with the canvas engine under it.
  assert.match(
    surge,
    /engaged = t < from \+ \(to - from\) \* 0\.4 && suit\.dataset\.nanites === "canvas";/,
  );
  // A lost context returns the call to the classic engine.
  assert.match(
    surge,
    /if \(grown\.renderer\.lost\) \{[\s\S]*?engaged = false;\s*showClassic\(1\);/,
  );
  // The classic layers' opacity is restored on every exit.
  assert.ok(surge.match(/showClassic\(1\);/g).length >= 4);
  assert.match(surge, /dropSkin\(\);\s*showClassic\(1\);\s*delete suit\.dataset\.skin;/);
  // The surge's own swarm and locks stand down while the skin grows.
  assert.match(surge, /engine\.quiet = Boolean\(growing\?\.shell\);/);
  assert.match(surge, /engine\.quiet = shellOn;/);
  assert.match(read("src/lib/rexonance-suit-surge.ts"), /if \(!this\.quiet\) \{\s*this\.drawSwarm/);
  // The canvases are in both scenes, after the classic engines'.
  const call = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
  assert.ok(
    call.indexOf("<SuitNanites onReady={onNanites} />") < call.indexOf("<EntrySkinCanvas />"),
  );
  assert.ok(call.indexOf("<EntrySkinCanvas />") < call.indexOf('className="rx-suit-face"'));
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(
    page,
    /<canvas className="rzn-canvas" width=\{0\} height=\{0\} \/>\s*<ScrollSkinCanvas \/>\s*<ScrollSurgeCanvas layer="front" \/>/,
  );
  // The driver is on the body, finished, throughout: the skin's own base
  // carries it in the scroll scene, the DOM plate in the call.
  assert.match(surge, /paint\?\.drawImage\(driver, 0, 0, base\.width, base\.height\);/);
  assert.match(
    read("src/styles-rexonance-calls.css"),
    /\.rx-suit\[data-nanites="canvas"\] \.rx-suit-build > \.rx-suit-plate\.is-driver \{\s*display: block;/,
  );
  // The plate's clank glints stand down with the plates.
  assert.match(
    read("src/styles-rexonance-calls.css"),
    /\.rx-suit\[data-skin\] \.rx-suit-build > \.rx-suit-spark \{\s*visibility: hidden;/,
  );
});

test("the marks the bake seeds from are the suit's own", () => {
  const k = W / REXONANCE_SUIT_SIZE.width;
  assert.deepEqual(input.core, [
    REXONANCE_SUIT_MARKS.core[0] * k,
    REXONANCE_SUIT_MARKS.core[1] * k,
  ]);
  assert.equal(input.satellites.length, 5);
  for (const [, , delay] of input.satellites) assert.ok(delay > 0 && delay < 0.5);
});

/* The cells (owner, 2026-11-11: the streams were 「気持ち悪い」; the matter
   is taken in from the air as hexagonal cells, large and fine). */
const cellDevice = (coarse, width, height, cores = 8) => ({
  matchMedia: (query) => ({ matches: query.includes("coarse") ? coarse : false }),
  navigator: { hardwareConcurrency: cores },
  innerWidth: width,
  innerHeight: height,
});
const cellRgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i += 1)
  cellRgba.set([bake.texture[i * 3], bake.texture[i * 3 + 1], bake.texture[i * 3 + 2], 255], i * 4);
const CELL = REXONANCE_SUIT_SIZE.width / W;
const FIGURE = [REXONANCE_SUIT_SIZE.width, REXONANCE_SUIT_SIZE.height];
/** A phone's entry: CSS px per figure px. */
const PHONE_SCALE = 0.44;
const HEX = 9.1;
const cellAt = (x, y) =>
  Math.min(H - 1, Math.max(0, Math.floor(y / CELL))) * W +
  Math.min(W - 1, Math.max(0, Math.floor(x / CELL)));
/** A context that can only draw sprites: any path or stroke throws. */
const spriteContext = () => {
  const calls = [];
  let depth = 0;
  const never = (name) => () => {
    throw new Error(`${name}: the cells draw sprites only`);
  };
  const context = {
    calls,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
      assert.ok(Number.isFinite(dx + dy + dw + dh) && dw > 0 && dh > 0);
      calls.push({ sx, sy, sw, sh, dx, dy, dw, dh, alpha: context.globalAlpha, mode: context.globalCompositeOperation });
    },
    save() {
      depth += 1;
    },
    restore() {
      depth -= 1;
      assert.ok(depth >= 0);
    },
    translate() {},
    rotate() {},
    scale() {},
    get depth() {
      return depth;
    },
  };
  for (const name of ["beginPath", "moveTo", "lineTo", "arc", "rect", "stroke", "fill", "fillRect", "strokeRect", "quadraticCurveTo", "bezierCurveTo"])
    context[name] = never(name);
  return context;
};
const SHEET = { sheet: true };

test("the cells: budgeted per device in two sizes, shed by the governor, none under reduced motion", () => {
  const desktop = skinBudget(cellDevice(false, 1440, 900));
  const tablet = skinBudget(cellDevice(true, 820, 1180));
  const phone = skinBudget(cellDevice(true, 390, 844));
  const low = skinBudget(cellDevice(true, 390, 844, 4));
  for (const key of ["large", "fine"]) {
    assert.ok(desktop[key] > tablet[key] && tablet[key] > phone[key] && phone[key] > low[key], key);
    for (const budget of [desktop, tablet, phone, low])
      assert.ok(budget.fine >= budget.large * 8, "many fine cells to each large one");
  }
  assert.deepEqual([phone.large, phone.fine], [25, 220]);
  assert.ok(low.large >= 10 && low.fine >= 100 && desktop.large <= 48 && desktop.fine <= 420);
  assert.equal(SKIN_CELL_SHARE[0], 1);
  assert.deepEqual([...SKIN_CELL_SHARE].sort((a, b) => b - a), [...SKIN_CELL_SHARE]);
  assert.ok(SKIN_CELL_SHARE.at(-1) >= 0.4);
  assert.equal(SKIN_CELL_SHARE.length, SKIN_QUALITY.length);
  assert.equal(
    skinBudget({ matchMedia: (query) => ({ matches: query.includes("reduced-motion") }) }),
    null,
  );
  // Large: 18 – 40 CSS px on a phone's call; fine: 2 – 6.
  assert.ok(SKIN_CELL_SIZE.large[0] * PHONE_SCALE >= 18 && SKIN_CELL_SIZE.large[1] * PHONE_SCALE <= 41);
  assert.ok(SKIN_CELL_SIZE.fine[0] * PHONE_SCALE >= 1.9 && SKIN_CELL_SIZE.fine[1] * PHONE_SCALE <= 6);
  assert.ok(SKIN_CELL_SIZE.fineMin >= 2 && SKIN_CELL_SIZE.largeMin >= 16);
  const field = skinSamples(cellRgba, W, H, phone.samples);
  const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  const [back, front] = [spriteContext(), spriteContext()];
  cells.draw(back, front, field, SKIN_ENTRY, 900, 5000, PHONE_SCALE, HEX);
  assert.ok(cells.live > (phone.large + phone.fine) * 0.35, `in the air: ${cells.live}`);
  const shed = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  shed.draw(spriteContext(), spriteContext(), field, SKIN_ENTRY, 900, 5000, PHONE_SCALE, HEX, undefined, SKIN_CELL_SHARE.at(-1));
  assert.ok(shed.live > 0 && shed.live < cells.live * 0.55);
  // The layer's own gain (the call raises it as the skin engages: a skin
  // that is ready late never pops its cells in mid-flight).
  const [dimBack, dimFront] = [spriteContext(), spriteContext()];
  cells.draw(dimBack, dimFront, field, SKIN_ENTRY, 900, 5000, PHONE_SCALE, HEX, undefined, 1, 0.5);
  assert.equal(dimFront.calls.length, front.calls.length);
  dimFront.calls.forEach((call, n) => assert.ok(Math.abs(call.alpha - front.calls[n].alpha * 0.5) < 1e-6));
  const [offBack, offFront] = [spriteContext(), spriteContext()];
  cells.draw(offBack, offFront, field, SKIN_ENTRY, 900, 5000, PHONE_SCALE, HEX, undefined, 1, 0);
  assert.equal(offBack.calls.length + offFront.calls.length, 0);
  // The droplets after it always draw as light.
  assert.equal(offFront.globalCompositeOperation, "lighter");
  assert.match(
    read("src/components/rexonance-saga/rexonance-suit-surge.tsx"),
    /Math\.min\(1, \(now - engagedAt\) \/ CELLS_IN_MS\),/,
  );
  // Without a sheet (no canvas to be had) nothing is drawn and nothing throws.
  const bare = new SkinCells(phone.large, phone.fine, null, CELL, FIGURE);
  bare.draw(spriteContext(), spriteContext(), field, SKIN_ENTRY, 900, 5000, PHONE_SCALE, HEX);
  assert.equal(bare.live, 0);
});

test("the cells are sprites from a sheet drawn once: no stroke, no line, no trail in a frame", () => {
  // The sheet: hexagons only, built through the canvas the caller makes.
  const built = { paths: 0, points: 0, fills: 0, strokes: 0 };
  const sheetContext = {
    beginPath: () => (built.paths += 1),
    moveTo: () => (built.points += 1),
    lineTo: () => (built.points += 1),
    closePath() {},
    fill: () => (built.fills += 1),
    stroke: () => (built.strokes += 1),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  let size = null;
  const canvas = { getContext: () => sheetContext };
  assert.equal(
    buildSkinCellSheet((width, height) => {
      size = [width, height];
      return canvas;
    }),
    canvas,
  );
  assert.ok(size[0] <= 512 && size[1] <= 512, "a small sheet");
  assert.equal(built.points, built.paths * 6, "every shape on it is a hexagon");
  // Four plates (a bevel, a face, a sheen each; a honeycomb and a rim),
  // the flash, the micro-cell, the specks.
  assert.ok(built.fills >= 4 * 3 + 1 + 24 && built.strokes >= 4 * 9);
  assert.equal(buildSkinCellSheet(() => null), null);

  const phone = skinBudget(cellDevice(true, 390, 844));
  const field = skinSamples(cellRgba, W, H, phone.samples);
  const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  const seen = { plates: 0, behind: 0, specks: 0, flashes: 0, micros: 0 };
  for (let t = 150; t < 1980; t += 10) {
    const [back, front] = [spriteContext(), spriteContext()];
    // (Any path or stroke call throws.)
    cells.draw(back, front, field, SKIN_ENTRY, t, 5000 + t, PHONE_SCALE, HEX);
    assert.equal(front.depth, 0);
    assert.equal(front.globalAlpha, 1);
    assert.equal(back.globalAlpha, 1);
    assert.ok(front.calls.length + back.calls.length <= cells.count * 2 * 2 + phone.large * 2 * 8);
    for (const call of [...front.calls, ...back.calls]) {
      assert.ok(call.alpha >= 0 && call.alpha <= 1);
      if (call.sy === 0) {
        // A plate: metal over the scene, never added light; over the
        // figure, or passing behind it (smaller and dimmer: depth).
        assert.equal(call.sw, 128);
        assert.ok(call.sx % 128 === 0 && call.sx < 512, "one of the four rims");
        assert.equal(call.mode, "source-over");
        if (back.calls.includes(call)) {
          assert.ok(call.alpha <= 0.63 && call.dw * PHONE_SCALE <= 40);
          seen.behind += 1;
        }
        assert.ok(call.dw * PHONE_SCALE <= 62, "a plate, not a panel");
        seen.plates += 1;
      } else {
        assert.equal(call.mode, "lighter");
        if (call.sw === 24) {
          // A speck, never stretched: square, and a few px at most.
          assert.equal(call.dw, call.dh);
          assert.ok(call.dw * PHONE_SCALE < 9.5, `a speck (${call.dw * PHONE_SCALE})`);
          seen.specks += 1;
        } else if (call.sw === 64) seen.flashes += 1;
        else {
          assert.equal(call.sw, 32);
          seen.micros += 1;
        }
      }
      assert.equal(call.dw, call.dh, "no stretch along the way");
    }
  }
  assert.ok(seen.plates > 0 && seen.specks > seen.plates * 4 && seen.flashes > 0);
  assert.ok(seen.micros > 0, "a plate breaks into micro-cells as it is taken in");
  assert.ok(seen.behind > 0 && seen.behind < seen.plates * 0.6, "some plates pass behind the figure");

  const lib = read("src/lib/rexonance-suit-skin.ts");
  const drawn = lib.slice(lib.indexOf("export class SkinCells"), lib.indexOf("/* ---------------- the shader"));
  assert.doesNotMatch(drawn, /(context|front|back)\.(stroke|lineTo|moveTo|beginPath|arc|rect|fill|fillRect|strokeRect)\(/);
  assert.doesNotMatch(drawn, /createLinearGradient|createRadialGradient|shadowBlur|lineWidth/);
  assert.doesNotMatch(lib, /SkinTorrent|TORRENT|TRAIL\b/);
  // Nothing is allocated a frame: the typed arrays are the constructor's.
  const perFrame = drawn.slice(drawn.indexOf("  clear()"));
  assert.doesNotMatch(perFrame, /new (Float32Array|Float64Array|Array)|\[\.\.\.|\.map\(|\.filter\(/);
});

/** Every flight of a slot over a clock's run, as lists of poses. */
const flightsOf = (cells, field, timeline, i, wave, from, to, step, nowOf = (x) => 7000 + x) => {
  const pose = new Float32Array(SKIN_CELL_POSE);
  const flights = [];
  let current = null;
  for (let x = from; x <= to; x += step) {
    if (!cells.poseAt(pose, i, wave, field, timeline, x, nowOf(x), PHONE_SCALE)) continue;
    const entry = { x, at: [pose[0], pose[1]], size: pose[2], alpha: pose[3], turn: pose[4], tilt: pose[5], k: pose[6], p: pose[7] };
    if (!current || (timeline ? entry.p < current.at(-1).p : entry.k > current.at(-1).k && current.at(-1).k < 0)) {
      current = [];
      flights.push(current);
    }
    current.push(entry);
  }
  return flights;
};

test("the cells come out of the air all round, only ever inward, and settle flat onto the surface", () => {
  const phone = skinBudget(cellDevice(true, 390, 844));
  const field = skinSamples(cellRgba, W, H, phone.samples);
  const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  const core = REXONANCE_SUIT_MARKS.core;
  let landed = 0;
  let wide = 0;
  let nearCore = 0;
  const quadrants = [0, 0, 0, 0];
  for (let i = 0; i < cells.count; i += 3) {
    for (const flight of flightsOf(cells, field, SKIN_ENTRY, i, false, 0, 1975, 4)) {
      const last = flight.at(-1);
      if (last.k < 0) continue;
      landed += 1;
      const target = last.at;
      const air = flight.filter((pose) => pose.k < 0);
      if (air.length < 4) continue;
      // Inward only: the way left to its landing never grows.
      let left = Infinity;
      for (const pose of air) {
        const d = Math.hypot(pose.at[0] - target[0], pose.at[1] - target[1]);
        assert.ok(d <= left + 1e-3, `slot ${i}: ${d} after ${left}`);
        left = d;
      }
      // Out of the air, not out of the reactor: it first shows far from its
      // landing, faint, and well away from the reactor unless it lands there.
      const first = air[0];
      const reach = Math.hypot(first.at[0] - target[0], first.at[1] - target[1]);
      if (first.p < 0.1) {
        assert.ok(reach > 70, `slot ${i}: first seen ${reach} from its landing`);
        assert.ok(first.alpha < 0.5, "it fades in");
        if (reach > 200) wide += 1;
        if (Math.hypot(first.at[0] - core[0], first.at[1] - core[1]) < 60) nearCore += 1;
        quadrants[(first.at[0] > FIGURE[0] / 2 ? 1 : 0) + (first.at[1] > FIGURE[1] / 2 ? 2 : 0)] += 1;
      }
      // Slow out of the air, quickening onto the surface (no constant crawl).
      const speed = (a, b) => Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) / (b.x - a.x);
      const third = Math.floor(air.length / 3);
      if (third >= 2) assert.ok(speed(air.at(-3), air.at(-1)) > speed(air[third - 1], air[third + 1]));
      // Its turn and its tilt settle: flat and pointy-top (the shader's
      // cells) by the time it lands; its size its own.
      assert.ok(Math.abs(air.at(-1).turn) < 0.12 && air.at(-1).tilt > 0.94);
      assert.equal(last.turn, 0);
      assert.equal(last.tilt, 1);
      // Never a streak: frame to frame it moves a few px, and it is one sprite.
      for (let n = 1; n < air.length; n += 1) {
        const stride = Math.hypot(air[n].at[0] - air[n - 1].at[0], air[n].at[1] - air[n - 1].at[1]);
        assert.ok(stride * PHONE_SCALE < 12, `slot ${i}: ${stride} figure px in 4 ms`);
      }
      // Size: plates 18 – 46 CSS px in the air on a phone (the helmet's
      // smaller, never under 16), specks 2 – 6.
      for (const pose of air.filter((entry) => entry.p > 0.3)) {
        const css = pose.size * PHONE_SCALE;
        if (i < cells.large) assert.ok(css >= 15.9 && css <= 47, `plate ${css}`);
        else assert.ok(css >= 1.95 && css <= 6, `speck ${css}`);
      }
    }
  }
  assert.ok(landed > 60, `landings: ${landed}`);
  assert.ok(wide > landed * 0.25, "many from far out");
  assert.ok(nearCore < landed * 0.03, "not emitted from the reactor");
  for (const count of quadrants) assert.ok(count > landed * 0.08, `all round: ${quadrants}`);
  // The way in itself: monotone, slow first, under half a turn of spiral.
  let before = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    assert.ok(cellEase(p) > before);
    before = cellEase(p);
  }
  assert.equal(cellEase(0), 0);
  assert.ok(Math.abs(cellEase(1) - 1) < 1e-9);
  assert.ok(cellEase(0.5) < 0.3, "it lingers in the air");
  // Wall time only makes them glint: the place is the clock's alone.
  const pose = new Float32Array(SKIN_CELL_POSE);
  const other = new Float32Array(SKIN_CELL_POSE);
  let compared = 0;
  for (let i = 0; i < cells.count; i += 1) {
    if (!cells.poseAt(pose, i, false, field, SKIN_ENTRY, 900, 1000, PHONE_SCALE)) continue;
    if (!cells.poseAt(other, i, false, field, SKIN_ENTRY, 900, 91000, PHONE_SCALE)) continue;
    assert.ok(Math.hypot(pose[0] - other[0], pose[1] - other[1]) * PHONE_SCALE < 12);
    assert.equal(pose[2], other[2]);
    compared += 1;
  }
  assert.ok(compared > 20);
  // From the canvas's edge at the farthest (some from just off screen),
  // and none shows where it would be cut by that edge.
  const bounds = [-200, -100, 771, 1140];
  let edged = 0;
  for (let i = 0; i < cells.count; i += 1)
    for (let x = 200; x < 1900; x += 50)
      if (cells.poseAt(pose, i, false, field, SKIN_ENTRY, x, 0, PHONE_SCALE, bounds)) {
        const inside = Math.min(pose[0] - bounds[0], bounds[2] - pose[0], pose[1] - bounds[1], bounds[3] - pose[1]);
        assert.ok(inside > 0, "nothing shows past the edge");
        if (inside < pose[2] / 2) assert.ok(pose[3] < 0.2, `faint at the edge (${pose[3]})`);
        if (inside < 60) edged += 1;
      }
  assert.ok(edged > 0, "some come in from the edge");
});

for (const [name, timeline, step] of [
  ["entry", SKIN_ENTRY, 4],
  ["scroll", SKIN_SCROLL, 0.0004],
]) {
  test(`${name}: each cell lands just ahead of the front and is taken in as the lip reaches it — torso first, the helmet last`, () => {
    const phone = skinBudget(cellDevice(true, 390, 844));
    const field = skinSamples(cellRgba, W, H, phone.samples);
    const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
    const absorbMost = timeline.cells.absorb[1];
    // (The lip has crossed the whole body here; the bands' flush follows.)
    const bodyDone = skinReach(timeline, 1);
    let landings = 0;
    let onTime = 0;
    let headFirst = Infinity;
    const early = [];
    const late = [];
    for (let i = 0; i < cells.count; i += 2) {
      for (const flight of flightsOf(cells, field, timeline, i, false, 0, timeline.light, step)) {
        const landing = flight.find((pose) => pose.k >= 0);
        if (!landing) continue;
        landings += 1;
        const at = cellAt(landing.at[0], landing.at[1]);
        const value = bake.field[at];
        assert.ok(value >= 0, "it lands on the armour");
        const head = bake.texture[at * 3 + 2] === 255;
        const lip = skinReach(timeline, value, head);
        // The lip is not there yet as it lands, and arrives while it is
        // being taken in.
        if (lip >= landing.x - step * 1.5 && lip <= landing.x + absorbMost) onTime += 1;
        assert.ok(lip > landing.x - (timeline.body[1] - timeline.body[0]) * 0.12, "never long after the lip");
        if (head) headFirst = Math.min(headFirst, landing.x);
        else if (landing.x < timeline.body[0] + (bodyDone - timeline.body[0]) * 0.3) early.push(value);
        else if (landing.x > timeline.body[0] + (bodyDone - timeline.body[0]) * 0.6) late.push(value);
        // Absorbed: it stays where it landed, shrinks into the grid, and is gone.
        const taken = flight.filter((pose) => pose.k >= 0);
        for (const pose of taken) assert.deepEqual(pose.at, landing.at);
        assert.ok(taken.at(-1).k <= 1);
      }
    }
    assert.ok(landings > 120, `landings: ${landings}`);
    assert.ok(onTime > landings * 0.9, `${onTime} of ${landings} on the lip`);
    // The order is the front's: the torso's cells first, the limbs' ends
    // later, the helmet's only once the head's front runs.
    const meanOf = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
    assert.ok(early.length > 10 && late.length > 10);
    assert.ok(meanOf(early) < 0.5 && meanOf(late) > meanOf(early) + 0.25);
    assert.ok(headFirst >= timeline.head[0] - absorbMost, `the helmet's first cell at ${headFirst}`);
    assert.ok(headFirst < timeline.head[1]);
    // They gather in the air before the front starts, but not before the
    // scene's own matter is there.
    const [back, front] = [spriteContext(), spriteContext()];
    cells.draw(back, front, field, timeline, timeline.cells.from[0], 0, PHONE_SCALE, HEX);
    assert.equal(cells.live, 0);
    cells.draw(back, front, field, timeline, timeline.body[0], 0, PHONE_SCALE, HEX);
    assert.ok(cells.live > 40, "in the air as the front leaves the reactor");
    assert.ok(timeline.cells.from[1] <= timeline.body[0]);
  });

  test(`${name}: a last wave from all round lands over the body before the light, and nothing outlives it`, () => {
    const phone = skinBudget(cellDevice(true, 390, 844));
    const field = skinSamples(cellRgba, W, H, phone.samples);
    const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
    const [from, to] = timeline.cells.wave;
    assert.ok(from > timeline.body[1] && to < timeline.light, "after the body is whole, before the light");
    let waves = 0;
    const sides = [0, 0, 0, 0];
    let headLandings = 0;
    for (let i = 0; i < cells.count; i += 1) {
      const flights = flightsOf(cells, field, timeline, i, true, timeline.body[0], timeline.light, step);
      if (!flights.length) continue;
      assert.equal(flights.length, 1, "one landing each");
      const flight = flights[0];
      const landing = flight.find((pose) => pose.k >= 0);
      assert.ok(landing, "it lands");
      assert.ok(landing.x >= from - step && landing.x <= to + step * 1.5);
      const at = cellAt(landing.at[0], landing.at[1]);
      assert.ok(bake.field[at] >= 0, "on the body");
      if (bake.texture[at * 3 + 2] === 255) headLandings += 1;
      const first = flight[0];
      let left = Infinity;
      for (const pose of flight.filter((entry) => entry.k < 0)) {
        const d = Math.hypot(pose.at[0] - landing.at[0], pose.at[1] - landing.at[1]);
        assert.ok(d <= left + 1e-3);
        left = d;
      }
      sides[(first.at[0] > landing.at[0] ? 1 : 0) + (first.at[1] > landing.at[1] ? 2 : 0)] += 1;
      assert.ok(flight.at(-1).x < timeline.light, "over before the light");
      waves += 1;
    }
    assert.ok(waves > cells.count * 0.65 && waves < cells.count * 0.85, `the wave: ${waves}`);
    // Specks only: on finished armour a plate sat like a sticker.
    for (let i = 0; i < cells.large; i += 1)
      assert.equal(flightsOf(cells, field, timeline, i, true, timeline.body[0], timeline.light, step).length, 0);
    for (const count of sides) assert.ok(count > waves * 0.12, `from all round: ${sides}`);
    assert.ok(headLandings > 0 && headLandings < waves * 0.5, "over the whole body");
    // Faded out into the light; from the light on, none (no afterburn).
    const [back, front] = [spriteContext(), spriteContext()];
    cells.draw(back, front, field, timeline, timeline.cells.out[1], 0, PHONE_SCALE, HEX);
    for (const call of [...back.calls, ...front.calls]) assert.ok(call.alpha < 0.01);
    assert.ok(timeline.cells.out[1] <= timeline.light);
    for (const x of [timeline.light, timeline.light * 1.02, timeline.glow[1], timeline.light * 2]) {
      const [behind, over] = [spriteContext(), spriteContext()];
      cells.draw(behind, over, field, timeline, x, 0, PHONE_SCALE, HEX);
      assert.equal(cells.live, 0);
      assert.equal(behind.calls.length + over.calls.length, 0);
    }
  });
}

test("the cells keep nothing of their own: a seek, a stop, a scrub either way leave the clock's frame and no more", () => {
  const phone = skinBudget(cellDevice(true, 390, 844));
  const field = skinSamples(cellRgba, W, H, phone.samples);
  const frameAt = (cells, timeline, x) => {
    const [back, front] = [spriteContext(), spriteContext()];
    cells.draw(back, front, field, timeline, x, 4242, PHONE_SCALE, HEX);
    return JSON.stringify([back.calls, front.calls]);
  };
  const fresh = () => new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  // 200 rounds of fast scrubbing — forward, back, seeks, the retract cut in,
  // clears — then any playhead draws exactly what a new mount would.
  const cells = fresh();
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let round = 0; round < 200; round += 1) {
    const q = random();
    const kind = round % 5;
    if (kind === 3) frameAt(cells, null, random() * SKIN_RETRACT_MS * 1.1);
    else frameAt(cells, SKIN_SCROLL, q);
    if (kind === 1) cells.clear();
    if (kind === 1) assert.equal(cells.live, 0);
    if (round % 20 === 0) {
      const at = 0.15 + 0.7 * random();
      assert.equal(frameAt(cells, SKIN_SCROLL, at), frameAt(fresh(), SKIN_SCROLL, at), `round ${round}`);
    }
  }
  // The scrub back is the same frames: forward to .4 and back from .6.
  const forward = fresh();
  const backward = fresh();
  for (let q = 0.2; q <= 0.4001; q += 0.002) frameAt(forward, SKIN_SCROLL, q);
  for (let q = 0.6; q >= 0.4; q -= 0.002) frameAt(backward, SKIN_SCROLL, q);
  assert.equal(frameAt(forward, SKIN_SCROLL, 0.4), frameAt(backward, SKIN_SCROLL, 0.4));
  // Over a finished suit, before the scene, and past the retract: nothing.
  for (const [timeline, x] of [
    [SKIN_SCROLL, 0],
    [SKIN_SCROLL, 0.95],
    [SKIN_SCROLL, 1],
    [SKIN_ENTRY, 0],
    [SKIN_ENTRY, 2600],
    [null, SKIN_RETRACT_MS],
    [null, SKIN_RETRACT_MS + 400],
    [null, -5],
  ]) {
    frameAt(cells, timeline, x);
    assert.equal(cells.live, 0, `${timeline ? "grow" : "retract"} at ${x}`);
  }
  // Wired on both clocks: the entry's and the scroll's own timelines, the
  // retract's ms where the suit leaves, the governor's share, the skin's hex.
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.equal(surge.match(/grown\.cells\.draw\(/g).length, 2);
  assert.match(surge, /grown\.lib\.SKIN_ENTRY,\s*t,\s*now,\s*layers\.scale,\s*grown\.renderer\.hex,\s*cellBounds\(layers\),\s*grown\.lib\.SKIN_CELL_SHARE\[level\],/);
  assert.match(surge, /leaving \? null : grown\.lib\.SKIN_SCROLL,\s*leaving \? leave\.ms : q,\s*now,\s*surfaces\.scale,\s*grown\.renderer\.hex,\s*cellBounds\(surfaces\),/);
  assert.match(surge, /if \(t >= grown\.lib\.SKIN_ENTRY\.light\) grown\.cells\.clear\(\);/);
  assert.match(surge, /if \(!leaving && q >= grown\.lib\.SKIN_SCROLL\.light\) grown\.cells\.clear\(\);/);
  assert.match(surge, /new lib\.SkinCells\(\s*budget\.large,\s*budget\.fine,\s*lib\.buildSkinCellSheet\(/);
  assert.doesNotMatch(surge, /torrent|Torrent/);
  assert.equal(SKIN_ENTRY.light, REXONANCE_SUIT_LIGHT.from);
  assert.equal(SKIN_SCROLL.light, ASSEMBLY_BEATS.light[0]);
});

test("the retract sheds the cells: each forms on the receding lip, lifts off and dissolves outward, gone by its end", () => {
  const phone = skinBudget(cellDevice(true, 390, 844));
  const field = skinSamples(cellRgba, W, H, phone.samples);
  const cells = new SkinCells(phone.large, phone.fine, SHEET, CELL, FIGURE);
  // The closed forms are the retract's own fronts.
  const frame = createSkinFrame();
  for (const value of [0.05, 0.3, 0.6, 0.9]) {
    for (const head of [false, true]) {
      const at = skinRetractReach(value, head);
      skinRetractFrame(frame, at);
      assert.ok(Math.abs((head ? frame.head : frame.body) - value) < 0.004, `${head ? "head" : "body"} ${value}`);
    }
  }
  let shed = 0;
  let fromHead = 0;
  let bodyFirst = Infinity;
  for (let i = 0; i < cells.count; i += 2) {
    for (const flight of flightsOf(cells, field, null, i, false, 0, SKIN_RETRACT_MS + 100, 4)) {
      const forming = flight.filter((pose) => pose.k >= 0);
      const air = flight.filter((pose) => pose.k < 0);
      if (!forming.length || air.length < 3) continue;
      shed += 1;
      const source = forming[0].at;
      const at = cellAt(source[0], source[1]);
      const value = bake.field[at];
      assert.ok(value >= 0, "shed from the armour");
      const head = bake.texture[at * 3 + 2] === 255;
      if (head) fromHead += 1;
      else bodyFirst = Math.min(bodyFirst, forming[0].x);
      // Where the lip is: it forms as the lip passes back over it.
      const lip = skinRetractReach(value, head);
      assert.ok(Math.abs(lip - forming[0].x) < 260, `formed at ${forming[0].x}, the lip there at ${lip}`);
      // It forms out of the grid (the absorption reversed)…
      assert.ok(forming[0].k > forming.at(-1).k);
      // …then only ever outward, fast off the surface and slowing, dissolving.
      let far = -1;
      for (const pose of air) {
        const d = Math.hypot(pose.at[0] - source[0], pose.at[1] - source[1]);
        assert.ok(d >= far - 1e-3);
        far = d;
      }
      assert.ok(far > 12, "it leaves the surface");
      assert.ok(air.at(-1).alpha < 0.12, "dissolved");
      assert.ok(flight.at(-1).x < SKIN_RETRACT_MS, "gone by the retract's end");
    }
  }
  assert.ok(shed > 80, `shed: ${shed}`);
  assert.ok(fromHead > 5, "the helmet sheds too");
  // The face and the helmet first, the body after (the retract's own order).
  assert.ok(bodyFirst > SKIN_RETRACT.body[0]);
  // No wave on the way out, and sprites only.
  const pose = new Float32Array(SKIN_CELL_POSE);
  for (let i = 0; i < cells.count; i += 1)
    assert.equal(cells.poseAt(pose, i, true, field, null, 1200, 0, PHONE_SCALE), false);
  for (let ms = 0; ms <= SKIN_RETRACT_MS; ms += 40) {
    const [back, front] = [spriteContext(), spriteContext()];
    cells.draw(back, front, field, null, ms, 9000 + ms, PHONE_SCALE, HEX);
    if (ms > 1150 && ms < 1500) assert.ok(cells.live > 20, `shedding at ${ms}: ${cells.live}`);
  }
  assert.equal(SKIN_RETRACT_MS, 1600);
  assert.ok(SKIN_RETRACT_CELLS.large[1] < 900);
});

test("the crescendo draws no streams and no spokes: its charge is rings and bloom, the matter is the cells", () => {
  const crescendo = read("src/lib/rexonance-suit-crescendo.ts");
  assert.doesNotMatch(crescendo, /drawStreams|CRESCENDO_LIMBS|streams:|converge:/);
  const charge = crescendo.slice(crescendo.indexOf("  private drawCharge("), crescendo.indexOf("  /** The reactor's and the driver's bloom. */"));
  assert.ok(charge.length > 200);
  assert.doesNotMatch(charge, /moveTo|lineTo/);
  assert.match(charge, /back\.arc\(cx, cy, r, 0, Math\.PI \* 2\);/);
  // Nor rays at the completion (owner, 2026-11-11: no line effects): motes
  // of light, sprites thrown out from the reactor.
  const completion = crescendo.slice(crescendo.indexOf("  private drawFinale("), crescendo.indexOf("  dispose() {"));
  assert.ok(completion.length > 2000);
  assert.doesNotMatch(completion, /moveTo|lineTo/);
  assert.match(completion, /back\.drawImage\(this\.sprites\[0\], x - r, y - r, r \* 2, r \* 2\);/);
});

test("no beat stands still: the helmet rises as the limbs' armour sets, and the last wave gathers as it closes", () => {
  const body = [];
  const head = [];
  for (let i = 0; i < W * H; i += 1)
    if (bake.field[i] >= 0) (bake.texture[i * 3 + 2] === 255 ? head : body).push(bake.field[i]);
  body.sort((a, b) => a - b);
  head.sort((a, b) => a - b);
  const flush = (SKIN_BANDS + 0.4) * SKIN_BAND;
  for (const [name, timeline] of [
    ["entry", SKIN_ENTRY],
    ["scroll", SKIN_SCROLL],
  ]) {
    const run = timeline.head[1] - timeline.body[0];
    // Nine tenths of the body's armour is finished (the bands have passed)…
    const set = skinReach(timeline, body[Math.floor(body.length * 0.9)] + flush);
    // … and the helmet is already on its way, or all but (before: 345 ms of
    // the call and 14% of the scroll with a finished, headless figure).
    assert.ok(timeline.head[0] - set < run * 0.1, `${name}: the helmet starts ${timeline.head[0] - set} after`);
    // The helmet's own armour is set, and the wave's specks are in the air.
    const closed = skinReach(timeline, Math.min(1, head[Math.floor(head.length * 0.75)]) + flush * 0.5, true);
    const gathers = timeline.cells.wave[0] - (timeline.cells.fine[0] + timeline.cells.fine[1]) * 0.62;
    assert.ok(gathers - closed < run * 0.06, `${name}: the wave gathers ${gathers - closed} after`);
  }
  // The call's reactor: its light forms from the skin's own cells, hexagons,
  // which under the skin drift a little way out instead of bursting.
  const call = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
  assert.match(call, /groups\[found % groups\.length\]\[tone\] \+= hexagon\(x, y, size\);/);
  const css = read("src/styles-rexonance-calls.css");
  assert.match(css, /\.rx-suit\[data-skin\] \.rx-suit-reactor-pixels \{\s*--rx-suit-out: calc\(1\.35 \/ var\(--rx-suit-burst\)\);/);
  assert.match(css, /transform: rotate\(var\(--rx-suit-r\)\) scale\(var\(--rx-suit-out, 1\)\);/);
});
