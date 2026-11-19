// Owner (2026-11-19): 「レクソナンスのナノマシンの装着アニメーションをさらに強化
// します」 — the entry's plates seat on the call's own fits under the skin's
// front (src/lib/rexonance-entry-seat.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_LIGHT,
  REXONANCE_SUIT_SNAP,
} from "../src/lib/rexonance-calls.ts";
import {
  ENTRY_SEAT_CELL,
  ENTRY_SEAT_CELLS,
  ENTRY_SEAT_FLIGHT,
  ENTRY_SEAT_GATE,
  ENTRY_SEAT_LEAD_MS,
  ENTRY_SEAT_SCALE_MS,
  ENTRY_SEAT_UNIT_MS,
  EntrySeatCells,
  buildEntrySeatMap,
  entrySeatHeld,
  entrySeatOpens,
} from "../src/lib/rexonance-entry-seat.ts";
import { REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import { SKIN_BANDS, SKIN_ENTRY } from "../src/lib/rexonance-suit-skin.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const map = buildEntrySeatMap();
const ms = (byte) => (byte / 255) * ENTRY_SEAT_SCALE_MS;
const texel = (x, y) =>
  map.data[Math.floor(y / ENTRY_SEAT_CELL) * map.width + Math.floor(x / ENTRY_SEAT_CELL)];
const byId = Object.fromEntries(REXONANCE_SUIT_PIECES.map((piece) => [piece.id, piece]));

test("the seat map: every held plate opens for its own fit, in the call's order up the body", () => {
  assert.equal(map.width, Math.ceil(REXONANCE_SUIT_SIZE.width / ENTRY_SEAT_CELL));
  assert.equal(map.height, Math.ceil(REXONANCE_SUIT_SIZE.height / ENTRY_SEAT_CELL));
  assert.equal(map.data.length, map.width * map.height);
  // A plate's texels open within its growth before its fit (a byte's step
  // of slack), wherever a plate stacked over it has not taken them.
  const step = ENTRY_SEAT_SCALE_MS / 255;
  const medians = {};
  for (const { group, order } of REXONANCE_SUIT_CASCADE) {
    const values = [];
    for (const id of order) {
      const piece = byId[id];
      if (!entrySeatHeld(piece)) continue;
      const fit = REXONANCE_SUIT_FIT[id];
      const [sx, sy] = [piece.x + piece.w / 2, piece.y + piece.h / 2];
      let own = 0;
      for (let y = piece.y; y < piece.y + piece.h; y += ENTRY_SEAT_CELL)
        for (let x = piece.x; x < piece.x + piece.w; x += ENTRY_SEAT_CELL) {
          const value = ms(texel(x, y));
          if (value >= entrySeatOpens(fit, 0) - step && value <= entrySeatOpens(fit, 1) + step) own += 1;
        }
      assert.ok(own > 0, `${id} has texels of its own (${sx}, ${sy})`);
      values.push(entrySeatOpens(fit, 0.5));
    }
    if (values.length) medians[group] = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  }
  // Legs, then the waist, the arms, the chest; the shoulders, the tail and
  // the ribbons after them (owner brief, 2026-11-19).
  const order = Object.entries(medians).sort((a, b) => a[1] - b[1]).map(([group]) => group);
  assert.deepEqual(order, ["legs", "waist", "arms", "chest", "shoulders", "tail", "ribbon"]);
  // Each accent's last texel opens just before its DEUS！.
  for (const [group, at] of Object.entries(REXONANCE_SUIT_SNAP)) {
    if (group === "helm") continue;
    const last = REXONANCE_SUIT_CASCADE.find((step) => step.group === group).order.at(-1);
    if (!entrySeatHeld(byId[last])) continue;
    assert.equal(entrySeatOpens(REXONANCE_SUIT_FIT[last], 1), at - ENTRY_SEAT_LEAD_MS);
  }
  // Everything has opened and set before the light.
  let latest = 0;
  for (const value of map.data) latest = Math.max(latest, ms(value));
  assert.ok(latest + SKIN_BANDS * ENTRY_SEAT_UNIT_MS < REXONANCE_SUIT_LIGHT.from);
  assert.ok(latest < SKIN_ENTRY.fade[0]);
  assert.ok(ENTRY_SEAT_SCALE_MS > REXONANCE_CALL_BEATS[4].start);
});

test("the driver, the reactor and the helmet are never held", () => {
  for (const piece of REXONANCE_SUIT_PIECES) {
    const free =
      REXONANCE_SUIT_DRIVER.includes(piece.id) ||
      piece.group === "helm" ||
      piece.id === "core-swirl" ||
      piece.id === "core-disc";
    assert.equal(entrySeatHeld(piece), !free, piece.id);
  }
  // The driver's jewel and the reactor's centre: texels of 0 (worn from the
  // first frame; the front's trigger).
  const jewel = byId["belt-jewel"];
  assert.equal(texel(jewel.x + jewel.w / 2, jewel.y + jewel.h / 2), 0);
  const disc = byId["core-disc"];
  assert.equal(texel(disc.x + disc.w / 2, disc.y + disc.h / 2), 0);
  // The gate holds a plate as liquid metal, short of its cells' first click
  // (the shader's k = (a - 2.4) / 2.5).
  assert.ok(ENTRY_SEAT_GATE > 1.7 && ENTRY_SEAT_GATE < 2.4);
});

test("the shader's SEAT block is the entry's alone and leaves the scroll's program as it was", () => {
  const skin = read("src/lib/rexonance-suit-skin.ts");
  // Every seat line sits inside an #ifdef SEAT … #endif.
  const fragment = skin.slice(skin.indexOf("const FRAGMENT = `"), skin.indexOf("export type SkinSources"));
  const outside = fragment.replace(/#ifdef SEAT[\s\S]*?#endif/g, "");
  assert.doesNotMatch(outside, /uSeat|seatAt|gated|seated/);
  assert.equal(fragment.match(/#ifdef SEAT/g).length, 3);
  // Compiled only when a seat map is passed; the scroll's mount passes none.
  // (2026-11-20, nanosuit pass: the program may also define DERIV, for the
  // derivatives extension; SEAT is still defined only with a seat map.)
  assert.match(skin, /`\$\{deriv \? "#define DERIV\\n" : ""\}\$\{seat \? "#define SEAT\\n" : ""\}\$\{FRAGMENT\}`/);
  assert.match(skin, /if \(this\.lost \|\| !this\.seated\) return;/);
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.equal(surge.match(/buildEntrySeatMap\(\)/g).length, 1);
  assert.match(surge, /seat: EntrySeatMap \| null = null,/);
  // The entry's front keeps its own clock (the plates wait under it).
  assert.deepEqual([...SKIN_ENTRY.body], [470, 1750]);
  assert.deepEqual([...SKIN_ENTRY.head], [1230, 1880]);
});

test("the seat cells: budgeted by device, each lands on its plate as its texel opens, no trail", () => {
  const counts = {};
  for (const tier of Object.keys(ENTRY_SEAT_CELLS)) {
    const cells = new EntrySeatCells(tier);
    counts[tier] = cells.count;
    assert.ok(Math.abs(cells.count - ENTRY_SEAT_CELLS[tier]) <= ENTRY_SEAT_CELLS[tier] * 0.25, `${tier}: ${cells.count}`);
  }
  assert.ok(counts.desktop > counts.tablet && counts.tablet > counts.phone && counts.phone > counts.low);
  assert.equal(new EntrySeatCells("unknown").count, counts.low);
  const cells = new EntrySeatCells("desktop");
  const pose = new Float32Array(4);
  const other = new Float32Array(4);
  for (let i = 0; i < cells.count; i += 1) {
    const [x, y, land, flight] = cells.cells.subarray(i * 8, i * 8 + 4);
    // On the armour, where a held plate's texel opens when it lands.
    const opens = ms(texel(x, y));
    assert.ok(opens > 0 && Math.abs(opens - land) < 0.01, `cell ${i}: lands ${land}, its texel opens ${opens}`);
    assert.ok(flight >= ENTRY_SEAT_FLIGHT.ms[0] && flight <= ENTRY_SEAT_FLIGHT.ms[1]);
    // Not in the air before its flight or after it has sunk in.
    assert.equal(cells.poseAt(pose, i, land - flight - 1), false);
    assert.equal(cells.poseAt(pose, i, land + ENTRY_SEAT_FLIGHT.sink), false);
    // Inward only, quickening, a few px a frame (never a streak), and on
    // its landing exactly as it lands.
    let left = Infinity;
    let before = null;
    for (let t = land - flight + 4; t <= land; t += 4) {
      assert.ok(cells.poseAt(pose, i, t));
      const d = Math.hypot(pose[0] - x, pose[1] - y);
      assert.ok(d <= left + 1e-3, `cell ${i} never backs away`);
      if (before !== null) assert.ok(left - d < 14, `cell ${i}: ${left - d} px in 4 ms`);
      before = d;
      left = d;
    }
    assert.ok(cells.poseAt(pose, i, land));
    assert.ok(Math.hypot(pose[0] - x, pose[1] - y) < 1e-3);
    // Closed-form: the same pose whatever came before.
    cells.poseAt(other, (i + 7) % cells.count, land - 40);
    assert.ok(cells.poseAt(other, i, land));
    assert.deepEqual([...other], [...pose]);
  }
  // A frame is at most three fills of hexagons: no stroke, no line of its own.
  const calls = { beginPath: 0, fill: 0, moveTo: 0, lineTo: 0, closePath: 0 };
  const context = Object.fromEntries(Object.keys(calls).map((name) => [name, () => (calls[name] += 1)]));
  const drawn = cells.draw(context, REXONANCE_SUIT_SNAP.legs - 60);
  assert.ok(drawn > 20 && drawn < 320, `in the air: ${drawn}`);
  assert.ok(calls.fill <= 3 && calls.beginPath === calls.fill);
  assert.equal(calls.moveTo, drawn);
  assert.equal(calls.lineTo, drawn * 5);
  assert.equal(context.globalAlpha, 1);
  // The governor sheds them; nothing before the first flight or after the last.
  assert.ok(cells.draw(context, REXONANCE_SUIT_SNAP.legs - 60, 0.4) < drawn * 0.6);
  assert.equal(cells.draw(context, cells.from - 1), 0);
  assert.equal(cells.draw(context, cells.to + 1), 0);
  assert.ok(cells.to < REXONANCE_SUIT_LIGHT.from, "none in the air at the light");
  // The module is numbers only: no picture, no DOM, no skin chunk.
  const source = read("src/lib/rexonance-entry-seat.ts");
  assert.doesNotMatch(source, /document|new Image|getContext|stroke|shadowBlur/);
});
