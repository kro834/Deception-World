import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import {
  createReactorLayers,
  deferReactorPieces,
  drawReactorFormation,
  repaintReactorArt,
} from "../src/lib/rexonance-reactor-scroll.js";
import {
  reactorCoilAngle,
  reactorCoilScale,
  reactorFormation,
} from "../src/lib/rexonance-reactor.js";

function recorder() {
  const operations = [];
  const context = {
    operations,
    beginPath: () => operations.push(["beginPath"]),
    closePath: () => operations.push(["closePath"]),
    clip: () => operations.push(["clip"]),
    drawImage: (...args) => operations.push(["drawImage", ...args]),
    moveTo: (...args) => operations.push(["moveTo", ...args]),
    arc: (...args) => operations.push(["arc", ...args]),
    restore: () => operations.push(["restore"]),
    rotate: (...args) => operations.push(["rotate", ...args]),
    save: () => operations.push(["save"]),
    scale: (...args) => operations.push(["scale", ...args]),
    translate: (...args) => operations.push(["translate", ...args]),
  };
  for (const property of ["globalAlpha", "globalCompositeOperation"]) {
    let value = property === "globalAlpha" ? 1 : "source-over";
    Object.defineProperty(context, property, {
      get: () => value,
      set(next) {
        value = next;
        operations.push([property, next]);
      },
    });
  }
  return context;
}

function canvasDocument() {
  const canvases = [];
  return {
    canvases,
    document: {
      createElement(name) {
        assert.equal(name, "canvas");
        const context = recorder();
        const canvas = {
          kind: `canvas-${canvases.length}`,
          width: 0,
          height: 0,
          getContext(type) {
            assert.equal(type, "2d");
            return context;
          },
        };
        canvas.context = context;
        canvases.push(canvas);
        return canvas;
      },
    },
  };
}

const pieces = REXONANCE_SUIT_PIECES;
const corePieces = pieces.filter((piece) => ["core-disc", "core-swirl"].includes(piece.id));
const atlas = { kind: "atlas" };
const art = { kind: "figure-art" };
const undersuit = { kind: "undersuit" };

test("reactor sheets crop only the two exact atlas masks and retain the dark socket", () => {
  const { document, canvases } = canvasDocument();
  const layers = createReactorLayers({
    document,
    pieces,
    atlas,
    art,
    undersuit,
    size: REXONANCE_SUIT_SIZE,
  });

  assert.ok(layers);
  const x = Math.min(...corePieces.map((piece) => piece.x));
  const y = Math.min(...corePieces.map((piece) => piece.y));
  const right = Math.max(...corePieces.map((piece) => piece.x + piece.w));
  const bottom = Math.max(...corePieces.map((piece) => piece.y + piece.h));
  assert.deepEqual(
    { x: layers.x, y: layers.y, w: layers.w, h: layers.h },
    { x, y, w: Math.ceil(right - x), h: Math.ceil(bottom - y) },
  );
  assert.equal(layers.x, 227);
  assert.equal(layers.y, 218);
  assert.equal(layers.w, 115);
  assert.equal(layers.h, 139);
  assert.equal(canvases.length, 3);
  assert.deepEqual(
    canvases.map(({ width, height }) => [width, height]),
    [
      [layers.w, layers.h],
      [layers.w, layers.h],
      [layers.w, layers.h],
    ],
  );

  const atlasDraws = corePieces
    .flatMap((p) => (p.id === "core-disc" ? layers.disc : layers.art).context.operations)
    .filter(([operation, source]) => operation === "drawImage" && source === atlas);
  assert.equal(atlasDraws.length, 2);
  assert.deepEqual(
    atlasDraws.map(([, , sx, sy, sw, sh, dx, dy, dw, dh]) => [sx, sy, sw, sh, dx, dy, dw, dh]),
    corePieces.map((piece) => [
      piece.ax,
      piece.ay,
      piece.w,
      piece.h,
      piece.x - x,
      piece.y - y,
      piece.w,
      piece.h,
    ]),
  );

  const socketOps = canvases[1].context.operations;
  assert.deepEqual(
    socketOps.filter(([operation]) => operation === "drawImage").map(([, source]) => source),
    [layers.art, layers.disc, undersuit],
  );
  assert.ok(
    socketOps.some(
      ([operation, value]) => operation === "globalCompositeOperation" && value === "source-in",
    ),
  );
  assert.equal(canvases[1].context.globalCompositeOperation, "source-over");
});

test("repainting preserves the atlas silhouette and restores the canvas compositing mode", () => {
  const { document } = canvasDocument();
  const layers = createReactorLayers({
    document,
    pieces,
    atlas,
    art,
    undersuit,
    size: REXONANCE_SUIT_SIZE,
  });
  const replacement = { kind: "unlit-art" };
  const context = layers.art.context;
  const before = context.operations.length;

  repaintReactorArt(layers, replacement, REXONANCE_SUIT_SIZE);

  assert.deepEqual(context.operations.slice(before), [
    ["globalCompositeOperation", "source-in"],
    [
      "drawImage",
      replacement,
      0,
      0,
      REXONANCE_SUIT_SIZE.width,
      REXONANCE_SUIT_SIZE.height,
      -layers.x,
      -layers.y,
      REXONANCE_SUIT_SIZE.width,
      REXONANCE_SUIT_SIZE.height,
    ],
    ["globalCompositeOperation", "source-over"],
  ]);
  assert.equal(context.globalCompositeOperation, "source-over");
});

test("deferring the coil and disc leaves source config untouched and every other piece identical", () => {
  const original = pieces.map((piece) => ({ ...piece }));
  const before = JSON.stringify(original);
  const deferred = deferReactorPieces(original);

  assert.notEqual(deferred, original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(deferred.length, original.length);
  for (let index = 0; index < original.length; index += 1) {
    const isReactor = ["core-disc", "core-swirl"].includes(original[index].id);
    if (isReactor) {
      assert.notEqual(deferred[index], original[index]);
      assert.equal(deferred[index].preset, true);
      const { preset: _preset, ...piece } = deferred[index];
      assert.deepEqual(piece, original[index]);
    } else {
      assert.equal(deferred[index], original[index]);
    }
  }
});

function formationOperations(layers, u) {
  const context = recorder();
  drawReactorFormation(context, layers, [284, 275], u);
  return context.operations;
}

test("coil formation records reversible rotation, scale and wedge reveal, ending at registered art pose", () => {
  const layers = {
    x: 227,
    y: 218,
    w: 115,
    h: 139,
    art: { kind: "coil-art" },
    disc: { kind: "fixed-disc" },
    socket: { kind: "coil-socket" },
  };
  const start = formationOperations(layers, 0);
  assert.ok(
    start.some(([operation, source]) => operation === "drawImage" && source === layers.socket),
  );
  assert.ok(!start.some(([operation]) => ["rotate", "scale", "clip"].includes(operation)));

  const middle = formationOperations(layers, 0.5);
  assert.ok(
    middle.some(
      ([operation, ...args]) => operation === "translate" && args[0] === 284 && args[1] === 275,
    ),
  );
  assert.ok(
    middle.some(([operation, angle]) => operation === "rotate" && angle === reactorCoilAngle(0.5)),
  );
  assert.ok(
    middle.some(
      ([operation, sx, sy]) =>
        operation === "scale" && sx === reactorCoilScale(0.5) && sy === reactorCoilScale(0.5),
    ),
  );
  assert.ok(middle.some(([operation]) => operation === "clip"));
  const discDraw = middle.findIndex(
    ([operation, source]) => operation === "drawImage" && source === layers.disc,
  );
  const coilDraw = middle.findIndex(
    ([operation, source]) => operation === "drawImage" && source === layers.art,
  );
  assert.ok(discDraw > coilDraw);
  assert.deepEqual(
    middle.slice(coilDraw + 1, discDraw),
    [["restore"], ["save"], ["globalAlpha", reactorFormation(0.5)]],
    "disc must be drawn outside every coil transform and clip",
  );
  assert.deepEqual(middle[discDraw], [
    "drawImage",
    layers.disc,
    layers.x,
    layers.y,
    layers.w,
    layers.h,
  ]);
  const wedge = middle.find(([operation]) => operation === "arc");
  assert.ok(wedge);
  assert.equal(wedge[4], -Math.PI / 2);
  assert.equal(wedge[5], -Math.PI / 2 + Math.PI * 2 * reactorFormation(0.5));
  const farthestCorner = Math.max(
    Math.hypot(layers.x - 284, layers.y - 275),
    Math.hypot(layers.x + layers.w - 284, layers.y - 275),
    Math.hypot(layers.x - 284, layers.y + layers.h - 275),
    Math.hypot(layers.x + layers.w - 284, layers.y + layers.h - 275),
  );
  assert.ok(wedge[3] > farthestCorner);

  const complete = formationOperations(layers, 1);
  assert.ok(!complete.some(([operation]) => operation === "clip"));
  assert.ok(complete.some(([operation, angle]) => operation === "rotate" && angle === 0));
  assert.ok(complete.some(([operation, sx, sy]) => operation === "scale" && sx === 1 && sy === 1));
  assert.ok(
    complete.some(
      ([operation, source, dx, dy, width, height]) =>
        operation === "drawImage" &&
        source === layers.art &&
        dx === layers.x - 284 &&
        dy === layers.y - 275 &&
        width === layers.w &&
        height === layers.h,
    ),
  );

  const forward = [0, 0.25, 0.5, 0.75, 1].map((u) => formationOperations(layers, u));
  const reverseAndReplay = [1, 0.75, 0.5, 0.25, 0]
    .reverse()
    .map((u) => formationOperations(layers, u));
  assert.deepEqual(reverseAndReplay, forward);
});

test("live scroll uses one shared reactor clock and only defers pieces when crop preparation succeeds", () => {
  const source = readFileSync(
    new URL("../src/lib/rexonance-resonance.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const planningPieces = nextReactor \? deferReactorPieces\(config\.pieces\) : config\.pieces/,
  );
  assert.ok((source.match(/pieces: planningPieces/g) ?? []).length >= 2);
  assert.match(
    source,
    /drawReactorFormation\(context, reactor, config\.core, span\(progress, REACTOR_SWIRL\)\)/,
  );
});
