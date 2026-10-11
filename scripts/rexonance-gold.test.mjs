// rx17 (owner, 2026-10-11): "the gold parts are formed by nanomachines right
// after each part is fitted" — the plates seat with their trims unformed and
// gold nanites form the gold right after; and the call's assets, chunk and
// engine plan are prepared ahead of the tap.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_SUIT_ACCENTS,
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_GOLD,
  REXONANCE_SUIT_GOLD_AT,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_PIXELS,
} from "../src/lib/rexonance-calls.ts";
import {
  REXONANCE_SUIT_ASSETS,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_TILE,
} from "../src/lib/rexonance-suit.ts";
import {
  REXONANCE_SUIT_GOLD_CELL,
  REXONANCE_SUIT_GOLD_CELLS,
} from "../src/lib/rexonance-suit-gold.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nanites = read("src/components/rexonance-saga/rexonance-suit-nanites.tsx");
const plan = read("src/components/rexonance-saga/rexonance-suit-plan.ts");
const component = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
const warmup = read("src/lib/rexonance-suit-warmup.ts");
const gate = read("src/components/load-gate.tsx");
const groupOf = Object.fromEntries(
  REXONANCE_SUIT_CASCADE.flatMap(({ group, order }) => order.map((id) => [id, group])),
);

test("rx17: each plate's gold forms right after it seats, quickly, and is done in time", () => {
  assert.deepEqual(
    Object.keys(REXONANCE_SUIT_GOLD_AT).sort(),
    REXONANCE_SUIT_PIECES.map(({ id }) => id).sort(),
  );
  for (const { id } of REXONANCE_SUIT_PIECES) {
    // Owner (2026-10-11): the driver is finished from the start; no gold forms.
    if (REXONANCE_SUIT_DRIVER.includes(id)) continue;
    const [from, to] = REXONANCE_SUIT_GOLD_AT[id];
    const fit = REXONANCE_SUIT_FIT[id];
    // It starts within 0-40 ms of the plate's clank.
    assert.ok(from - fit >= 0 && from - fit <= 40, `${id}: starts ${from - fit} ms after its fit`);
    const span = to - from;
    if (groupOf[id] === "helm") {
      // The helmet's gold is complete before the face's pixel squares fill.
      assert.ok(span >= 60, `${id}: ${span} ms`);
      assert.ok(to <= REXONANCE_SUIT_PIXELS.fill, `${id}: done at ${to}`);
    } else {
      // About 150-300 ms a plate, so the cascade keeps its rhythm.
      assert.ok(span >= 150 && span <= 300, `${id}: ${span} ms`);
      if (REXONANCE_SUIT_ACCENTS.includes(id)) assert.equal(span, REXONANCE_SUIT_GOLD.accent, id);
    }
    // The tail's and the ribbons' gold too.
    if (["tail", "ribbon"].includes(groupOf[id]))
      assert.ok(to <= REXONANCE_SUIT_PIXELS.fill, `${id}: done at ${to}`);
  }
  // Every glint and surge has run before the face's squares scatter, and
  // nothing reaches the cover's end.
  const settled = Math.max(
    ...Object.values(REXONANCE_SUIT_GOLD_AT).map(
      ([, to]) => to + Math.max(REXONANCE_SUIT_GOLD.cool, REXONANCE_SUIT_GOLD.glint),
    ),
    ...REXONANCE_SUIT_ACCENTS.map(
      (id) => REXONANCE_SUIT_GOLD_AT[id][0] + REXONANCE_SUIT_GOLD.surge,
    ),
  );
  assert.ok(settled <= REXONANCE_SUIT_PIXELS.scatter, String(settled));
  assert.ok(settled < REXONANCE_ENTRY_TIMINGS.cover);
  // The nanites' flight and cooling are short beats of the formation.
  assert.ok(REXONANCE_SUIT_GOLD.approach < REXONANCE_SUIT_GOLD.form / 2);
  assert.ok(REXONANCE_SUIT_GOLD.cool < REXONANCE_SUIT_GOLD.form / 2);
});

test("rx17: the gold atlas and the gold cells, generated with the plates", async () => {
  const path = fileURLToPath(new URL(`../public${REXONANCE_SUIT_GOLD_ATLAS.src}`, import.meta.url));
  assert.ok(existsSync(path));
  assert.equal(
    REXONANCE_SUIT_GOLD_ATLAS.src.replace(/[^/]+$/, ""),
    REXONANCE_SUIT_ATLAS.src.replace(/[^/]+$/, ""),
  );
  // Preloaded with the rest, right after the engine's atlas.
  assert.equal(REXONANCE_SUIT_ASSETS[1], REXONANCE_SUIT_GOLD_ATLAS.src);
  // Its own budget (the brief: at most 150 KB more for the call).
  assert.ok(statSync(path).size <= 150_000, String(statSync(path).size));
  let total = 0;
  for (const file of [...REXONANCE_SUIT_ASSETS, REXONANCE_SUIT_FIGURE])
    total += statSync(new URL(`../public${file}`, import.meta.url)).size;
  assert.ok(total < 640_000, String(total));
  // The size of the atlas's art half: each plate's raw gold at its art's place.
  const meta = await sharp(path).metadata();
  assert.deepEqual(
    [meta.width, meta.height, REXONANCE_SUIT_GOLD_ATLAS.width, REXONANCE_SUIT_GOLD_ATLAS.height],
    [
      REXONANCE_SUIT_ATLAS.width / 2,
      REXONANCE_SUIT_ATLAS.height,
      REXONANCE_SUIT_ATLAS.width / 2,
      REXONANCE_SUIT_ATLAS.height,
    ],
  );
  // Gold nanites much finer than the plates' micro-tiles.
  assert.ok(REXONANCE_SUIT_GOLD_CELL >= 3 && REXONANCE_SUIT_GOLD_CELL <= 4.5);
  assert.ok(REXONANCE_SUIT_GOLD_CELL <= REXONANCE_SUIT_TILE / 2);
  let cells = 0;
  for (const piece of REXONANCE_SUIT_PIECES) {
    const base64 = REXONANCE_SUIT_GOLD_CELLS[piece.id];
    assert.ok(base64, `${piece.id}: every plate carries gold`);
    const bytes = Buffer.from(base64, "base64");
    const count =
      Math.ceil(piece.w / REXONANCE_SUIT_GOLD_CELL) * Math.ceil(piece.h / REXONANCE_SUIT_GOLD_CELL);
    assert.equal(bytes.length, Math.ceil(count / 8), piece.id);
    for (const byte of bytes) for (let bit = 0; bit < 8; bit += 1) cells += (byte >> bit) & 1;
  }
  assert.ok(cells >= 5000, String(cells));
  // Generated, never hand-edited.
  assert.match(
    read("src/lib/rexonance-suit-gold.ts"),
    /^\/\/ Generated by scripts\/build-rexonance-suit\.mjs/,
  );
  assert.match(read("scripts/build-rexonance-suit.mjs"), /src\/lib\/rexonance-suit-gold\.ts/);
});

test("rx17: the gold mask holds the bronze trims, not the crystals; unformed, it is dark gunmetal", async () => {
  const file = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));
  const art = await sharp(file(REXONANCE_SUIT_ATLAS.src))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gold = await sharp(file(REXONANCE_SUIT_GOLD_ATLAS.src))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = art.info.width;
  const GW = gold.info.width;
  const hsv = (r, g, b) => {
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = h * 60 + (h < 0 ? 360 : 0);
    }
    return [h, max ? d / max : 0, max / 255];
  };
  let bronze = 0;
  let bronzeCovered = 0;
  let crystal = 0;
  let crystalCovered = 0;
  let under = 0;
  let underLight = 0;
  let underChroma = 0;
  for (const piece of REXONANCE_SUIT_PIECES) {
    for (let y = piece.ay; y < piece.ay + piece.h; y += 1) {
      for (let x = piece.ax; x < piece.ax + piece.w; x += 1) {
        const a = (y * W + x) * 4;
        if (art.data[a + 3] < 230) continue;
        const [h, s, v] = hsv(art.data[a], art.data[a + 1], art.data[a + 2]);
        const g = (y * GW + x) * 4;
        const covered = gold.data[g + 3] > 128;
        if (h >= 22 && h <= 48 && s > 0.45 && v > 0.45) {
          bronze += 1;
          if (covered) bronzeCovered += 1;
        } else if (h >= 180 && h <= 330 && s > 0.45 && v > 0.5) {
          crystal += 1;
          if (covered) crystalCovered += 1;
        }
        if (gold.data[g + 3] > 230) {
          const [r, gg, b] = [gold.data[g], gold.data[g + 1], gold.data[g + 2]];
          under += 1;
          underLight += (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
          underChroma += (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
        }
      }
    }
  }
  assert.ok(bronze > 10_000 && crystal > 10_000, `${bronze} bronze, ${crystal} crystal px`);
  assert.ok(bronzeCovered / bronze > 0.97, `bronze covered ${(bronzeCovered / bronze).toFixed(3)}`);
  assert.ok(
    crystalCovered / crystal < 0.02,
    `crystal covered ${(crystalCovered / crystal).toFixed(3)}`,
  );
  // Unformed metal: dark and nearly neutral (a cool gunmetal), never gold.
  assert.ok(underLight / under < 0.3, `raw light ${(underLight / under).toFixed(3)}`);
  assert.ok(underChroma / under < 0.12, `raw chroma ${(underChroma / under).toFixed(3)}`);
});

test("rx17: the engine forms each plate's gold on it right after it seats and ends on the art", () => {
  // It draws the warm-up's own decoded layers; it never decodes its own copy.
  assert.match(nanites, /rexonanceSuitSource\(REXONANCE_SUIT_ATLAS\.src\)/);
  assert.match(nanites, /rexonanceSuitSource\(REXONANCE_SUIT_GOLD_ATLAS\.src\)/);
  assert.doesNotMatch(nanites + plan, /new Image\(/);
  // Neither the engine nor its plan uses timers, randomness, filters or
  // composite operations (as rx13's engine).
  assert.doesNotMatch(
    plan,
    /setInterval|setTimeout|Math\.random|filter =|globalCompositeOperation/,
  );
  // A late start rides the warm-up already in flight.
  assert.match(nanites, /warmRexonanceSuit\("high"\)\.then\(\(decoded\) => decoded && start\(\)\)/);
  // The plates arrive and seat from the working atlas (their gold raw) ...
  assert.match(
    plan,
    /context\.drawImage\(LIGHTS\?\.unlit \?\? art, 0, 0, width, height, 0, 0, width, height\);\s*context\.drawImage\(gold, 0, 0\);/,
  );
  assert.match(nanites, /flight\.drawImage\(\s*source,\s*tile\.sx,\s*tile\.sy,/);
  // ... their gold cells lock into it on the gold's own clock ...
  assert.match(plan, /REXONANCE_SUIT_GOLD_AT\[piece\.id\]/);
  assert.match(nanites, /atlasWork\.drawImage\(\s*art,\s*gold\.ax\[i\],/);
  // ... and a finished plate is painted whole from the art itself, so the
  // finished suit equals the artwork.
  assert.match(
    nanites,
    /settled\.drawImage\(\s*art,\s*piece\.ax,\s*piece\.ay,\s*piece\.w,\s*piece\.h,/,
  );
  assert.match(
    nanites,
    /for \(let p = 0; p < all\.length; p \+= 1\) if \(!done\[p\]\) settle\(p\);/,
  );
  // The hot loop allocates nothing: its batches are typed arrays made once.
  const from = nanites.indexOf("const draw = (t: number) => {");
  const draw = nanites.slice(from, nanites.indexOf("const finish = () => {", from));
  assert.ok(draw.length > 1000);
  assert.doesNotMatch(
    draw,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(/,
  );
  // Only what is still forming is drawn: settled plates skip the frame.
  assert.match(draw, /if \(t < plate\.spawn \|\| \(done\[p\] && t >= plate\.last\)\) continue;/);
  // The plan and the working atlas are prepared in idle slices ahead of the call.
  assert.match(plan, /export function prepareRexonanceSuit\(\)/);
  assert.match(plan, /requestIdleCallback\(slice, \{ timeout: 600 \}\)/);
  assert.match(nanites, /from "\.\/rexonance-suit-plan";/);
});

test("rx17: the call's chunk, layers and plan are prepared ahead of the tap", () => {
  // The idle warm-up prefetches the call's own chunk and the layers (all at
  // low priority, as the owner's initial-load budget pins); once decoded,
  // the engine's plan is prepared.
  assert.match(
    warmup,
    /void prepareRexonanceTransition\.prefetch\(\);\s*void warmRexonanceSuit\(\);/,
  );
  assert.match(
    warmup,
    /import\("\.\.\/components\/rexonance-saga\/rexonance-suit-plan"\)\.then\(\s*\(plan\) => plan\.prepareRexonanceSuit\(\),/,
  );
  // On every route (the owner's [pathname] schedule; leaving /rexonance-saga warms it).
  assert.match(gate, /useEffect\(\(\) => scheduleRexonanceSuitWarm\(\), \[pathname\]\);/);
  // The engine runs only while the suit builds (a late switch mounts it).
  assert.match(
    component,
    /\{animate && suit === "build" \? <SuitNanites onReady=\{onNanites\} \/> : null\}/,
  );
});
