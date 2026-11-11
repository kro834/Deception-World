// Rexonance's skin (owner, 2026-11-11): the armour grown from the reactor as
// one continuous front of liquid nanite metal (src/lib/rexonance-suit-skin.ts)
// over a field baked from the art (rexonance-suit-skin-field.ts,
// scripts/build-rexonance-skin.mjs) — the bake and its order (torso, limbs,
// hands and feet, the helmet last, the face closing), the two clocks (never
// stepped, scrubbable, the classic engines whole under it before it fades),
// the droplets at the front only, and the device budget.
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
  SKIN_RETRACT_PULL,
  SKIN_SAMPLE,
  SKIN_SCROLL,
  SKIN_TORRENT_ARC,
  SKIN_TORRENT_SHARE,
  SKIN_WHOLE,
  SkinTorrent,
  createSkinFrame,
  drawSkinDroplets,
  skinBudget,
  skinFrame,
  skinReach,
  skinRetractFrame,
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
    if (bodyGone < 0 && frame.body <= 0) bodyGone = ms;
    if (ms > SKIN_RETRACT.body[0] && ms <= SKIN_RETRACT.body[1]) steps.push(previous.body - frame.body);
    previous = frame;
  }
  // 1. The lights go out first: the eyes, then the emitters, before any of
  // the shell has left (its first texel goes once the front is under 1).
  assert.equal(at(SKIN_RETRACT.eyes[1]).eyes, 0);
  assert.ok(at(SKIN_RETRACT.eyes[1]).head > 1, "the eyes are dark before the visor opens");
  assert.ok(at(SKIN_RETRACT.eyes[1]).lights > 0.8, "the eyes before the emitters");
  assert.equal(at(SKIN_RETRACT.lights[1]).lights, 0);
  assert.ok(SKIN_RETRACT.lights[1] < SKIN_RETRACT.body[0] && SKIN_RETRACT.lights[1] < faceOpen);
  // 2–3. The face opens (by 0.3 s), then the helmet sinks (by 0.6 s) …
  assert.ok(faceOpen > 150 && faceOpen <= 300, `the face is open at ${faceOpen}`);
  assert.ok(helmetGone > faceOpen && helmetGone <= 600, `the helmet is down at ${helmetGone}`);
  // 4. … before the limbs start for the chest, ever faster.
  assert.ok(bodyMoves > SKIN_RETRACT.body[0] && bodyMoves <= SKIN_RETRACT.body[0] + 8);
  assert.ok(helmetGone <= bodyMoves + 220);
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
      rect: (x, y) => drawn.push([x, y]),
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

test("the torrent: streams from the reactor and the driver land just ahead of the front, converge on the charge, and run home on a retract", () => {
  const device = (coarse, width, height, cores = 8) => ({
    matchMedia: (query) => ({ matches: query.includes("coarse") ? coarse : false }),
    navigator: { hardwareConcurrency: cores },
    innerWidth: width,
    innerHeight: height,
  });
  const desktop = skinBudget(device(false, 1440, 900));
  const tablet = skinBudget(device(true, 820, 1180));
  const phone = skinBudget(device(true, 390, 844));
  const low = skinBudget(device(true, 390, 844, 4));
  // Budgeted per device; the weakest still reads as a torrent, and the
  // governor sheds it by shares, never to nothing.
  assert.ok(desktop.torrent > tablet.torrent && tablet.torrent > phone.torrent);
  assert.ok(phone.torrent > low.torrent && low.torrent >= 100 && desktop.torrent <= 480);
  assert.equal(SKIN_TORRENT_SHARE[0], 1);
  assert.deepEqual([...SKIN_TORRENT_SHARE].sort((a, b) => b - a), [...SKIN_TORRENT_SHARE]);
  assert.ok(SKIN_TORRENT_SHARE.at(-1) >= 0.4);
  assert.equal(SKIN_TORRENT_SHARE.length, SKIN_QUALITY.length);
  // Reduced motion has no skin, so no torrent.
  assert.equal(
    skinBudget({ matchMedia: (query) => ({ matches: query.includes("reduced-motion") }) }),
    null,
  );

  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1)
    rgba.set([bake.texture[i * 3], bake.texture[i * 3 + 1], bake.texture[i * 3 + 2], 255], i * 4);
  const field = skinSamples(rgba, W, H, phone.samples);
  const core = REXONANCE_SUIT_MARKS.core;
  const belt = REXONANCE_SUIT_MARKS.belt;
  const context = () => {
    const calls = { paths: 0, strokes: 0, fills: 0, rects: 0 };
    return {
      calls,
      beginPath() {
        calls.paths += 1;
      },
      moveTo() {},
      lineTo() {},
      rect() {
        calls.rects += 1;
      },
      stroke() {
        calls.strokes += 1;
      },
      fill() {
        calls.fills += 1;
      },
    };
  };
  const cell = REXONANCE_SUIT_SIZE.width / W;
  const fieldAt = (x, y) =>
    bake.field[
      Math.min(H - 1, Math.max(0, Math.floor(y / cell))) * W +
        Math.min(W - 1, Math.max(0, Math.floor(x / cell)))
    ];
  const near = (x, y, [px, py], reach) => Math.hypot(x - px, y - py) <= reach;
  const flights = (torrent) => {
    const list = [];
    for (let i = 0; i < torrent.count; i += 1)
      if (torrent.born[i] >= 0) list.push([...torrent.streams.subarray(i * 10, i * 10 + 10)]);
    return list;
  };

  // Nothing flies before the front leaves the reactor, or over a whole suit.
  {
    const torrent = new SkinTorrent(phone.torrent, core, belt);
    const [back, front] = [context(), context()];
    torrent.draw(back, front, field, skinFrame(createSkinFrame(), SKIN_ENTRY, 100), cell, 1000, 1);
    assert.equal(torrent.live, 0);
    torrent.draw(back, front, field, skinFrame(createSkinFrame(), SKIN_ENTRY, 1960), cell, 1016, 1);
    assert.equal(torrent.live, 0);
    assert.equal(front.calls.strokes + back.calls.strokes + front.calls.fills, 0);
  }
  // Growing: every stream is in flight, from the reactor's disc or along the
  // driver, to a cell of the armour at or just ahead of the lip.
  {
    const torrent = new SkinTorrent(phone.torrent, core, belt);
    const [back, front] = [context(), context()];
    const frame = skinFrame(createSkinFrame(), SKIN_ENTRY, 800);
    assert.ok(frame.body > 0.3 && frame.body < 0.9 && frame.head === 0);
    torrent.draw(back, front, field, frame, cell, 5000, 1);
    assert.equal(torrent.live, phone.torrent);
    let fromBelt = 0;
    for (const [sx, sy, tx, ty, life] of flights(torrent)) {
      const driver = near(sx, sy, belt, 50);
      assert.ok(driver || near(sx, sy, core, 28), "born at the reactor or the driver");
      if (driver && !near(sx, sy, core, 28)) fromBelt += 1;
      const at = fieldAt(tx, ty);
      assert.ok(at >= 0, "it lands on the armour");
      assert.ok(
        at > frame.body - 2 * SKIN_BAND && at < frame.body + 5 * SKIN_BAND,
        `at the front (${at} for ${frame.body})`,
      );
      assert.ok(life > 300 && life < 1100, "fast");
    }
    assert.ok(fromBelt > phone.torrent * 0.12 && fromBelt < phone.torrent * 0.5);
    // A few batched paths a frame: glow and core per tone and layer, the heads.
    assert.ok(front.calls.strokes + back.calls.strokes <= 18);
    assert.ok(front.calls.fills + back.calls.fills <= 2);
    assert.equal(front.calls.rects + back.calls.rects, phone.torrent, "a bright head each");
    assert.ok(back.calls.strokes > 0, "some of the great arcs pass behind the figure");
    assert.ok(Math.round(phone.torrent / SKIN_TORRENT_ARC) >= 12, "a few large arcs");
    // The governor's share.
    const shed = new SkinTorrent(phone.torrent, core, belt);
    shed.draw(context(), context(), field, frame, cell, 5000, 1, SKIN_TORRENT_SHARE.at(-1));
    assert.equal(shed.live, Math.floor(phone.torrent * SKIN_TORRENT_SHARE.at(-1)));
    // A stream that has landed flies again, to the front as it then stands.
    const later = skinFrame(createSkinFrame(), SKIN_ENTRY, 1100);
    torrent.draw(back, front, field, later, cell, 5000 + 2000, 1);
    for (const [, , tx, ty] of flights(torrent)) {
      const at = fieldAt(tx, ty);
      assert.ok(at > later.body - 2 * SKIN_BAND, "the new flight follows the front");
    }
  }
  // The charge: called back into the reactor (and the driver) from all round.
  {
    const torrent = new SkinTorrent(phone.torrent, core, belt);
    torrent.draw(context(), context(), field, skinFrame(createSkinFrame(), SKIN_ENTRY, 1900), cell, 9000, 1, 1, 0.8);
    assert.equal(torrent.live, phone.torrent);
    let far = 0;
    for (const [sx, sy, tx, ty, life] of flights(torrent)) {
      assert.ok(near(tx, ty, core, 1) || near(tx, ty, belt, 1), "into the reactor or the driver");
      if (!near(sx, sy, core, 180)) far += 1;
      assert.ok(life < 700);
    }
    assert.ok(far > phone.torrent * 0.9);
  }
  // The retract: from the receding lip, home.
  {
    const torrent = new SkinTorrent(phone.torrent, core, belt);
    const frame = skinRetractFrame(createSkinFrame(), 1250);
    assert.ok(frame.body > 0.3 && frame.body < 1);
    torrent.draw(context(), context(), field, frame, cell, 9000, 1);
    assert.ok(torrent.live > 0);
    for (const [sx, sy, tx, ty] of flights(torrent)) {
      assert.deepEqual([tx, ty], [...new Float32Array(core)]);
      const at = fieldAt(sx, sy);
      assert.ok(at < frame.body + 2 * SKIN_BAND, "from the armour still on");
    }
  }
  // Nothing of it outlives the light (no burn after the flash): the streams
  // in flight are dropped at the scene's light on both clocks.
  assert.equal(SKIN_ENTRY.light, REXONANCE_SUIT_LIGHT.from);
  assert.equal(SKIN_SCROLL.light, ASSEMBLY_BEATS.light[0]);
  {
    const torrent = new SkinTorrent(phone.torrent, core, belt);
    torrent.draw(context(), context(), field, skinFrame(createSkinFrame(), SKIN_ENTRY, 1950), cell, 9000, 1, 1, 1);
    assert.ok(torrent.live > 0);
    torrent.clear();
    const [back, front] = [context(), context()];
    torrent.draw(back, front, field, skinFrame(createSkinFrame(), SKIN_ENTRY, 1990), cell, 9016, 1, 1, 0);
    assert.equal(torrent.live, 0);
    assert.equal(back.calls.strokes + front.calls.strokes + back.calls.fills + front.calls.fills, 0);
  }
  const wired = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(wired, /if \(t >= grown\.lib\.SKIN_ENTRY\.light\) grown\.torrent\.clear\(\);/);
  assert.match(wired, /if \(!leaving && q >= grown\.lib\.SKIN_SCROLL\.light\) grown\.torrent\.clear\(\);/);
  // Wired on both clocks, on the surge layer's own two canvases, with the
  // governor's share and the crescendo's charge; no transform anywhere.
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.equal(surge.match(/grown\.torrent\.draw\(/g).length, 2);
  assert.match(surge, /grown\.lib\.SKIN_TORRENT_SHARE\[level\],\s*made \? made\.lib\.entryCharge\(t, final\) : 0,/);
  assert.match(surge, /leaving \? 0 : \(pass\?\.charge \?\? 0\),/);
  assert.match(surge, /new lib\.SkinTorrent\(\s*budget\.torrent,\s*REXONANCE_SUIT_MARKS\.core,\s*REXONANCE_SUIT_MARKS\.belt,\s*\)/);
  const lib = read("src/lib/rexonance-suit-skin.ts");
  const drawn = lib.slice(lib.indexOf("export class SkinTorrent"), lib.indexOf("/* ---------------- the shader"));
  assert.doesNotMatch(drawn, /createLinearGradient|createRadialGradient|shadowBlur|drawImage/);
  // Nothing is allocated a frame: the typed arrays are the constructor's.
  const perFrame = drawn.slice(drawn.indexOf("  draw("));
  assert.doesNotMatch(perFrame, /new (Float32Array|Float64Array|Array)|\[\.\.\.|\.map\(|\.filter\(/);
});
