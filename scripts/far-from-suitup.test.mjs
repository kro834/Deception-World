import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  ASSEMBLY_BEATS,
  ASSEMBLY_TOUCH_ART_BUDGET,
  assemblyPalette,
  assemblyPhase,
  glowPixels,
  mountRexonanceAssembly,
  planAssembly,
} from "../src/lib/rexonance-resonance.js";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_FACE_GLOW,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_GOLD_ATLAS,
  FAR_FROM_SUIT_MARKS,
  FAR_FROM_SUIT_ORNAMENTS,
  FAR_FROM_SUIT_PIECES,
  FAR_FROM_SUIT_REACTOR_GLOW,
  FAR_FROM_SUIT_SIZE,
  FAR_FROM_SUIT_TILE,
  FAR_FROM_SUIT_UNDERSUIT,
  FAR_FROM_SUIT_UNDERSUIT_PLACE,
} from "../src/lib/far-from-suit.ts";
import { FAR_FROM_SUIT_GOLD_CELL, FAR_FROM_SUIT_GOLD_CELLS } from "../src/lib/far-from-suit-gold.ts";
import {
  FAR_FROM_SUIT_GOLD_BOXES,
  FAR_FROM_SUIT_GUIDE,
  FAR_FROM_SUIT_SEAMS,
} from "../src/lib/far-from-suit-nanites.ts";
import {
  FAR_FROM_ASSEMBLY_BEATS,
  FAR_FROM_ASSEMBLY_FORM,
  FAR_FROM_ASSEMBLY_PARTS,
  FAR_FROM_ASSEMBLY_PHASES,
  FAR_FROM_SUIT_CALLS,
  farFromCallUnits,
  mountFarFromAssembly,
} from "../src/lib/far-from-assembly.ts";
import {
  FAR_FROM_CUTOUT,
  FAR_FROM_STAGE,
  FAR_FROM_STAGE_TIERS,
  FAR_FROM_SUIT_SCALE,
  FAR_FROM_SUIT_SIZE as STAGE_SIZE,
  farFromFigureBox,
  farFromStageTier,
} from "../src/lib/far-from-stage.ts";
import {
  FAR_FROM_HALO_WINDOW,
  farFromAccents,
  farFromHaloLight,
  farFromHaloSweep,
} from "../src/lib/far-from-assembly-accents.ts";
import {
  FAR_FROM_FORM_CHAIN,
  FAR_FROM_PALETTE,
  farFromAssemblyConfig,
} from "../src/lib/far-from-assembly-engine.ts";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_UNDERSUIT } from "../src/lib/rexonance-suit.ts";
import { FIRE_TONES } from "../src/lib/rexonance-fire/fire-tuning.js";
import { FAR_FROM_SAGA } from "../src/components/final-stage/final-stage-data.ts";

/* FAR FROM SAGA — the scroll suit-up (2026-10-22). The Rexonance scroll
   engine (src/lib/rexonance-resonance.js) plays FAR FROM's suit, cut from
   the owner's ミドル cutout by scripts/build-far-from-suit.mjs: the same
   sequence (undersuit → fire → burst → nanites → armour), the same wearer's
   undersuit, and FAR FROM's differences as the engine's options — the
   palette, the reactor's pixel squares, two nanite kits, the chain of forms
   to マックス, the 光輪. These pin the data the engine reads, the stage
   geometry the Ultra segment shares, the seam's lazy loading and the still
   tiers, the frames' determinism and closed form, the accents'
   allocation-free passes, the budgets and the page's markup. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => new URL(`../${path}`, import.meta.url);
const page = read("src/components/far-from-saga/far-from-saga.tsx");
const suitup = read("src/components/far-from-saga/far-from-suitup.tsx");
const seam = read("src/lib/far-from-assembly.ts");
const engine = read("src/lib/far-from-assembly-engine.ts");
const accentsSource = read("src/lib/far-from-assembly-accents.ts");
const resonance = read("src/lib/rexonance-resonance.js");
const swarm = read("src/lib/rexonance-assembly-nanites.js");
const sheet = read("src/styles-far-from-suitup.css");
const route = read("src/routes/far-from-saga.tsx");

const pieces = FAR_FROM_SUIT_PIECES.map((piece) => ({
  ...piece,
  preset: FAR_FROM_SUIT_DRIVER.includes(piece.id),
}));
const plan = () =>
  planAssembly({
    size: FAR_FROM_SUIT_SIZE,
    pieces,
    core: FAR_FROM_SUIT_MARKS.core,
    visor: FAR_FROM_SUIT_MARKS.visor,
    maskTile: FAR_FROM_SUIT_TILE,
    tile: 12,
  });

test("the suit is the owner's whole cutout frame at the engine's figure height, in one versioned set", () => {
  assert.deepEqual(FAR_FROM_SUIT_SIZE, STAGE_SIZE);
  assert.equal(FAR_FROM_SUIT_SIZE.height, 1040);
  assert.equal(Math.round(FAR_FROM_CUTOUT.width * FAR_FROM_SUIT_SCALE), FAR_FROM_SUIT_SIZE.width);
  const caps = {
    "figure.webp": 200_000,
    "undersuit.webp": 60_000,
    "driver-standin.webp": 60_000,
    "plates.webp": 300_000,
    "gold.webp": 160_000,
    "guide.webp": 150_000,
    "high.webp": 200_000,
    "xhigh.webp": 200_000,
    "max.webp": 200_000,
  };
  for (const [name, cap] of Object.entries(caps)) {
    const path = file(`public/far-from-suit-20261022/${name}`);
    assert.ok(existsSync(path), name);
    assert.ok(statSync(path).size <= cap, `${name} within ${cap} bytes`);
  }
  for (const src of [
    FAR_FROM_SUIT_FIGURE,
    FAR_FROM_SUIT_UNDERSUIT,
    FAR_FROM_SUIT_ATLAS.src,
    FAR_FROM_SUIT_GOLD_ATLAS.src,
    FAR_FROM_SUIT_GUIDE.src,
    ...Object.values(FAR_FROM_SUIT_FORMS),
  ])
    assert.match(src, /^\/far-from-suit-20261022\//);
  // The owner's cutouts are the sources, kept with the design files.
  for (const stage of ["middle", "high", "xhigh", "max"])
    assert.ok(existsSync(file(`design/far-from-suit-20261022/${stage}.webp`)), stage);
  assert.equal(FAR_FROM_SUIT_ATLAS.width, FAR_FROM_SUIT_GOLD_ATLAS.width);
  assert.equal(FAR_FROM_SUIT_GUIDE.width, FAR_FROM_SUIT_GOLD_ATLAS.width);
  assert.equal(FAR_FROM_SUIT_GUIDE.height, FAR_FROM_SUIT_GOLD_ATLAS.height);
});

test("the plates partition the figure in the engine's groups, every one with its seam and atlas cell", () => {
  const ids = new Set();
  const groups = new Set();
  for (const piece of FAR_FROM_SUIT_PIECES) {
    assert.ok(!ids.has(piece.id), piece.id);
    ids.add(piece.id);
    groups.add(piece.group);
    assert.ok(piece.w > 0 && piece.h > 0 && piece.tiles.length > 0, piece.id);
    assert.ok(
      piece.x >= 0 &&
        piece.y >= 0 &&
        piece.x + piece.w <= FAR_FROM_SUIT_SIZE.width &&
        piece.y + piece.h <= FAR_FROM_SUIT_SIZE.height,
      `${piece.id} inside the figure`,
    );
    assert.ok(
      piece.ax + piece.w <= FAR_FROM_SUIT_ATLAS.width && piece.ay + piece.h <= FAR_FROM_SUIT_ATLAS.height,
      `${piece.id} inside the atlas`,
    );
    assert.ok(["up", "down", "left", "right"].includes(piece.dir), piece.id);
  }
  // The engine's beats: legs, arms, chest and shoulders, waist, the
  // ornaments (the crystal plume, the wings and blades, the bits), the helmet.
  assert.deepEqual(
    [...groups].sort(),
    ["arms", "bits", "chest", "helm", "legs", "ribbon", "shoulders", "tail", "waist"],
  );
  assert.deepEqual([...FAR_FROM_SUIT_ORNAMENTS].sort(), ["bits", "ribbon", "tail"]);
  assert.match(resonance, /\n {2}bits: 4,\n/);
  // The reactor's two plates by the engine's ids; the driver's five on from the start.
  for (const id of ["core-disc", "core-swirl", "helmet-crest", "helmet-visor", "helmet-jaw"])
    assert.ok(ids.has(id), id);
  assert.deepEqual([...FAR_FROM_SUIT_DRIVER].sort(), [
    "belt-jewel",
    "belt-l1",
    "belt-l2",
    "belt-r1",
    "belt-r2",
  ]);
  for (const id of FAR_FROM_SUIT_DRIVER) assert.ok(ids.has(id), id);
  // Six bits, left and right.
  assert.equal(FAR_FROM_SUIT_PIECES.filter((piece) => piece.group === "bits").length, 6);
  // Every non-driver plate has a seam (at most 3 loops, 128 points); gold
  // boxes sit inside their plates.
  for (const piece of FAR_FROM_SUIT_PIECES) {
    if (FAR_FROM_SUIT_DRIVER.includes(piece.id)) continue;
    const seam = FAR_FROM_SUIT_SEAMS[piece.id];
    assert.ok(seam, `${piece.id} seam`);
    const bytes = Buffer.from(seam, "base64");
    const loops = bytes.readInt16LE(0);
    assert.ok(loops >= 1 && loops <= 3, `${piece.id} loops ${loops}`);
    const box = FAR_FROM_SUIT_GOLD_BOXES[piece.id];
    if (box) {
      assert.ok(box[0] >= piece.x && box[1] >= piece.y, piece.id);
      assert.ok(box[0] + box[2] <= piece.x + piece.w + 1e-6 && box[1] + box[3] <= piece.y + piece.h + 1e-6, piece.id);
      assert.ok(FAR_FROM_SUIT_GOLD_CELLS[piece.id], `${piece.id} gold cells`);
    }
  }
  assert.equal(FAR_FROM_SUIT_GOLD_CELL, 4);
  assert.equal(FAR_FROM_SUIT_TILE, 9);
});

test("the same wearer: Rexonance's undersuit stands in the frame with its soles and reactor socket on ミドル's", () => {
  assert.ok(FAR_FROM_SUIT_UNDERSUIT.startsWith("/far-from-suit-20261022/"));
  const build = read("scripts/build-far-from-suit.mjs");
  assert.match(build, /REXONANCE_SUIT_UNDERSUIT/);
  assert.match(build, /REXONANCE_SUIT_MARKS/);
  assert.ok(existsSync(file(`public${REXONANCE_SUIT_UNDERSUIT}`)));
  const place = FAR_FROM_SUIT_UNDERSUIT_PLACE;
  const scale = place.width / 571;
  // Its reactor socket meets the chest core.
  const socketX = place.left + REXONANCE_SUIT_MARKS.core[0] * scale;
  const socketY = place.top + REXONANCE_SUIT_MARKS.core[1] * scale;
  assert.ok(Math.abs(socketX - FAR_FROM_SUIT_MARKS.core[0]) <= 1.5, `socket x ${socketX}`);
  assert.ok(Math.abs(socketY - FAR_FROM_SUIT_MARKS.core[1]) <= 1.5, `socket y ${socketY}`);
  assert.ok(place.top >= 0 && place.top + place.height <= FAR_FROM_SUIT_SIZE.height + 1);
  // The driver stand-in and the reactor read the atlas like Rexonance's.
  assert.match(engine, /preset: FAR_FROM_SUIT_DRIVER\.includes\(id\)/);
  assert.match(engine, /atlas: FAR_FROM_SUIT_ATLAS\.src/);
});

test("the stage geometry: the Ultra segment's first frame is the suit-up's last", () => {
  assert.deepEqual(FAR_FROM_STAGE, FAR_FROM_STAGE_TIERS.desktop);
  assert.equal(FAR_FROM_STAGE.width, 0.92);
  assert.equal(FAR_FROM_STAGE.bottom, 0.035);
  assert.equal(FAR_FROM_STAGE.height, 0.86);
  // farFromFigureBox is the engine's measure (rexonance-resonance.js): the
  // height share, or the width share where the frame is narrow.
  const measure = (cssWidth, cssHeight, { height, width, x, bottom }) => {
    const { width: W, height: H } = STAGE_SIZE;
    const figureHeight = Math.min(cssHeight * height, (cssWidth * width * H) / W);
    const scale = figureHeight / H;
    return { x: cssWidth * x - (W * scale) / 2, y: cssHeight * (1 - bottom) - figureHeight };
  };
  for (const [w, h, tier] of [
    [1440, 840, "desktop"],
    [1024, 700, "tablet"],
    [768, 1000, "portrait"],
    [390, 700, "phone"],
    [320, 600, "narrow"],
  ]) {
    const placement = FAR_FROM_STAGE_TIERS[tier];
    const box = farFromFigureBox(w, h, placement);
    const expected = measure(w, h, placement);
    assert.ok(Math.abs(box.x - expected.x) < 1e-9 && Math.abs(box.y - expected.y) < 1e-9, tier);
    assert.ok(box.width <= w * placement.width + 1e-9, `${tier} within the width share`);
    assert.ok(box.height <= h * placement.height + 1e-9, `${tier} within the height share`);
  }
  assert.equal(farFromStageTier(1440, 900), "desktop");
  assert.equal(farFromStageTier(1024, 768), "tablet");
  assert.equal(farFromStageTier(820, 1180), "portrait");
  assert.equal(farFromStageTier(390, 844), "phone");
  assert.equal(farFromStageTier(320, 568), "narrow");
  // The sheet places the figure by tier with the module's numbers; the
  // frame carries no inline placement (it would pin every tier to the
  // desktop's, as the engine reads the computed properties).
  assert.doesNotMatch(suitup, /\["--rzn-fig-|FAR_FROM_STAGE_VARS|FAR_FROM_STAGE\b/);
  assert.match(suitup, /<div className="rzn-frame">/);
  const { desktop, tablet, phone, narrow } = FAR_FROM_STAGE_TIERS;
  assert.match(
    sheet,
    new RegExp(
      `--rzn-fig-h: ${desktop.height};\\n\\s+--rzn-fig-w: ${desktop.width};\\n\\s+--rzn-fig-x: ${desktop.x};\\n\\s+--rzn-fig-b: ${desktop.bottom};`,
    ),
  );
  assert.match(sheet, new RegExp(`--rzn-fig-h: ${tablet.height};\\n\\s+--rzn-fig-b: ${tablet.bottom};`));
  assert.match(
    sheet,
    new RegExp(
      `--rzn-fig-h: ${phone.height};\\n\\s+--rzn-fig-w: ${phone.width};\\n\\s+--rzn-fig-b: ${phone.bottom};`,
    ),
  );
  assert.match(sheet, new RegExp(`--rzn-fig-h: ${narrow.height};\\n\\s+--rzn-fig-b: ${narrow.bottom};`));
});

test("the beats are the engine's, the HUD has one part per beat, the call is the record's", () => {
  const B = ASSEMBLY_BEATS;
  const beat = (part) => FAR_FROM_ASSEMBLY_BEATS.find((entry) => entry.part === part);
  assert.deepEqual([beat("scan").at, beat("scan").until], B.scan);
  const step = (B.deus[1] - B.deus[0]) / 4;
  ["legs", "arms", "chest", "waist"].forEach((part, index) => {
    assert.ok(Math.abs(beat(part).at - (B.deus[0] + index * step)) < 1e-9, part);
    assert.ok(Math.abs(beat(part).until - (B.deus[0] + (index + 1) * step)) < 1e-9, part);
  });
  assert.deepEqual([beat("bits").at, beat("bits").until], B.rexonance);
  assert.ok(Math.abs(beat("head").at - (B.rexonance[0] + 0.06)) < 1e-9);
  assert.ok(Math.abs(beat("head").until - (B.clamp - 0.012)) < 1e-9);
  assert.deepEqual([beat("seal").at, beat("seal").until], B.seal);
  assert.deepEqual([beat("light").at, beat("light").until], B.light);
  assert.deepEqual([beat("pixels").at, beat("pixels").until], B.pixels);
  assert.deepEqual([beat("forms").at, beat("forms").until], B.form);
  assert.equal(FAR_FROM_ASSEMBLY_PARTS.length, 6);
  assert.deepEqual([...FAR_FROM_ASSEMBLY_PARTS], ["LEGS", "ARMS", "CHEST", "WAIST", "BITS", "HEAD"]);
  assert.equal(FAR_FROM_ASSEMBLY_PHASES.length, 6);
  assert.deepEqual(
    FAR_FROM_ASSEMBLY_PHASES.map((entry) => entry.phase),
    ["prepare", "assemble", "seal", "ignite", "evolve", "complete"],
  );
  // Five lines on the engine's five beats, the record's words verbatim.
  assert.equal(FAR_FROM_SUIT_CALLS.length, 5);
  assert.equal(FAR_FROM_SUIT_CALLS[0], FAR_FROM_SAGA.calls.slice(0, 3).join("\n"));
  assert.deepEqual(FAR_FROM_SUIT_CALLS.slice(1), FAR_FROM_SAGA.calls.slice(3));
  assert.deepEqual(farFromCallUnits(FAR_FROM_SUIT_CALLS[2]), [
    "SA-GA！DEUS！",
    "SA-GA！DEUS！",
    "SA-GA！DEUS！",
    "SA-GA！DEUS！！！",
  ]);
  assert.deepEqual(farFromCallUnits(FAR_FROM_SUIT_CALLS[3]), [
    "FAR FROM！",
    "FAR FROM！",
    "FAR FROM！",
    "FAR FROM！",
  ]);
  assert.deepEqual(farFromCallUnits(FAR_FROM_SUIT_CALLS[4]), ["FAR FROM DEUS！"]);
  assert.deepEqual(farFromCallUnits(FAR_FROM_SUIT_CALLS[0]), [FAR_FROM_SUIT_CALLS[0]]);
  // The runway ends on マックス, the chain's last form; the HUD knows the chain's forms.
  assert.equal(FAR_FROM_ASSEMBLY_FORM, "max");
  assert.deepEqual([...FAR_FROM_FORM_CHAIN], ["high", "xhigh", "max"]);
  assert.equal(assemblyPhase(0.5, "max", true).phase, "assemble");
  assert.equal(assemblyPhase(0.95, "max", true).phase, "evolve");
  assert.deepEqual(assemblyPhase(ASSEMBLY_BEATS.form[1], "max", true), {
    phase: "complete",
    complete: true,
  });
  assert.equal(assemblyPhase(ASSEMBLY_BEATS.form[1], "max", false).complete, false);
});

test("the plan is deterministic and closed-form: every tile lands in its group's beat, bottom first", () => {
  const first = plan();
  const second = plan();
  assert.ok(first.tiles.length > 3000, `${first.tiles.length} tiles`);
  assert.deepEqual(
    first.tiles.map((tile) => [tile.pieceId, tile.t0, tile.t1, tile.beat, tile.tone]),
    second.tiles.map((tile) => [tile.pieceId, tile.t0, tile.t1, tile.beat, tile.tone]),
  );
  const B = ASSEMBLY_BEATS;
  const beatOf = { legs: 0, arms: 1, chest: 2, shoulders: 2, waist: 3, tail: 4, ribbon: 4, bits: 4, helm: 5 };
  const byId = new Map(FAR_FROM_SUIT_PIECES.map((piece) => [piece.id, piece]));
  const step = (B.deus[1] - B.deus[0]) / 4;
  let previous = -1;
  for (const tile of first.tiles) {
    assert.ok(tile.t1 >= previous, "sorted by landing");
    previous = tile.t1;
    if (!tile.pieceId) continue;
    const piece = byId.get(tile.pieceId);
    assert.ok(!FAR_FROM_SUIT_DRIVER.includes(tile.pieceId), "the driver never assembles");
    const beat = beatOf[piece.group];
    assert.equal(tile.beat, beat, tile.pieceId);
    const window =
      beat <= 3
        ? [B.deus[0] + beat * step, B.deus[0] + (beat + 1) * step]
        : beat === 4
          ? B.rexonance
          : [B.rexonance[0] + 0.06, B.clamp - 0.012];
    assert.ok(tile.t0 >= window[0] - 1e-9 && tile.t1 <= window[1] + 1e-9, `${tile.pieceId} ${tile.t0}`);
  }
  // Six beats, each landing something; the helmet last, before the pixels.
  assert.equal(first.partDone.length, 6);
  for (let beat = 0; beat < 6; beat += 1) assert.ok(first.partDone[beat] > 0, `beat ${beat}`);
  assert.ok(first.partDone[5] < B.pixels[0]);
  assert.ok(first.partDone[4] <= B.rexonance[1] + 1e-9);
  // Within the ornaments' beat the plume lands before the wings, the bits last.
  const landing = (group) =>
    Math.min(
      ...first.tiles.filter((tile) => tile.pieceId && byId.get(tile.pieceId).group === group).map((t) => t.t0),
    );
  assert.ok(landing("tail") < landing("ribbon") && landing("ribbon") < landing("bits"));
  // Pixel squares for the eyes and the reactor, deterministic, inside the outlines.
  const eyes = glowPixels(FAR_FROM_SUIT_FACE_GLOW, FAR_FROM_SUIT_MARKS.visor);
  const reactor = glowPixels(FAR_FROM_SUIT_REACTOR_GLOW, FAR_FROM_SUIT_MARKS.core, 2011, 96);
  assert.equal(eyes.length, 120);
  assert.equal(reactor.length, 96);
  assert.deepEqual(reactor, glowPixels(FAR_FROM_SUIT_REACTOR_GLOW, FAR_FROM_SUIT_MARKS.core, 2011, 96));
  for (const square of reactor)
    assert.ok(
      Math.hypot(square.x - FAR_FROM_SUIT_MARKS.core[0], square.y - FAR_FROM_SUIT_MARKS.core[1]) < 32,
      "inside the reactor",
    );
  assert.match(resonance, /drawPixelBurst\(context, buffers\.reactorFaces, config\.core\[0\], config\.core\[1\], fill, burst\)/);
});

test("the config is the engine's: FAR FROM's palette, reactor, chain, kits and accents; Rexonance's defaults untouched", () => {
  const config = farFromAssemblyConfig();
  assert.equal(config.figure, FAR_FROM_SUIT_FIGURE);
  assert.equal(config.undersuit, FAR_FROM_SUIT_UNDERSUIT);
  assert.deepEqual(config.size, FAR_FROM_SUIT_SIZE);
  assert.equal(config.pieces.length, FAR_FROM_SUIT_PIECES.length);
  assert.equal(config.reactorGlow, FAR_FROM_SUIT_REACTOR_GLOW);
  assert.equal(config.reactorRadius, 30);
  // The fire ends gold: the shared fire's end tone, passed to every draw.
  assert.equal(config.fireTone, FIRE_TONES.gold);
  assert.match(resonance, /const FIRE_TONE = config\.fireTone \?\? 0;/);
  assert.equal((resonance.match(/, FIRE_TONE\)/g) || []).length, 3);
  assert.equal(config.palette, FAR_FROM_PALETTE);
  assert.equal(config.accents, farFromAccents);
  assert.deepEqual(config.forms.chain, FAR_FROM_FORM_CHAIN);
  for (const key of FAR_FROM_FORM_CHAIN) {
    assert.equal(config.forms[key], FAR_FROM_SUIT_FORMS[key], key);
    assert.match(config.forms.tones[key], /^#[0-9a-f]{6}$/, key);
  }
  assert.equal(config.forms.tones.max, FAR_FROM_SAGA.stages.max.accent);
  // The palette: ice, gold, white — the kit's gold row for the second tone.
  assert.deepEqual(FAR_FROM_PALETTE.tones[1], [255, 215, 122]);
  assert.deepEqual(FAR_FROM_PALETTE.nanites.toneRows, [0, 3, 2]);
  assert.equal(FAR_FROM_PALETTE.field.pink[0], 1);
  // The engine's defaults are Rexonance's when no palette is given.
  const defaults = assemblyPalette();
  assert.deepEqual(defaults.tones[1], [255, 143, 216]);
  assert.equal(defaults.toneCss[0], "rgb(121 232 255)");
  assert.equal(defaults.field, null);
  assert.equal(defaults.nanites, null);
  const own = assemblyPalette(FAR_FROM_PALETTE);
  assert.equal(own.toneCss[1], "rgb(255 215 122)");
  assert.equal(own.rings[2], "rgb(255 215 122)");
  // Two kits through one sprite path: each chip's kit by its hash, made
  // outside the draw passes; kit A stands in for kit B until it lands.
  assert.match(swarm, /const KITOF = new Uint8Array\(total \+ 1\);/);
  assert.ok(swarm.indexOf("const KITOF") < swarm.indexOf("/* -- draw passes: allocation-free from here -- */"));
  assert.match(swarm, /const sheet = second \? cellsB : cells;/);
  assert.match(engine, /cellsB: kitB\.FAR_FROM_NANITE_CELLS/);
  assert.match(engine, /import\("\.\/far-from-nanites\.ts"\)/);
  assert.match(engine, /guide: FAR_FROM_SUIT_GUIDE/);
  assert.match(engine, /seams: FAR_FROM_SUIT_SEAMS/);
  assert.match(resonance, /optional\(kit\?\.cellsB\?\.src\)/);
  // The field's tones only where a palette names them.
  assert.match(resonance, /\.\.\.\(palette\.field \? \{ tones: palette\.field \} : \{\}\)/);
});

test("the accents (the 光輪) are closed-form, reversible and allocation-free, and gone before the runway ends", () => {
  const from = accentsSource.indexOf("/* -- draw passes: allocation-free from here -- */");
  const to = accentsSource.indexOf("/* -- end of the draw passes -- */");
  assert.ok(from > 0 && to > from);
  const passes = accentsSource.slice(from, to);
  assert.doesNotMatch(
    passes,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|\.setTransform\(|\.save\(/,
  );
  assert.equal(farFromHaloSweep(0.5, 0), 0);
  assert.equal(farFromHaloSweep(1, 0), 1);
  assert.ok(farFromHaloSweep(0.92, 0) > farFromHaloSweep(0.92, 2), "the inner ring opens first");
  assert.equal(farFromHaloLight(0.9), 1);
  assert.equal(farFromHaloLight(ASSEMBLY_BEATS.form[1]), 0);
  assert.ok(FAR_FROM_HALO_WINDOW.fade[1] < ASSEMBLY_BEATS.form[1]);
  assert.ok(FAR_FROM_HALO_WINDOW.open[0] >= ASSEMBLY_BEATS.light[0] - 0.01);
  // A frame is a function of the progress alone: the same calls whatever
  // came before, forward or back.
  const record = () => {
    const log = [];
    const round = (value) => (typeof value === "number" ? Math.round(value * 1000) / 1000 : value);
    const context = new Proxy(
      {},
      {
        get: (_, key) => (...args) => log.push(`${String(key)}(${args.map(round).join(",")})`),
        set: (_, key, value) => {
          log.push(`${String(key)}=${round(value)}`);
          return true;
        },
      },
    );
    return { log, context };
  };
  const frame = (progress) => {
    const { log, context } = record();
    farFromAccents.back(context, progress, false, STAGE_SIZE.width, STAGE_SIZE.height);
    farFromAccents.front(context, progress, false, STAGE_SIZE.width, STAGE_SIZE.height);
    return log.join("\n");
  };
  const forward = [0.9, 0.92, 0.94].map(frame);
  const backward = [0.94, 0.92, 0.9].map(frame).reverse();
  assert.deepEqual(forward, backward);
  assert.ok(forward[1].includes("ellipse("), "the rings are drawn");
  assert.equal(frame(0.5), "", "nothing before the ignition");
  assert.equal(frame(1), "", "nothing at the runway's end");
});

const environmentFor = ({ reduced = false, forced = false, economy = false, saveData = false } = {}) => {
  const listeners = new Map();
  const list = (matches) => ({
    matches,
    addEventListener: (type, handler) => listeners.set(handler, type),
    removeEventListener: (type, handler) => listeners.delete(handler),
  });
  const html = { dataset: economy ? { worldEffects: "economy" } : {} };
  const host = { dataset: {}, ownerDocument: { documentElement: html } };
  const idle = [];
  const environment = {
    matchMedia: (query) => list(query.includes("reduced-motion") ? reduced : forced),
    navigator: { connection: { saveData, effectiveType: "4g" } },
    requestIdleCallback: (callback) => idle.push(callback) && idle.length,
    cancelIdleCallback: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  return { environment, host, html, idle, listeners };
};

test("the seam imports the engine chunk only under the motion gate, in idle time, and the still tiers download nothing", async () => {
  // Reduced motion: the still (data-rzn-load="static"), no import.
  for (const tier of [{ reduced: true }, { forced: true }, { economy: true }, { saveData: true }]) {
    const { environment, host, idle } = environmentFor(tier);
    let loads = 0;
    const dispose = mountFarFromAssembly(host, {
      environment,
      load: async () => {
        loads += 1;
        return { mountFarFromAssemblyEngine: () => () => {} };
      },
    });
    assert.equal(host.dataset.rznLoad, "static", JSON.stringify(tier));
    assert.equal(idle.length, 0, "no idle work");
    dispose();
    assert.equal(loads, 0);
    assert.equal(host.dataset.rznLoad, undefined, "the mark is cleared");
  }
  // Motion allowed: waiting, then the import in idle time, then the engine's mount.
  const { environment, host, idle } = environmentFor();
  let mounted = 0;
  let disposed = 0;
  const dispose = mountFarFromAssembly(host, {
    environment,
    load: async () => ({
      mountFarFromAssemblyEngine: (runway) => {
        mounted += 1;
        assert.equal(runway, host);
        return () => {
          disposed += 1;
        };
      },
    }),
  });
  assert.equal(host.dataset.rznLoad, "waiting");
  assert.equal(mounted, 0, "nothing on the startup path");
  assert.equal(idle.length, 1);
  idle[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mounted, 1);
  dispose();
  assert.equal(disposed, 1);
  // The page keeps the import off its own chunk: the seam loads the engine.
  assert.match(seam, /import\("\.\/far-from-assembly-engine"\)/);
  assert.doesNotMatch(seam, /from "\.\/(?:rexonance-|far-from-suit|far-from-assembly-engine)/);
  assert.match(page, /import \{ FarFromSuitUp \} from "\.\/far-from-suitup"/);
  assert.doesNotMatch(page, /far-from-assembly-engine|rexonance-resonance/);
  assert.doesNotMatch(suitup, /far-from-assembly-engine|rexonance-resonance/);
});

test("the engine mounts FAR FROM's config on the runway and keeps the still on the quiet tiers (as Rexonance's)", async () => {
  // The engine with a reduced-motion environment: static, nothing fetched.
  const { environment, html } = environmentFor({ reduced: true });
  const made = [];
  const runway = {
    ownerDocument: {
      documentElement: html,
      hidden: false,
      readyState: "complete",
      addEventListener() {},
      removeEventListener() {},
      createElement: (tag) => {
        made.push(tag);
        return { getContext: () => null, style: {} };
      },
    },
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    querySelector: (selector) =>
      selector === "canvas.rzn-canvas"
        ? { getContext: () => null, width: 0, height: 0 }
        : selector === ".rzn-frame"
          ? { clientWidth: 0, clientHeight: 0 }
          : null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    hasAttribute: () => false,
    setAttribute() {},
    removeAttribute() {},
  };
  const window = {
    ...environment,
    addEventListener() {},
    removeEventListener() {},
    Image: class {},
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const dispose = mountRexonanceAssembly(runway, farFromAssemblyConfig(), window);
  assert.equal(runway.dataset.rznLoad, "static");
  assert.equal(made.length, 0, "nothing prepared on the still tier");
  dispose();
  assert.equal(runway.dataset.rznLoad, undefined);
});

test("budgets and the touch tier are the engine's; the markup is the Rexonance runway's, FAR FROM's words", () => {
  assert.equal(ASSEMBLY_TOUCH_ART_BUDGET, 64);
  assert.match(resonance, /touchArtBudget: ASSEMBLY_TOUCH_ART_BUDGET/);
  assert.match(resonance, /const tile = coarse\.matches \? 15 : 12;/);
  assert.match(resonance, /coarse\.matches \? null : optional\(kit\?\.comets\?\.src\)/);
  // The markup the engine reads: the frame, the layers, the lines, the
  // parts, the read-outs, the stamp; the form the runway ends on.
  for (const needle of [
    'className="ffs-runway rzn-suitup"',
    'data-form={FAR_FROM_ASSEMBLY_FORM}',
    'className="rzn-frame"',
    'className="rzn-still"',
    'className="rzn-under"',
    'className="rzn-driver-standin"',
    'className="rzn-canvas"',
    'className="rzn-line"',
    'className="rzn-chip"',
    'className="rzn-part"',
    'className="rzn-percent"',
    'className="rzn-count"',
    'className="rzn-stamp"',
    'src={FAR_FROM_SUIT_FORMS.max}',
    'src={FAR_FROM_SUIT_UNDERSUIT}',
    'src={FAR_FROM_SUIT_DRIVER_STANDIN}',
    "{FAR_FROM_SAGA.stages.max.code}",
    "FAR_FROM_ASSEMBLY_PARTS.map((part)",
    "FAR_FROM_ASSEMBLY_PHASES.map(",
    'role="status" aria-live="polite"',
    'aria-label="変身音声"',
    "rexonance:assembly-retry",
  ])
    assert.ok(suitup.includes(needle), needle);
  assert.match(suitup, /useEffect\(\(\) => mountFarFromAssembly\(runwayRef\.current\), \[\]\)/);
  // The sheet: scoped to the page, the pinned runway under the persistent
  // preferences, the still tiers unpinned, the canvas shown only live.
  assert.doesNotMatch(sheet, /rxs-rexonance-page/);
  const flatSheet = sheet.replace(/\s+/g, " ");
  assert.match(
    flatSheet,
    /@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\) \{ html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-rzn-constrained\]\) body \.rxs-page\.ffs-page \.rzn-suitup \{[^}]*height: max\(2400px, 420svh\);/,
  );
  assert.match(flatSheet, /position: sticky; top: var\(--dxs-nav\);/);
  assert.match(
    flatSheet,
    /\.rzn-suitup\[data-rzn-state="live"\] > \.rzn-frame > \.rzn-canvas \{ display: block;/,
  );
  // The STAGE tokens the runway reads are its own on this route.
  assert.match(flatSheet, /\.ffs-page :is\(\.ffs-suitup, \.rzn-suitup\) \{ --dxs-nav: var\(--rxs-local-nav-reserve, 62px\);/);
  assert.match(sheet, /--rzn-gold: 255 215 122;/);
  assert.match(route, /styles-far-from-suitup\.css\?url/);
  assert.ok(route.indexOf("farFromSagaCssUrl }") < route.indexOf("farFromSuitupCssUrl }"));
  // No AI-sounding copy: the section's words are plain.
  for (const source of [suitup, seam]) assert.doesNotMatch(source, /静かに|眠る|記録が|物語|輝きを放つ/);
});

test("the runway's assistive script stays visually hidden on this page", () => {
  const sheet = readFileSync(new URL("../src/styles-far-from-suitup.css", import.meta.url), "utf8");
  assert.match(sheet, /\.ffs-page \.ffs-assembly-guide \.rxk-sr \{[^}]*clip-path: inset\(50%\)/);
});
