import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { naniteHexHeight, naniteHexLight } from "../src/lib/rexonance-unlit.js";
import { sampleFlameBirth, NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";
import { scrollFlameAt } from "../src/lib/rexonance-field/field-clock.js";
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
import {
  armorClampBite,
  armorDockState,
  armorSeatLift,
  naniteHash,
  planAssemblyNanites,
} from "../src/lib/rexonance-assembly-nanites.js";

const source = readFileSync(
  new URL("../src/lib/rexonance-assembly-nanites.js", import.meta.url),
  "utf8",
);
let cachedCreate;
let cachedFixture;

function runtimeFactory() {
  if (cachedCreate) return cachedCreate;
  const importLine = 'import { naniteHexHeight, naniteHexLight } from "./rexonance-unlit.js";';
  const fireImport = 'import { sampleFlameBirth } from "./rexonance-ignition.js";';
  const firePainterImport = 'import { drawNaniteFirebrand } from "./rexonance-flame.js";';
  const phaseImport = 'import { NANITE_FIRE_PHASES } from "./rexonance-ignition.js";';
  const clockImport = 'import { scrollFlameAt } from "./rexonance-field/field-clock.js";';
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
    .replace(fireImport, "")
    .replace(firePainterImport, "")
    .replace(phaseImport, "")
    .replace(clockImport, "")
    .replace(/\bexport\s+(?=(?:const|function|class)\b)/g, "")
    .replace(
      returnMarker,
      `  return {
    __testFreeCurrent(j, q) {
      surfaceCurrent(free.emission, j * 4, free.hsh[j], free.birth[j], q);
      return Array.from(RG);
    },
    __testTileCurrent(i, q) {
      tileCurrent(i, q);
      return Array.from(RG);
    },
    __testPose(i, q) {
      poseTile(i, q, 0);
      const p = PO[i];
      return {
        x: X[0], y: Y[0], size: S[0], alpha: A[0], fire: FIRE[0], frame: FR[0], kind: KIND[0], progress: U[0],
        depth: Z[0], trailX: TRX[0], trailY: TRY[0], glint: GL[0],
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
    __testMaterials() {
      let metal=0,fire=0;
      for(let i=0;i<n+F;i++) {if(A[i]>.01 && KIND[i]) metal++;if(FIRE[i]>.02 && KIND[i]) fire++;}
      return {metal,fire};
    },
    state,`,
    )
    .concat("\nglobalThis.__createAssemblyNanites = createAssemblyNanites;\n");
  const context = {
    naniteHexHeight,
    naniteHexLight,
    sampleFlameBirth,
    NANITE_FIRE_PHASES,
    drawNaniteFirebrand(ctx, x, y, strength, clock, scale = 1) {
      for (let i = 0; i < 2; i++)
        ctx.drawImage({ id: "firebrand" }, x - 20 * scale, y - 50 * scale, 40 * scale, 70 * scale);
    },
  };
  context.scrollFlameAt = scrollFlameAt;
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

function createSwarm(nano, gold, coarse = false) {
  return runtimeFactory()({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: null, comets: null, fx: null },
    kit: REXONANCE_NANITES,
    gold,
    coarse,
    document: null,
  });
}

const qAt = (nano, i, u) => nano.T0[i] + (nano.T1[i] - nano.T0[i]) * u;
const close = (a, b, tolerance, label) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b} (tol ${tolerance})`);
const frameDistance = (a, b) => Math.abs(((((a - b + 12) % 24) + 24) % 24) - 12);

test("every scroll machine uses the shared burning surface and one unquantized birth interval", () => {
  const { nano } = fixture();
  const out = new Float64Array(4);
  // The births: from the first chips (materialStart on the runway) over
  // .027 of progress, before the earliest flight.
  const m0 = scrollFlameAt(NANITE_FIRE_PHASES.materialStart);
  for (const [count, emission, births, offset] of [
    [nano.count, nano.emission, nano.birth, 0],
    [nano.free.birth.length, nano.free.emission, nano.free.birth, 100003],
  ]) {
    assert.equal(emission.length, count * 4, "preallocated source and normal slots");
    const bands = new Set();
    for (let i = 0; i < count; i++) {
      sampleFlameBirth(naniteHash(i + offset, 50), out);
      const expected = [out[0] * 571, out[1] * 1040, out[2], out[3]];
      for (let k = 0; k < 4; k++)
        close(emission[i * 4 + k], expected[k], 0.0001, `${i}/${k}: same burning source`);
      assert.ok(births[i] >= m0 - 1e-7 && births[i] <= m0 + 0.027 + 1e-7);
      bands.add(Math.floor((births[i] - m0) * 1000));
    }
    assert.ok(bands.size >= 20, `${bands.size} continuous release times, not six pumps`);
  }
});

// Owner (2026-10-21): 「レクソナンスの特設ページにて、ナノマシンの挙動…を改善して」.
// The burst's wide helix no longer contracts into a small per-chip circle at
// an age-scattered phase (which read as glitter in flat columns): it hands
// over, in the same turning sense, to a narrower braided current whose phase
// follows the progress and the body position, never the chip's age.
const braidFrame = (nx, ny) => {
  // The body line's tangent, turned down the screen on either side.
  const flip = nx < 0 ? -1 : 1;
  return [-ny * flip, nx * flip];
};

test("scroll machines open a wide helix out of the burst, then braid into a narrower current that keeps turning in depth", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  const H = REXONANCE_SUIT_SIZE.height;
  const smooth = (u) => (u = Math.max(0, Math.min(1, u))) * u * (3 - 2 * u);
  for (let j = 0; j < nano.free.birth.length; j += 17) {
    const born = nano.free.birth[j],
      seed = nano.free.hsh[j];
    const [sx, sy, nx, ny] = nano.free.emission.slice(j * 4, j * 4 + 4);
    const [tx, ty] = braidFrame(nx, ny);
    const normal2 = nx * nx + ny * ny;
    // De-trend the launch, its lift and its standoff from the body line
    // (unchanged), leaving the orbit across (normal) and along (tangent).
    const orbit = (age) => {
      const [x, y, z] = swarm.__testFreeCurrent(j, born + age);
      const release = smooth(age / 0.012),
        returning = smooth((age - 0.012) / 0.075);
      const thrown = (((80 + 50 * seed) * H) / 1000) * (1 - 0.9 * returning);
      const lift = ((18 + 17 * seed) * H) / 1000;
      const reach = thrown + H * (0.024 + 0.018 * seed) * release;
      const dx = x - sx - nx * reach;
      const dy = y - sy - ny * reach + lift + H * 0.018 * release;
      return { along: tx * dx + ty * dy, across: (nx * dx + ny * dy) / normal2, z };
    };
    const turned = (from, to) => {
      const angles = [],
        alongs = [],
        acrosses = [],
        depths = [];
      for (let step = from; step <= to; step++) {
        const { along, across, z } = orbit(step / 1000);
        let angle = Math.atan2(across, along);
        if (angles.length) {
          while (angle < angles.at(-1) - Math.PI) angle += Math.PI * 2;
          while (angle > angles.at(-1) + Math.PI) angle -= Math.PI * 2;
        }
        angles.push(angle);
        alongs.push(Math.abs(along));
        acrosses.push(Math.abs(across));
        depths.push(z);
      }
      return { turns: (angles.at(-1) - angles[0]) / (Math.PI * 2), alongs, acrosses, depths };
    };
    // The burst: more than two turns in one sense, wide, through the depth.
    const burst = turned(1, 90);
    assert.ok(burst.turns > 2, `${j}: ${burst.turns} turns after emergence`);
    assert.ok(Math.max(...burst.alongs) > H * 0.035, `${j}: the orbit leaves a straight launch`);
    assert.ok(
      Math.max(...burst.depths) - Math.min(...burst.depths) > 1.4,
      `${j}: front/back depth changes with orbit`,
    );
    // Settled: still turning (a full turn in .0375), narrower along the body
    // line than the burst, a substantial orbit across it, near and far.
    const braid = turned(100, 138);
    assert.ok(braid.turns > 0.95, `${j}: the braid keeps turning (${braid.turns})`);
    assert.ok(
      Math.max(...braid.alongs) < 0.4 * Math.max(...burst.alongs),
      `${j}: the braid is narrower along the body than the burst`,
    );
    assert.ok(Math.max(...braid.acrosses) > H * 0.018, `${j}: the braid still orbits its axis`);
    assert.ok(
      Math.min(...braid.depths) < -0.9 && Math.max(...braid.depths) > 0.9,
      `${j}: the braid passes near and far`,
    );
    assert.ok(Math.max(...braid.depths) < 0.95, `${j}: the braid stays out of the bokeh band`);
    const reference = swarm.__testFreeCurrent(j, born + 0.04);
    swarm.__testFreeCurrent(j, born + 0.09);
    assert.deepEqual(
      swarm.__testFreeCurrent(j, born + 0.04),
      reference,
      "reverse uses the same closed-form current",
    );
  }
});

test("neighbouring scroll machines travel together, not in lockstep, whatever their birth", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  // The braid's strand (two, by the seed), as the engine derives it.
  const strand = (seed) => Math.floor(((seed * 13.37) % 1) * 2);
  const sources = [];
  for (let i = 0; i < nano.count; i++)
    sources.push({
      i,
      x: nano.emission[i * 4],
      y: nano.emission[i * 4 + 1],
      nx: nano.emission[i * 4 + 2],
      strand: strand(nano.hsh[i]),
    });
  sources.sort((a, b) => a.y - b.y);
  let pairs = 0,
    births = 0,
    aligned = 0,
    apart = 0;
  for (let k = 0; k < sources.length && pairs < 400; k++)
    for (let m = k + 1; m < sources.length && sources[m].y - sources[k].y < 3; m++) {
      const a = sources[k],
        b = sources[m];
      if (a.nx !== b.nx || a.strand !== b.strand || Math.abs(a.x - b.x) > 3) continue;
      if (Math.min(nano.T0[a.i], nano.T0[b.i]) <= 0.3) continue;
      pairs += 1;
      if (Math.abs(nano.birth[a.i] - nano.birth[b.i]) > 0.008) births += 1;
      const ha = swarm.__testTileCurrent(a.i, 0.25),
        hb = swarm.__testTileCurrent(b.i, 0.25);
      // Their headings (the closed-form derivative) agree…
      if (ha[3] * hb[3] + ha[4] * hb[4] > Math.cos(0.75)) aligned += 1;
      // …but the two are never one point moving in lockstep: over a turn
      // they part by more than a pixel.
      let gap = 0;
      for (let q = 0.25; q < 0.2875; q += 0.0025) {
        const pa = swarm.__testTileCurrent(a.i, q),
          pb = swarm.__testTileCurrent(b.i, q);
        gap = Math.max(gap, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
      }
      if (gap > 1) apart += 1;
    }
  assert.ok(pairs >= 60, `${pairs} neighbouring pairs sampled`);
  assert.ok(births >= pairs / 4, `${births} of the pairs were born well apart`);
  assert.ok(aligned >= pairs * 0.85, `${aligned}/${pairs} neighbours head the same way`);
  // (Only a near-collision of two index hashes at one source coincides.)
  assert.ok(apart >= pairs * 0.98, `${apart}/${pairs} keep their own radius and lag`);
});

test("settled scroll machines scale with depth and trail their closed-form heading, exactly on reverse", () => {
  const { nano, gold } = fixture();
  for (const coarse of [false, true]) {
    const swarm = createSwarm(nano, gold, coarse);
    let checked = 0;
    for (let i = 0; i < nano.count && checked < 40; i += 23) {
      if (nano.T0[i] < 0.36 || nano.pieces[nano.pieceOf[i]]?.helm) continue;
      checked += 1;
      // One full turn of its orbit, settled.
      let near = null,
        far = null;
      for (let step = 0; step < 40; step++) {
        const q = 0.3 + step * 0.001;
        swarm.frame(q, 0, true, 1, false);
        const pose = swarm.__testPose(i, q);
        assert.equal(pose.kind, 2, "waiting in the current");
        if (!near || pose.depth > near.depth) near = pose;
        if (!far || pose.depth < far.depth) far = pose;
        if (coarse) {
          assert.ok(Number.isNaN(pose.trailX), "touch draws no trails");
          continue;
        }
        // Its trail lies behind it along the heading the current actually
        // takes (a later pose minus an earlier one), within its bounds.
        const back = swarm.__testPose(i, q - 0.0004);
        const ahead = swarm.__testPose(i, q + 0.0004);
        swarm.__testPose(i, q);
        const hx = ahead.x - back.x,
          hy = ahead.y - back.y;
        const tx = pose.x - pose.trailX,
          ty = pose.y - pose.trailY;
        const length = Math.hypot(tx, ty);
        if (Number.isNaN(pose.trailX)) continue;
        assert.ok(length >= 4 - 1e-6 && length <= 22 + 1e-6, `trail length ${length}`);
        assert.ok(
          (hx * tx + hy * ty) / (Math.hypot(hx, hy) * length) > 0.97,
          "trail along the actual heading",
        );
      }
      assert.ok(near.depth > 0.9 && far.depth < -0.9, "a full turn passes near and far");
      assert.ok(near.size > 2.4 * far.size, `near ${near.size} vs far ${far.size}: larger`);
      assert.ok(near.alpha > 2.4 * far.alpha, `near ${near.alpha} vs far ${far.alpha}: brighter`);
    }
    assert.ok(checked >= 20, `${checked} settled chips sampled`);
    // Reverse scrubbing and jumps return the identical pose, trail and frame.
    let i = 0;
    while (nano.T0[i] < 0.4 || nano.pieces[nano.pieceOf[i]]?.helm) i += 1;
    swarm.frame(0.31, 0, true, 1, false);
    const reference = swarm.__testPose(i, 0.31);
    for (const q of [0.5, 0.2, 0.3105, 0.95, 0.31]) {
      swarm.frame(q, 0, true, 1, false);
      swarm.__testPose(i, q);
    }
    assert.deepEqual(swarm.__testPose(i, 0.31), reference, `${coarse}: history-free`);
  }
});

test("scroll fire leaves the surface first, forms metal at its airborne point, and joins the armour flight continuously", () => {
  const { nano, gold } = fixture();
  const swarm = createSwarm(nano, gold);
  const samples = representativeTiles(nano);
  const helmet = Array.from(nano.pieceOf).findIndex((p) => p >= 0 && nano.pieces[p].helm);
  if (helmet >= 0) samples.push(helmet);
  for (const i of samples) {
    const born = nano.birth[i];
    if (nano.T0[i] <= born + 1e-7) continue;
    const fireStart = scrollFlameAt(NANITE_FIRE_PHASES.burstStart);
    const fireEnd = Math.min(born, scrollFlameAt(NANITE_FIRE_PHASES.burstEnd));
    swarm.frame(fireStart, 0, true, 1, false);
    const origin = swarm.__testPose(i, fireStart);
    close(origin.x, nano.emission[i * 4], 0.0001, `${i}: prelude start x`);
    close(origin.y, nano.emission[i * 4 + 1], 0.0001, `${i}: prelude start y`);
    assert.equal(origin.alpha, 0);
    close(origin.fire, 0, 1e-12, "floating-point prelude zero");
    swarm.frame((fireStart + fireEnd) / 2, 0, true, 1, false);
    const flying = swarm.__testPose(i, (fireStart + fireEnd) / 2);
    assert.ok(flying.fire > 0 && flying.alpha === 0, "flame flies before any metal exists");
    swarm.frame(born - 1e-9, 0, true, 1, false);
    const predecessor = swarm.__testPose(i, born - 1e-9);
    swarm.frame(born, 0, true, 1, false);
    const first = swarm.__testPose(i, born);
    close(first.x, predecessor.x, 0.001, `${i}: fire-to-machine x`);
    close(first.y, predecessor.y, 0.001, `${i}: fire-to-machine y`);
    assert.ok(
      Math.hypot(first.x - nano.emission[i * 4], first.y - nano.emission[i * 4 + 1]) >=
        80 * (REXONANCE_SUIT_SIZE.height / 1000) - 0.001,
      "the machine begins in the airborne fragment, not at a new body origin",
    );
    assert.equal(first.fire, 1);
    assert.equal(
      first.alpha,
      0,
      "material fades out of the existing fire instead of appearing opaque",
    );
    if (nano.T0[i] > born + 0.008) {
      swarm.frame(born + 0.008, 0, true, 1, false);
      const cooled = swarm.__testPose(i, born + 0.008);
      assert.ok(
        cooled.fire < 1e-7 && cooled.alpha > 0,
        "fire cools into the metal without restarting",
      );
    }
    const q = nano.T0[i];
    swarm.frame(q - 1e-9, 0, true, 1, false);
    const before = swarm.__testPose(i, q - 1e-9);
    swarm.frame(q, 0, true, 1, false);
    const after = swarm.__testPose(i, q);
    close(before.x, after.x, 0.001, `${i}: rolling current/flight x`);
    close(before.y, after.y, 0.001, `${i}: rolling current/flight y`);
    const reference = { ...after };
    swarm.frame(nano.T1[i] + 0.01, 0, true, 1, false);
    swarm.frame(q, 0, true, 1, false);
    assert.deepEqual(
      { ...swarm.__testPose(i, q) },
      reference,
      "no previous frame alters the handoff",
    );
  }
});

test("all real scroll metal passes stay empty before the global material floor, including reverse scrubbing", () => {
  const { nano, gold } = fixture(),
    swarm = createSwarm(nano, gold);
  let operations = 0;
  const noop = () => {};
  const context = new Proxy(
    {
      drawImage() {
        operations++;
      },
      fillRect() {
        operations++;
      },
      fill() {
        operations++;
      },
    },
    { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
  );
  // The floor is the first chips (materialStart on the runway); the fire is
  // gone by flameEnd. Forward past both, back before the floor, into the
  // flame's tail, to the start, and to the tail's very end.
  const floor = scrollFlameAt(NANITE_FIRE_PHASES.materialStart);
  const end = scrollFlameAt(NANITE_FIRE_PHASES.flameEnd);
  for (const q of [
    0.2,
    floor - 0.0106,
    floor - 0.0056,
    floor + 0.0044,
    floor + 0.011,
    floor + 0.0134,
    end - 1e-7,
    0.01,
    end - 0.00075,
  ]) {
    swarm.frame(q, 0, false, 1, false);
    if (q >= floor) continue;
    assert.equal(swarm.__testMaterials().metal, 0, `${q}: no positive-alpha metal cell`);
    operations = 0;
    swarm.backPass(context);
    swarm.midPass(context);
    swarm.frontPass(context);
    swarm.flightPass(context);
    swarm.stagedPass(context);
    swarm.seatedPass(context, swarm.paintedBy(q));
    swarm.freePass(context);
    assert.equal(operations, 0, `${q}: no actual metal image, facet rectangle or fill`);
  }
  swarm.frame(floor + 0.03, 0, false, 1, false);
  assert.ok(
    swarm.__testMaterials().metal > 0,
    "material actually appears after clearing, rather than being disabled permanently",
  );
});

test("fine and touch metal draw during the fading fire, including reversed progress", () => {
  const { nano, gold } = fixture();
  for (const coarse of [false, true]) {
    const swarm = createSwarm(nano, gold, coarse);
    let draws = 0;
    const noop = () => {};
    const context = new Proxy(
      {
        fillRect() {
          draws++;
        },
        fill() {
          draws++;
        },
        drawImage() {
          draws++;
        },
      },
      { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
    );
    // In the flame's tail (after the first chips, before flameEnd on the
    // runway), forward past it, and back into it.
    const floor = scrollFlameAt(NANITE_FIRE_PHASES.materialStart);
    const end = scrollFlameAt(NANITE_FIRE_PHASES.flameEnd);
    for (const q of [floor + 0.011, floor + 0.0134, 0.2, floor + 0.011]) {
      swarm.frame(q, 0, false, 1, false);
      if (q >= end) continue;
      assert.ok(swarm.__testMaterials().metal > 0, `${coarse}/${q}: material in flame tail`);
      draws = 0;
      swarm.backPass(context);
      swarm.midPass(context);
      swarm.frontPass(context);
      swarm.freePass(context);
      assert.ok(draws > 0, `${coarse}/${q}: actual batched metal paints before full clearing`);
    }
  }
});

test("the explosive scroll prelude never adds detached flame blobs or square pseudo-machines", () => {
  const { nano, gold } = fixture(),
    swarm = createSwarm(nano, gold);
  let images = [],
    paints = 0,
    visibleFire = 0;
  const noop = () => {};
  const context = new Proxy(
    {
      drawImage(image) {
        images.push(image.id);
      },
      fillRect() {
        paints++;
      },
      fill() {
        paints++;
      },
      stroke() {
        paints++;
      },
    },
    { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
  );
  for (const q of [0.2, 0.065, 0.075, 0.0815, 0.0855, 0.075, 0.065]) {
    swarm.frame(q, 0, false, 1, false);
    if (q >= 0.070575) continue;
    images = [];
    paints = 0;
    swarm.firebrands(context);
    assert.equal(paints, 0, `${q}: no square/facet fallback may mimic early nanomachines`);
    visibleFire += images.length;
    assert.equal(images.length, 0, `${q}: the shared vortex owns fire, never detached sprites`);
  }
  assert.equal(visibleFire, 0, "no floating flame blob on forward or reverse scroll");
});

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

test("armor runners are keyed to each plate's actual travel vector", () => {
  const { nano } = fixture();
  let checked = 0;
  for (const piece of nano.pieces) {
    if (piece.fixed || piece.ornament) continue;
    const travel = Math.hypot(piece.offX, piece.offY);
    assert.ok(travel > 0 && piece.railLength > travel, `${piece.id} has a full approach rail`);
    close(Math.hypot(piece.railX, piece.railY), 1, 1e-6, `${piece.id} rail unit axis`);
    close(piece.railX * travel, piece.offX, 1e-5, `${piece.id} rail follows x travel`);
    close(piece.railY * travel, piece.offY, 1e-5, `${piece.id} rail follows y travel`);
    assert.ok(piece.railHalf >= 5 && piece.railHalf <= 14, `${piece.id} socket width`);
    for (let k = 0; k < 4; k += 2) {
      const ax = piece.railAnchors[k];
      const ay = piece.railAnchors[k + 1];
      assert.ok(
        Math.hypot(ax - piece.seatX, ay - piece.seatY) > 1,
        `${piece.id} runner attaches to an edge rather than the seat centre`,
      );
      assert.ok(
        Array.from(
          { length: 4 },
          (_, c) => Math.hypot(ax - piece.clamp[c * 2], ay - piece.clamp[c * 2 + 1]) < 1e-5,
        ).some(Boolean),
        `${piece.id} runner uses an actual contour clamp anchor`,
      );
    }
    const side = piece.seatX < REXONANCE_SUIT_SIZE.width / 2 ? -1 : 1;
    if (piece.group === "arms" || piece.group === "shoulders")
      assert.ok(piece.offX * side > 0, `${piece.id} approaches from its outer side`);
    if (piece.group === "legs" || piece.group === "waist")
      assert.ok(piece.offY > 0, `${piece.id} rises from below`);
    checked += 1;
  }
  assert.ok(checked >= 30, `${checked} moving armor plates have keyed rails`);
});

test("anatomical capture pauses on the rail then seats with continuous endpoints", () => {
  const { nano } = fixture();
  for (const piece of nano.pieces) {
    if (piece.fixed || piece.ornament) continue;
    const at = piece.to + (piece.contact - piece.to) * piece.catchAt;
    const before = armorSeatLift(piece, at - 1e-8);
    const held = armorSeatLift(piece, at);
    const after = armorSeatLift(piece, at + 1e-8);
    close(before, held, 1e-7, `${piece.id} capture starts continuously`);
    close(after, held, 1e-7, `${piece.id} capture exits continuously`);
    close(
      held,
      (1 - piece.seatHold) * piece.catchLift,
      1e-9,
      `${piece.id} capture holds clear of socket`,
    );
    close(
      armorSeatLift(piece, piece.to - 1e-8),
      armorSeatLift(piece, piece.to),
      1e-6,
      `${piece.id} approach joins capture`,
    );
    close(
      armorSeatLift(piece, piece.contact - 1e-8),
      0,
      1e-6,
      `${piece.id} final lock has no jump`,
    );
    close(armorSeatLift(piece, piece.contact), 0, 1e-9, `${piece.id} remains seated`);
  }
});

test("rail, jaw and cooling phases meet continuously and scrub in either direction", () => {
  const { nano } = fixture();
  const state = new Float64Array(4);
  const replay = new Float64Array(4);
  for (const piece of nano.pieces) {
    if (piece.fixed || piece.ornament) continue;
    armorDockState(piece, piece.to - 0.014, state);
    close(state[0], 0, 1e-9, `${piece.id} rail begins at zero`);
    armorDockState(piece, piece.to - 0.009, state);
    assert.ok(state[0] > 0.99, `${piece.id} full runners precede landing`);
    armorDockState(piece, piece.contact - 1e-8, state);
    close(state[3], 0, 1e-5, `${piece.id} plate reaches socket continuously`);
    close(state[0], 0, 1e-5, `${piece.id} rail retracts at contact`);
    armorDockState(piece, piece.contact, state);
    close(state[1], 1, 1e-9, `${piece.id} jaws close at contact`);
    close(state[2], 1, 1e-9, `${piece.id} cooling starts at contact`);
    close(state[3], 0, 1e-9, `${piece.id} no final position jump`);
    armorDockState(piece, piece.contact + 0.014, state);
    close(state[2], 0, 1e-9, `${piece.id} cooling ends cleanly`);
    const q = piece.to + (piece.contact - piece.to) * 0.53;
    armorDockState(piece, q, state);
    armorDockState(piece, piece.contact + 0.008, replay);
    armorDockState(piece, q, replay);
    assert.deepEqual([...replay], [...state], `${piece.id} reverse scrub is deterministic`);
  }
});

test("seam-anchored clamp keys bite in diagonal order and meet at contact", () => {
  const { nano } = fixture();
  let checked = 0;
  for (const piece of nano.pieces) {
    if (piece.clampMask !== 15) continue;
    const sample = piece.contact - 0.00375;
    const first = armorClampBite(piece, 2, sample);
    const diagonal = armorClampBite(piece, 1, sample);
    const opposite = armorClampBite(piece, 3, sample);
    const last = armorClampBite(piece, 0, sample);
    assert.ok(
      first > diagonal && diagonal > opposite && opposite >= last,
      `${piece.id} lower key, diagonal mate, opposite pair`,
    );
    for (let c = 0; c < 4; c += 1) {
      const lead = 0.006 - [3, 1, 0, 2][c] * 0.0015;
      close(
        armorClampBite(piece, c, piece.contact - lead),
        0,
        1e-9,
        `${piece.id} corner ${c} begins without a tooth jump`,
      );
      close(armorClampBite(piece, c, piece.contact), 1, 1e-9, `${piece.id} corner ${c} seated`);
      close(
        armorClampBite(piece, c, piece.contact + 0.006),
        0,
        1e-9,
        `${piece.id} corner ${c} released`,
      );
      assert.ok(
        Number.isFinite(piece.clamp[c * 2]) && Number.isFinite(piece.clamp[c * 2 + 1]),
        `${piece.id} corner ${c} has a seam anchor`,
      );
    }
    checked += 1;
  }
  assert.ok(checked > 0, "large armor plates use all four keyed corners");
});
