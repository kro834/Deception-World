// The liquid front (nano pass follow-up, 2026-11-21): a plate sets under one
// ragged front fitted to its tiles' times, never tile by tile.
import assert from "node:assert/strict";
import test from "node:test";
import {
  LIQUID_RAG,
  fitLiquidFront,
  liquidFrontPath,
  liquidProgress,
} from "../src/lib/rexonance-liquid-front.js";

// A 6 x 4 plate of 9 px tiles landing bottom first, with jitter.
const tiles = [];
for (let r = 0; r < 4; r += 1)
  for (let c = 0; c < 6; c += 1)
    tiles.push({ x: 100 + c * 9 + 4.5, y: 200 + r * 9 + 4.5, t: 1000 + (3 - r) * 40 + ((c * 7) % 5) });
const front = fitLiquidFront(tiles.length, (i, out) => {
  out[0] = tiles[i].x;
  out[1] = tiles[i].y;
  out[2] = 4.5;
  out[3] = tiles[i].t;
});
const recorder = () => {
  const r = { moves: 0, lines: 0, closes: 0, points: [] };
  r.moveTo = (x, y) => {
    r.moves += 1;
    r.points.push([x, y]);
  };
  r.lineTo = (x, y) => {
    r.lines += 1;
    r.points.push([x, y]);
  };
  r.closePath = () => (r.closes += 1);
  return r;
};

test("the front starts with the first tile, ends with the last, and runs the way they land", () => {
  assert.ok(front);
  const first = Math.min(...tiles.map((t) => t.t));
  const last = Math.max(...tiles.map((t) => t.t));
  // (It starts a short lead before the first landing: no jump.)
  const before = first - 0.13 * (last - first);
  assert.equal(liquidProgress(front, before), 0);
  assert.equal(liquidProgress(front, last), 1);
  assert.equal(liquidFrontPath(recorder(), front, before), 0, "nothing before the first landing");
  assert.equal(liquidFrontPath(recorder(), front, last), 2, "the whole plate at the last: the art exactly");
  // Bottom first: the front's normal points up the figure.
  assert.ok(front[1] < -0.9);
  assert.equal(fitLiquidFront(0, () => {}), null);
});

test("one ragged polygon a frame, closed-form in the clock", () => {
  const a = recorder();
  assert.equal(liquidFrontPath(a, front, 1060), 1);
  assert.equal(a.moves, 1);
  assert.equal(a.lines, LIQUID_RAG + 1);
  assert.equal(a.closes, 1);
  liquidFrontPath(recorder(), front, 1110);
  const b = recorder();
  liquidFrontPath(b, front, 1060);
  assert.deepEqual(b.points, a.points);
  // The set and unset regions share the same lip.
  const rest = recorder();
  assert.equal(liquidFrontPath(rest, front, 1060, false), 1);
  assert.deepEqual(rest.points.slice(1, -1), a.points.slice(1, -1));
});

test("the front never leaves a landed tile behind, and only advances", () => {
  const [nx, ny] = front;
  let last = -Infinity;
  for (let t = 990; t <= 1130; t += 2) {
    const r = recorder();
    if (liquidFrontPath(r, front, t) !== 1) continue;
    // The lip's lowest point along the normal.
    const lip = Math.min(...r.points.slice(1, -1).map(([x, y]) => nx * x + ny * y));
    assert.ok(lip >= last - 1e-6, "it only advances");
    last = lip;
    for (const tile of tiles)
      if (tile.t <= t) assert.ok(nx * tile.x + ny * tile.y + 4.5 <= lip + 1e-4, `tile landed at ${tile.t} covered at ${t}`);
  }
});
