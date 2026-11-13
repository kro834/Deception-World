#!/usr/bin/env node
// Rexonance's form burst over the 03 panel (owner, 2026-11-13: 「ウルトラに
// 切り替えた時に肩などのパーツが変わらない」): the panel's three paintings are
// whole pictures with no alpha, and the play knew their figure only from
// hand-placed capsules. ULTRA's pauldrons, horns and ribbons reach well past
// them, and what lay outside was never burned, broken or built — it was cut
// over to the new painting, or held the old one to the end. This bakes the
// figure's matte from the paintings themselves: the union of the three
// forms' figures (whatever the form, a point of any of them is built), so
// the play transforms every part of either form.
//
//   node scripts/build-rexonance-form-burst-matte.mjs [--check]
//
// writes src/lib/rexonance-form-burst-matte.ts: a 1-bit matte (base64,
// row-major, MSB first) in the paintings' frame. The stage's chunk alone
// imports it (the page fetches it with the play). --check writes nothing and
// requires the committed matte to be the bake's, bit for bit.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const OUT = "src/lib/rexonance-form-burst-matte.ts";
const PAINTINGS = [
  "public/rider-rexonance-saga-pickup-20260923.webp",
  "public/rider-rexonance-max-20260923.webp",
  "public/rider-rexonance-ultra-20260923.webp",
];
/** The working size (a quarter of the 1086 x 1448 paintings) and the matte's. */
const WORK = { width: 272, height: 362 };
const MATTE = { width: 96, height: 128 };

const N = WORK.width * WORK.height;
const at = (x, y) => y * WORK.width + x;

/** The figure's colour in one painting: lit armour, gold, the ribbons'
 * colour — not the dark ground, its stars or the thin orbit lines (an
 * opening takes those). */
async function figureOf(path) {
  const { data } = await sharp(root(path))
    .removeAlpha()
    .resize(WORK.width, WORK.height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(N);
  for (let n = 0; n < N; n += 1) {
    const r = data[n * 3] / 255;
    const g = data[n * 3 + 1] / 255;
    const b = data[n * 3 + 2] / 255;
    const v = Math.max(r, g, b);
    const s = (v - Math.min(r, g, b)) / Math.max(v, 1e-3);
    mask[n] = (v > 0.32 && s > 0.2) || v > 0.55 ? 1 : 0;
  }
  return mask;
}

/** A square min (erode) or max (dilate) of radius `r`. */
function morph(mask, r, max) {
  const pass = (source, horizontal) => {
    const out = new Uint8Array(N);
    for (let y = 0; y < WORK.height; y += 1)
      for (let x = 0; x < WORK.width; x += 1) {
        let value = max ? 0 : 1;
        for (let k = -r; k <= r; k += 1) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          const inside = xx >= 0 && yy >= 0 && xx < WORK.width && yy < WORK.height;
          const s = inside ? source[at(xx, yy)] : 0;
          if (max ? s : !s) {
            value = max ? 1 : 0;
            break;
          }
        }
        out[at(x, y)] = value;
      }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Floods from `seeds` through set pixels (4-neighbours). */
function flood(mask, seeds) {
  const seen = new Uint8Array(N);
  const stack = [];
  for (const n of seeds)
    if (mask[n] && !seen[n]) {
      seen[n] = 1;
      stack.push(n);
    }
  while (stack.length) {
    const n = stack.pop();
    const x = n % WORK.width;
    const y = (n - x) / WORK.width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= WORK.width || yy >= WORK.height) continue;
      const m = at(xx, yy);
      if (mask[m] && !seen[m]) {
        seen[m] = 1;
        stack.push(m);
      }
    }
  }
  return seen;
}

export async function bakeMatte() {
  let union = new Uint8Array(N);
  for (const path of PAINTINGS) {
    // Each painting's figure, opened (stars, thin lines out) and closed.
    let mask = await figureOf(path);
    mask = morph(morph(mask, 1, false), 1, true);
    for (let n = 0; n < N; n += 1) union[n] |= mask[n];
  }
  // The dark plates between the lit ones, closed in; then the holes filled.
  union = morph(morph(union, 4, true), 4, false);
  const border = [];
  for (let x = 0; x < WORK.width; x += 1) border.push(at(x, 0), at(x, WORK.height - 1));
  for (let y = 0; y < WORK.height; y += 1) border.push(at(0, y), at(WORK.width - 1, y));
  const outside = flood(
    union.map((v) => 1 - v),
    border,
  );
  for (let n = 0; n < N; n += 1) union[n] = outside[n] ? 0 : 1;
  // The figure is the piece about the reactor (the chest): stray nebula
  // and orbit fragments elsewhere are not.
  const figure = flood(union, [at(Math.round(0.578 * WORK.width), Math.round(0.335 * WORK.height))]);
  // Down to the matte's size: a cell is the figure where most of it is.
  const bits = new Uint8Array((MATTE.width * MATTE.height) / 8);
  let count = 0;
  for (let y = 0; y < MATTE.height; y += 1)
    for (let x = 0; x < MATTE.width; x += 1) {
      const x0 = Math.floor((x * WORK.width) / MATTE.width);
      const x1 = Math.floor(((x + 1) * WORK.width) / MATTE.width);
      const y0 = Math.floor((y * WORK.height) / MATTE.height);
      const y1 = Math.floor(((y + 1) * WORK.height) / MATTE.height);
      let on = 0;
      let all = 0;
      for (let yy = y0; yy < y1; yy += 1)
        for (let xx = x0; xx < x1; xx += 1) {
          on += figure[at(xx, yy)];
          all += 1;
        }
      if (on * 2 >= all) {
        const n = y * MATTE.width + x;
        bits[n >> 3] |= 0x80 >> (n & 7);
        count += 1;
      }
    }
  return { bits, count };
}

const { bits, count } = await bakeMatte();
const source = `// Generated by scripts/build-rexonance-form-burst-matte.mjs — do not edit.
// The 03 panel paintings' figure (the union of Rexonance's, MAX's and
// ULTRA's), for the form burst's field: ${MATTE.width} x ${MATTE.height}, 1 bit a
// cell (row-major, most significant bit first), ${count} cells set.
export const FORM_BURST_PANEL_MATTE = {
  width: ${MATTE.width},
  height: ${MATTE.height},
  bits: "${Buffer.from(bits).toString("base64")}",
} as const;
`;
if (process.argv.includes("--check")) {
  const committed = readFileSync(root(OUT), "utf8");
  if (committed !== source) {
    console.error(`${OUT} is not the bake's: run node scripts/build-rexonance-form-burst-matte.mjs`);
    process.exit(1);
  }
  console.log(`${OUT}: matches (${count} cells)`);
} else {
  writeFileSync(root(OUT), source);
  console.log(`wrote ${OUT} (${count} cells)`);
}
