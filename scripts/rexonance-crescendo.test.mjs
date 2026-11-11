// Rexonance's crescendo (owner, 2026-11-11: 「レクソナンスのアニメーションを
// 大幅に、劇的に強化して」): the cinema pass over the surge's canvases
// (src/lib/rexonance-suit-crescendo.ts) — its device budget and governor,
// its choreography on the two clocks, its envelopes (nothing pops in,
// nothing is left on), the armour's lines from the art, and the rules it
// lives under (lazy, Rexonance only, full motion only, the body never moves).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  CRESCENDO_ENTRY_PACE,
  CRESCENDO_FINALE_MS,
  CRESCENDO_GROUP_MS,
  CRESCENDO_LEVELS,
  CRESCENDO_PLATE_MS,
  CRESCENDO_SCROLL_CHARGE,
  CRESCENDO_SCROLL_LIGHT,
  CRESCENDO_SLOW_MS,
  CrescendoGovernor,
  CrescendoScrollClock,
  createCrescendoFrame,
  crescendoBusy,
  crescendoLines,
  crescendoTier,
  entryCrescendoFrame,
  finale,
  quietCrescendo,
} from "../src/lib/rexonance-suit-crescendo.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const device = ({
  coarse = false,
  reduced = false,
  memory,
  cores,
  width = 1440,
  height = 900,
  ratio = 1,
  saveData,
} = {}) => ({
  matchMedia: (query) => ({
    matches: query.includes("reduced-motion") ? reduced : query.includes("coarse") ? coarse : false,
  }),
  navigator: { deviceMemory: memory, hardwareConcurrency: cores, connection: { saveData } },
  innerWidth: width,
  innerHeight: height,
  devicePixelRatio: ratio,
});

test("the budget scales by device, caps the pixel ratio, and reduced motion has none", () => {
  const desktop = crescendoTier(device({ ratio: 3 }));
  const tablet = crescendoTier(
    device({ coarse: true, width: 820, height: 1180, ratio: 2, cores: 8 }),
  );
  const phone = crescendoTier(
    device({ coarse: true, width: 390, height: 844, ratio: 3, cores: 6 }),
  );
  const low = crescendoTier(device({ coarse: true, width: 390, height: 844, ratio: 3, cores: 4 }));
  const saver = crescendoTier(
    device({ coarse: true, width: 390, height: 844, cores: 8, saveData: true }),
  );
  assert.deepEqual(
    [desktop.name, tablet.name, phone.name, low.name, saver.name],
    ["desktop", "tablet", "phone", "low", "low"],
  );
  for (const key of ["rays"]) {
    assert.ok(desktop[key] > tablet[key], `${key}: desktop over tablet`);
    assert.ok(tablet[key] > phone[key], `${key}: tablet over phone`);
    assert.ok(phone[key] > low[key], `${key}: phone over low`);
  }
  assert.equal(desktop.dpr, 1.5, "a 3x desktop draws at 1.5x");
  assert.equal(crescendoTier(device({ ratio: 1 })).dpr, 1);
  for (const touch of [tablet, phone, low]) assert.equal(touch.dpr, 1, "touch screens draw at 1x");
  assert.equal(low.edge, 0, "constrained phones take no edge maps");
  assert.ok(low.level >= 2, "and start with the lighter pass");
  assert.equal(crescendoTier(device({ reduced: true })), null);
  assert.equal(crescendoTier(device({ coarse: true, reduced: true })), null);
});

test("the governor sheds a level at a time on long frames and returns only after a clean run", () => {
  const governor = new CrescendoGovernor(0);
  for (let i = 0; i < 400; i += 1) governor.sample(16.7);
  assert.equal(governor.level, 0, "smooth frames change nothing");
  for (let i = 0; i < 4; i += 1) governor.sample(CRESCENDO_SLOW_MS + 4);
  assert.equal(governor.level, 0, "a brief hitch is not a trend");
  for (let i = 0; i < 8; i += 1) governor.sample(CRESCENDO_SLOW_MS + 4);
  assert.equal(governor.level, 1);
  for (let i = 0; i < 200; i += 1) governor.sample(70);
  assert.equal(governor.level, CRESCENDO_LEVELS.length - 1, "it never passes the last level");
  for (let i = 0; i < 100; i += 1) governor.sample(16.7);
  assert.equal(governor.level, CRESCENDO_LEVELS.length - 1, "no recovery on a short clean run");
  for (let i = 0; i < 2000; i += 1) governor.sample(16.7);
  assert.equal(governor.level, 0, "a long clean run gives the work back");
  // Paced frames (the scene's 30 fps rest cadence) and gaps are not samples.
  const paced = new CrescendoGovernor(0);
  for (let i = 0; i < 200; i += 1) paced.sample(33.4, true);
  for (let i = 0; i < 200; i += 1) paced.sample(900);
  for (let i = 0; i < 200; i += 1) paced.sample(0);
  assert.equal(paced.level, 0);
  // A constrained device's floor holds.
  const low = new CrescendoGovernor(2);
  for (let i = 0; i < 5000; i += 1) low.sample(16.7);
  assert.equal(low.level, 2);
});

test("each level keeps no more than the one before it", () => {
  for (let level = 1; level < CRESCENDO_LEVELS.length; level += 1) {
    const now = CRESCENDO_LEVELS[level];
    const before = CRESCENDO_LEVELS[level - 1];
    assert.ok(now.rays <= before.rays);
    for (const key of ["edges", "echo", "rim"]) assert.ok(!now[key] || before[key], key);
  }
  const last = CRESCENDO_LEVELS.at(-1);
  assert.deepEqual([last.edges, last.echo, last.rim], [false, false, false]);
});

test("the completion's envelopes start from nothing, stay continuous and end at nothing", () => {
  const sample = {
    shock: (a) => finale.shockLight(a, 620),
    echo: finale.echoLight,
    wave: finale.waveLight,
    lines: finale.linesGlow,
    rim: finale.rim,
    glint: finale.glint,
    settle: finale.settle,
  };
  for (const [name, envelope] of Object.entries(sample)) {
    assert.equal(envelope(-1), 0, `${name}: nothing before completion`);
    assert.ok(envelope(0) < 0.02, `${name}: no pop at completion`);
    assert.ok(envelope(CRESCENDO_FINALE_MS) < 1e-6, `${name}: nothing left at the end`);
    let peak = 0;
    for (let a = 0; a <= CRESCENDO_FINALE_MS; a += 4) {
      const value = envelope(a);
      assert.ok(value >= 0 && value <= 1.0001, `${name} in range at ${a}`);
      assert.ok(Math.abs(value - envelope(a + 4)) < 0.2, `${name}: no step at ${a} ms`);
      peak = Math.max(peak, value);
    }
    assert.ok(peak > 0.5, `${name} is seen`);
  }
  // The flash is the one cut: it is the charge's bloom carried over, and it
  // decays to nothing.
  assert.equal(finale.flash(0), 1);
  assert.equal(finale.flash(300), 0);
  // The glint follows the shock, the settle outlasts them both.
  const peakAt = (envelope) => {
    let best = 0;
    for (let a = 0; a <= CRESCENDO_FINALE_MS; a += 4) if (envelope(a) > envelope(best)) best = a;
    return best;
  };
  assert.ok(peakAt(sample.shock) < peakAt(finale.glint));
  assert.ok(finale.rim(900) > 0.3 && finale.shockLight(900, 620) === 0);
  // The punch is the lines' echo, a few percent, and returns to the armour.
  assert.equal(finale.echoScale(0), 1);
  assert.ok(finale.echoScale(460) > 1.05 && finale.echoScale(460) < 1.12);
  // The shock shells only ever grow.
  for (let a = 0; a < 960; a += 8)
    assert.ok(finale.shockReach(a + 8, 960) >= finale.shockReach(a, 960));
});

test("the entry plays the charge, each plate's flash and the completion on the call's clock", () => {
  const fits = Float32Array.of(900, 1200, 0);
  const windows = Float32Array.of(800, 900, 1000, 1200);
  const frame = createCrescendoFrame(2, 3);
  const at = (t) => entryCrescendoFrame(frame, t, 5000 + t, fits, windows, 1980);
  assert.equal(at(850).plates[0], -1);
  assert.equal(at(900).plates[0], 0);
  assert.equal(at(1000).plates[0], 100);
  assert.equal(at(900 + CRESCENDO_PLATE_MS).plates[0], -1);
  assert.equal(at(1500).plates[2], -1, "a plate with no fit (the driver's) never flashes");
  assert.equal(at(1000).groups[0], 100);
  assert.equal(at(900 + CRESCENDO_GROUP_MS).groups[0], -1);
  // The charge rises into the light and never falls before it.
  let last = 0;
  for (let t = 1500; t < 1980; t += 5) {
    const charge = at(t).charge;
    assert.ok(charge >= last - 1e-9, `charge at ${t}`);
    assert.equal(frame.finale, -1);
    last = charge;
  }
  assert.ok(last > 0.99, "fully charged at the light");
  assert.equal(at(1500).charge, 0);
  assert.equal(at(1980).finale, 0);
  assert.equal(at(2080).finale, 100 * CRESCENDO_ENTRY_PACE);
  // The cover closes 750 ms after the light: by then the impact is spent.
  assert.ok(750 * CRESCENDO_ENTRY_PACE > 960, "the shock shells are done under the cover");
  // No streams, no spokes: the frame carries none (the matter is the skin's cells).
  assert.ok(!("flow" in frame) && !("gather" in frame));
});

test("the scroll strikes forward only, re-arms backward, ignores seeks, and stays scrubbable", () => {
  const windows = Float32Array.of(0.2, 0.3, 0.4, 0.5);
  const pieces = Float32Array.of(0.2, 0.25, 0.42, 0.5);
  const clock = new CrescendoScrollClock(windows, pieces);
  const frame = createCrescendoFrame(2, 2);
  let now = 1000;
  const to = (q, ms = 16) => clock.frame(frame, q, (now += ms));
  to(0.1);
  to(0.24);
  assert.equal(frame.plates[0], -1);
  to(0.26);
  assert.equal(frame.plates[0], 0, "the plate strikes as its window's end is passed");
  to(0.27, 100);
  assert.equal(frame.plates[0], 100, "and plays on wall time");
  assert.ok(crescendoBusy(frame));
  to(0.27, CRESCENDO_PLATE_MS);
  assert.equal(frame.plates[0], -1);
  to(0.31);
  assert.equal(frame.groups[0], 0);
  // Back over it: re-armed; forward again: it strikes again.
  to(0.2, 2000);
  assert.equal(frame.groups[0], -1);
  assert.equal(frame.plates[0], -1);
  to(0.26);
  assert.equal(frame.plates[0], 0);
  // The charge is the scroll's own (scrubbable), the completion strikes.
  to(CRESCENDO_SCROLL_CHARGE[0] - 0.01, 3000);
  assert.equal(frame.charge, 0);
  const mid = (CRESCENDO_SCROLL_CHARGE[0] + CRESCENDO_SCROLL_CHARGE[1]) / 2;
  assert.ok(to(mid).charge > 0.3 && frame.charge < 0.7);
  assert.ok(crescendoBusy(frame), "the charge keeps drawing while the reader rests in it");
  assert.equal(frame.finale, -1);
  to(CRESCENDO_SCROLL_LIGHT + 0.001);
  assert.equal(frame.finale, 0);
  assert.equal(frame.charge, 0, "the charge is spent in the light");
  to(0.95, 500);
  assert.equal(frame.finale, 500);
  to(0.95, CRESCENDO_FINALE_MS);
  assert.equal(frame.finale, -1);
  assert.ok(!crescendoBusy(frame), "at rest on the finished suit nothing is drawn");
  // Back before the light and forward again: the completion plays again.
  to(0.8, 100);
  to(CRESCENDO_SCROLL_LIGHT + 0.01, 100);
  assert.equal(frame.finale, 0);
  // A seek (the movie's scrubber, an anchor jump) strikes nothing.
  clock.reset();
  to(0.05, 5000);
  to(0.97, 16);
  assert.equal(frame.finale, -1);
  assert.deepEqual([...frame.plates], [-1, -1]);
  assert.ok(!crescendoBusy(frame));
});

test("while the skin grows the armour only the charge and the completion remain", () => {
  const frame = createCrescendoFrame(2, 2);
  frame.groups[0] = 10;
  frame.plates[1] = 10;
  frame.charge = 0.4;
  frame.finale = 12;
  quietCrescendo(frame);
  assert.deepEqual([[...frame.groups], [...frame.plates]], [[-1, -1], [-1, -1]]);
  assert.deepEqual([frame.charge, frame.finale], [0.4, 12]);
});

test("the armour's lines come from the art: edges where it changes, a two-tone rim on the silhouette", () => {
  const w = 48;
  const h = 48;
  const rgba = new Uint8ClampedArray(w * h * 4);
  // An opaque grey square with a bright bar across it.
  for (let y = 10; y < 38; y += 1)
    for (let x = 10; x < 38; x += 1) {
      const v = y >= 22 && y < 26 ? 240 : 60;
      rgba.set([v, v, v, 255], (y * w + x) * 4);
    }
  const { edge, rim } = crescendoLines(rgba, w, h);
  const alpha = (data, x, y) => data[(y * w + x) * 4 + 3];
  assert.ok(alpha(edge, 20, 22) > 100, "the bar's edge is a line");
  assert.ok(alpha(edge, 10, 16) > 60, "so is the silhouette");
  assert.equal(alpha(edge, 20, 15), 0, "flat armour has none");
  assert.equal(alpha(edge, 4, 4), 0, "nor has the air");
  // Key light (ice) on the upper left, fill (pink) on the right.
  const left = (10 * w + 10) * 4;
  const right = (30 * w + 37) * 4;
  assert.ok(rim[left + 3] > 150 && rim[right + 3] > 150);
  assert.ok(rim[left + 2] > rim[left], "the key side is ice");
  assert.ok(rim[right] > rim[right + 1], "the fill side is pink");
  assert.equal(alpha(rim, 24, 30), 0, "the interior carries no rim");
  assert.equal(alpha(rim, 4, 4), 0);
});

test("the new suit-up code is fetched on demand, only by Rexonance's surge layer", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  const modules = ["rexonance-suit-crescendo", "rexonance-suit-skin"];
  for (const name of modules) {
    assert.match(surge, new RegExp(`import\\("@/lib/${name}"\\)`), `${name} is imported lazily`);
    for (const line of surge.split("\n"))
      if (new RegExp(`from "@/lib/${name}"`).test(line))
        assert.match(line, /^import type |^\} from/, `${name}: types only at the top`);
    assert.doesNotMatch(
      surge,
      new RegExp(`^import \\{[^}]*\\} from "@/lib/${name}"`, "m"),
      `${name}: no static value import`,
    );
  }
  // Multi-line static imports of the two modules are type imports.
  for (const block of surge.matchAll(
    /^import ([^;]*?) from "@\/lib\/rexonance-suit-(?:crescendo|skin)";/gms,
  ))
    assert.match(block[1], /^type /, "static imports of the new modules are types");
  // The bake never ships: only the build script and the tests import it.
  const walk = (dir) =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );
  for (const path of walk("src").filter((file) => /\.(tsx?|jsx?|css)$/.test(file))) {
    const text = read(path);
    if (!/rexonance-suit-(crescendo|skin)|rexonance-skin-20261111/.test(text)) continue;
    assert.ok(
      [
        "src/components/rexonance-saga/rexonance-suit-surge.tsx",
        "src/components/rexonance-saga/rexonance-suit-nanites.tsx",
        // The skin's marks (numbers only: when its front reaches each HUD
        // part) and the two that read them, the call and the page.
        "src/components/rexonance-saga/rexonance-call-sequence.tsx",
        "src/components/rexonance-saga/rexonance-saga.tsx",
        "src/lib/rexonance-suit-skin-marks.ts",
        "src/lib/rexonance-suit-crescendo.ts",
        "src/lib/rexonance-suit-skin.ts",
        "src/lib/rexonance-suit-skin-field.ts",
        "src/lib/rexonance-suit-surge.ts",
        "src/styles-rexonance-calls.css",
      ].includes(path),
      `${path} must not reach the new suit-up modules`,
    );
    assert.doesNotMatch(
      text,
      /(from\s+|import\()["'][^"']*rexonance-suit-skin-field/,
      `${path}: the bake never ships`,
    );
  }
  // The call and the page reach the marks only, never the skin's chunk.
  for (const path of [
    "src/components/rexonance-saga/rexonance-call-sequence.tsx",
    "src/components/rexonance-saga/rexonance-saga.tsx",
  ])
    assert.doesNotMatch(read(path), /rexonance-suit-(crescendo|skin)(?!-marks)/, path);
  assert.doesNotMatch(read("src/lib/rexonance-suit-skin-marks.ts"), /^\s*import\s|\bimport\(/m);
  // No route preloads the field picture or the chunks.
  for (const path of walk("src/routes"))
    assert.doesNotMatch(read(path), /rexonance-skin-|suit-crescendo|suit-skin/);
  assert.doesNotMatch(
    read("src/components/load-gate.tsx"),
    /rexonance-skin-|suit-crescendo|suit-skin/,
  );
  // The modules themselves import nothing (each is its own chunk).
  for (const name of [...modules, "rexonance-suit-skin-field"])
    assert.doesNotMatch(
      read(`src/lib/${name}.ts`),
      /^\s*import\s|\bimport\(/m,
      `${name} imports nothing`,
    );
});

test("full motion only, and the body never moves", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  // Both mounts sit behind the reduced-motion / economy gate.
  const entry = surge.slice(
    surge.indexOf("export function EntrySurge()"),
    surge.indexOf("export function ScrollSurgeCanvas"),
  );
  assert.ok(entry.indexOf("reducedMotion()) return;") > 0);
  assert.ok(entry.indexOf("reducedMotion()) return;") < entry.indexOf("mountCrescendo("));
  assert.ok(entry.indexOf("reducedMotion()) return;") < entry.indexOf("mountSkin("));
  const scroll = surge.slice(surge.indexOf("export function useScrollSurge"));
  assert.match(
    scroll,
    /const live = \(\) =>\s*runway\.dataset\.rznState === "live" && !document\.hidden && visible && !reducedMotion\(\);/,
  );
  assert.ok(scroll.indexOf("if (!live()) {") < scroll.indexOf("mountCrescendo("));
  assert.ok(scroll.indexOf("if (!live()) {") < scroll.indexOf("mountSkin("));
  // The new layers draw light; they never write a transform (owner,
  // 2026-11-03: the scroll suit-up's body must not shake).
  for (const name of ["rexonance-suit-crescendo", "rexonance-suit-skin"])
    assert.doesNotMatch(read(`src/lib/${name}.ts`), /style\.(scale|translate|transform|rotate)/);
  const helpers = surge.slice(
    surge.indexOf("type CrescendoLib"),
    surge.indexOf("export function EntrySurgeBack"),
  );
  assert.doesNotMatch(helpers, /style\.(scale|translate|transform|rotate)|scrollPush|shake\(/);
  // The scroll's steady camera is still the engine's own.
  assert.match(
    read("src/components/rexonance-saga/rexonance-saga.tsx"),
    /useEffect\(\(\) => mountRexonanceAssembly\(runwayRef\.current, SUIT_UP\), \[\]\);/,
  );
});
