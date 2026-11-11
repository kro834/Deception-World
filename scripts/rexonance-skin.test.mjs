// Rexonance's skin (owner, 2026-11-11): the armour grown from the reactor as
// one continuous front of liquid nanite metal (src/lib/rexonance-suit-skin.ts)
// over a field baked from the art (rexonance-suit-skin-field.ts,
// scripts/build-rexonance-skin.mjs) — the bake and its order (torso, limbs,
// hands and feet, the helmet last, the face closing), the two clocks (never
// stepped, scrubbable, the classic engines whole under it before it fades),
// the droplets at the front only, and the device budget.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_SUIT_LIGHT,
  REXONANCE_SUIT_SNAP,
} from "../src/lib/rexonance-calls.ts";
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
  SKIN_SAMPLE,
  SKIN_SCROLL,
  SKIN_WHOLE,
  createSkinFrame,
  drawSkinDroplets,
  skinBudget,
  skinFrame,
  skinSamples,
} from "../src/lib/rexonance-suit-skin.ts";
import { SKIN_FIELD_FILE, bakeSkinField, skinFieldInput } from "./build-rexonance-skin.mjs";

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
        assert.equal(frame.on, false);
        assert.equal(frame.alpha, 0);
        assert.equal(frame.classic, 1);
      }
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
      drawSkinDroplets(context, field, { body, head, alpha: 1, classic: 0, on: true }, 3, 1000, 1);
      return drawn.length;
    };
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
  assert.match(surge, /engine\.quiet = Boolean\(growing\?\.on\);/);
  assert.match(surge, /engine\.quiet = skinOn;/);
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
