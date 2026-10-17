import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { naniteHexHeight, naniteHexLight } from "../src/lib/rexonance-unlit.js";
import { REXONANCE_NANITES } from "../src/lib/rexonance-nanites.ts";
import {
  REXONANCE_SUIT_GOLD_CELL,
  REXONANCE_SUIT_GOLD_CELLS,
} from "../src/lib/rexonance-suit-gold.ts";
import {
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
} from "../src/lib/rexonance-suit.ts";
import { REXONANCE_SUIT_DRIVER } from "../src/lib/rexonance-calls.ts";
import { planAssembly, planAssemblyGold } from "../src/lib/rexonance-resonance.js";
import { planAssemblyNanites } from "../src/lib/rexonance-assembly-nanites.js";

const source = readFileSync(
  new URL("../src/lib/rexonance-assembly-nanites.js", import.meta.url),
  "utf8",
);
let cachedCreate;
let cachedFixture;

function runtimeFactory() {
  if (cachedCreate) return cachedCreate;
  const importLine = 'import { naniteHexHeight, naniteHexLight } from "./rexonance-unlit.js";';
  assert.equal(
    source.split(importLine).length - 1,
    1,
    "remove the single runtime import for the VM",
  );
  const returnMarker = "  return {\n    state,";
  assert.equal(
    source.split(returnMarker).length - 1,
    1,
    "inject probes at the runtime return only",
  );
  const instrumented = source
    .replace(importLine, "")
    .replace(/\bexport\s+(?=(?:const|function|class)\b)/g, "")
    .replace(
      returnMarker,
      `  return {
    __testPose(i, q) {
      poseTile(i, q, 0);
      const p = PO[i];
      return {
        x: X[0], y: Y[0], size: S[0], frame: FR[0], kind: KIND[0], progress: U[0],
        targetX: p >= 0 ? jigX(p, CX[i], CY[i]) : CX[i],
        targetY: p >= 0 ? jigY(p, CX[i], CY[i]) : CY[i],
      };
    },
    __testDock(i) {
      const p = PO[i];
      return {
        x: DOCKX[i], y: DOCKY[i], parent: PARENT[i],
        cx: CX[i], cy: CY[i], nx: P[p]?.nx ?? 0, ny: P[p]?.ny ?? -1,
        helmet: Boolean(P[p]?.helm),
      };
    },
    __testAnatomy(p) {
      const piece = P[p];
      return { id: piece.id, group: piece.group, fixed: piece.fixed, seatX: piece.seatX, seatHold: piece.seatHold, bank: piece.bank };
    },
    state,`,
    )
    .concat("\nglobalThis.__createAssemblyNanites = createAssemblyNanites;\n");
  const context = { naniteHexHeight, naniteHexLight };
  runInNewContext(instrumented, context);
  cachedCreate = context.__createAssemblyNanites;
  return cachedCreate;
}

function buildFixture() {
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  const nano = planAssemblyNanites({
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
    goldCell: REXONANCE_SUIT_GOLD_CELL,
  });
  return { pieces, plan, gold, nano };
}

function fixture() {
  cachedFixture ??= buildFixture();
  return cachedFixture;
}

function representativeTiles(nano) {
  const perPiece = Array.from({ length: nano.pieces.length }, () => ({ parent: -1, root: -1 }));
  for (let i = 0; i < nano.count; i += 1) {
    const p = nano.pieceOf[i];
    if (p < 0 || nano.pieces[p].helm) continue;
    if (nano.parent[i] >= 0 && perPiece[p].parent < 0) perPiece[p].parent = i;
    if (nano.parent[i] < 0 && perPiece[p].root < 0) perPiece[p].root = i;
  }
  const samples = [];
  let parentSamples = 0;
  let rootSamples = 0;
  let partsCovered = 0;
  for (let p = 0; p < perPiece.length; p += 1) {
    if (nano.pieces[p].helm) continue;
    const { parent, root } = perPiece[p];
    assert.ok(parent >= 0 || root >= 0, `${nano.pieces[p].id} has a representative tile`);
    if (parent >= 0) {
      samples.push(parent);
      parentSamples += 1;
    }
    if (root >= 0) {
      samples.push(root);
      rootSamples += 1;
    }
    partsCovered += 1;
  }
  assert.ok(partsCovered >= 40, `representatives cover ${partsCovered} non-helmet parts`);
  assert.ok(
    parentSamples > 0 && rootSamples > 0,
    `parent/root classes covered (${parentSamples}, ${rootSamples})`,
  );
  return samples;
}

function createSwarm(nano, gold) {
  return runtimeFactory()({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: null, comets: null, fx: null },
    kit: REXONANCE_NANITES,
    gold,
    document: null,
  });
}

const qAt = (nano, i, u) => nano.T0[i] + (nano.T1[i] - nano.T0[i]) * u;
const close = (a, b, tolerance, label) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b} (tol ${tolerance})`);
const frameDistance = (a, b) => Math.abs(((((a - b + 12) % 24) + 24) % 24) - 12);

test("non-helmet tile pose stays continuous at river, braking, and unfold boundaries", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  const samples = representativeTiles(nano);
  for (const i of samples) {
    const piece = nano.pieces[nano.pieceOf[i]];
    for (const boundary of [0.55, 0.8, 0.86]) {
      const beforeQ = qAt(nano, i, boundary - 1e-7);
      const afterQ = qAt(nano, i, boundary);
      swarm.frame(beforeQ, 0, true, 1, false);
      const before = swarm.__testPose(i, beforeQ);
      swarm.frame(afterQ, 0, true, 1, false);
      const after = swarm.__testPose(i, afterQ);
      close(before.x, after.x, 0.02, `${piece.id} u=${boundary} x continuity`);
      close(before.y, after.y, 0.02, `${piece.id} u=${boundary} y continuity`);
      close(before.size, after.size, 0.02, `${piece.id} u=${boundary} size continuity`);
      close(
        frameDistance(before.frame, after.frame),
        0,
        1e-3,
        `${piece.id} u=${boundary} face continuity`,
      );
    }
  }
});

test("tiles converge to their keyed socket and retain the same pose after forward and reverse scrubbing", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  const samples = representativeTiles(nano);
  for (const i of samples) {
    const piece = nano.pieces[nano.pieceOf[i]];
    const nearEnd = qAt(nano, i, 1 - 1e-8);
    swarm.frame(nearEnd, 0, true, 1, false);
    const seated = swarm.__testPose(i, nearEnd);
    close(seated.x, seated.targetX, 1e-3, `${piece.id} final x reaches target`);
    close(seated.y, seated.targetY, 1e-3, `${piece.id} final y reaches target`);
    close(seated.frame, 0, 1e-6, `${piece.id} non-helmet face is aligned`);
    close(seated.progress, 1, 1e-7, `${piece.id} final sample reaches end of flight`);
  }

  const i = samples[0];
  const middle = qAt(nano, i, 0.73);
  const forward = qAt(nano, i, 0.93);
  swarm.frame(middle, 0, true, 1, false);
  const reference = swarm.__testPose(i, middle);
  swarm.frame(forward, 0, true, 1, false);
  swarm.frame(middle, 0, true, 1, false);
  assert.deepEqual(
    swarm.__testPose(i, middle),
    reference,
    "reverse returns to the exact sampled pose",
  );
  swarm.frame(qAt(nano, i, 0.6), 0, true, 1, false);
  swarm.frame(middle, 0, true, 1, false);
  assert.deepEqual(
    swarm.__testPose(i, middle),
    reference,
    "forward catch-up returns to the exact sampled pose",
  );
});

test("docking axes combine each parent neighbour with its plate normal", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  let checked = 0;
  for (let i = 0; i < nano.count; i += 1) {
    const dock = swarm.__testDock(i);
    if (dock.helmet) continue;
    let x = dock.nx;
    let y = dock.ny;
    if (dock.parent >= 0) {
      const dx = dock.cx - nano.CX[dock.parent];
      const dy = dock.cy - nano.CY[dock.parent];
      const length = Math.hypot(dx, dy) || 1;
      x = (0.8 * dx) / length + 0.2 * dock.nx;
      y = (0.8 * dy) / length + 0.2 * dock.ny;
    }
    const length = Math.hypot(x, y) || 1;
    close(dock.x, x / length, 1e-6, `tile ${i} dock x`);
    close(dock.y, y / length, 1e-6, `tile ${i} dock y`);
    close(Math.hypot(dock.x, dock.y), 1, 1e-6, `tile ${i} unit docking axis`);
    checked += 1;
  }
  assert.ok(checked > 1000, `${checked} non-helmet docking keys checked`);
});

test("seat holds follow anatomy and arm banks face in from opposite sides", () => {
  const { nano } = fixture();
  const swarm = createSwarm(nano, null);
  let left = 0;
  let right = 0;
  for (let p = 0; p < nano.pieces.length; p += 1) {
    const piece = swarm.__testAnatomy(p);
    const expectedHold =
      piece.group === "tail" || piece.group === "ribbon"
        ? 0.35
        : piece.group === "arms"
          ? 0.38
          : piece.group === "legs"
            ? 0.3
            : 0.16;
    close(piece.seatHold, expectedHold, 1e-9, `${piece.id} seat hold`);
    if (piece.group !== "arms" || piece.fixed) continue;
    if (piece.seatX < REXONANCE_SUIT_SIZE.width / 2) {
      assert.ok(piece.bank < 0, `${piece.id} left arm banks inward`);
      left += 1;
    } else {
      assert.ok(piece.bank > 0, `${piece.id} right arm banks inward`);
      right += 1;
    }
  }
  assert.ok(left > 0 && right > 0, `both arm banks represented (${left}, ${right})`);
});
