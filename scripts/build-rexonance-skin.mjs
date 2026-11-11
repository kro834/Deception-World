#!/usr/bin/env node
// Rexonance's skin (owner, 2026-11-11): the growth field the suit-up's
// liquid-metal front is compared against (src/lib/rexonance-suit-skin.ts),
// baked from the figure's own alpha and the suit's plates by
// src/lib/rexonance-suit-skin-field.ts. Reproducible:
//
//   node scripts/build-rexonance-skin.mjs [--check] [--debug=<dir>]
//
// writes public/rexonance-skin-20261111/field.png: an opaque RGB picture a
// third of the figure's size — R the field (dithered to 8 bits), G the veins,
// B the armour's mask (the body, the head, and their dilated edges).
// --check writes nothing and requires the committed picture's pixels to be
// the bake's, value for value. --debug=<dir> also writes the three channels
// side by side, enlarged.
//
// It also writes src/lib/rexonance-suit-skin-marks.ts: when the front
// reaches each of the HUD's parts (the middle of the part's own plates on
// the field), on the entry's clock and on the scroll's, so each label lights
// with the armour it names. Numbers only: the pages import it without the
// skin's chunk.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
} from "../src/lib/rexonance-suit.ts";
import {
  SKIN_FIELD_SIZE,
  buildSkinField,
  skinRegions,
} from "../src/lib/rexonance-suit-skin-field.ts";
import { SKIN_ENTRY, SKIN_SCROLL, skinReach } from "../src/lib/rexonance-suit-skin.ts";
import { REXONANCE_SUIT_PARTS } from "../src/lib/rexonance-calls.ts";
import { ASSEMBLY_PARTS } from "../src/lib/rexonance-resonance.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKIN_FIELD_FILE = "public/rexonance-skin-20261111/field.png";

/** The bake's input from the committed figure. */
export async function skinFieldInput() {
  const { width: w, height: h } = SKIN_FIELD_SIZE;
  const alpha = await sharp(join(root, "public", REXONANCE_SUIT_FIGURE))
    .ensureAlpha()
    .resize(w, h, { fit: "fill", kernel: "linear" })
    .extractChannel(3)
    .raw()
    .toBuffer();
  const k = w / REXONANCE_SUIT_SIZE.width;
  const at = ([x, y]) => [x * k, y * k];
  const { core, visor, belt, joints } = REXONANCE_SUIT_MARKS;
  return {
    w,
    h,
    alpha: new Uint8Array(alpha),
    region: skinRegions(
      REXONANCE_SUIT_PIECES,
      REXONANCE_SUIT_TILE,
      REXONANCE_SUIT_SIZE.width,
      w,
      h,
    ),
    core: at(core),
    visor: at(visor),
    // The satellites: the driver, the shoulders, the knees.
    satellites: [
      [...at(belt), 0.05],
      [...at(joints[1]), 0.14],
      [...at(joints[2]), 0.14],
      [...at(joints[5]), 0.4],
      [...at(joints[6]), 0.4],
    ],
  };
}

export async function bakeSkinField() {
  return buildSkinField(await skinFieldInput());
}

export const SKIN_MARKS_FILE = "src/lib/rexonance-suit-skin-marks.ts";
/** The plates' groups each HUD part names (rexonance-resonance.js
 * BEAT_OF_GROUP: the chest's label is the shoulders' too, the tail's the
 * ribbons'). */
export const SKIN_PART_GROUPS = {
  LEGS: ["legs"],
  ARMS: ["arms"],
  CHEST: ["chest", "shoulders"],
  WAIST: ["waist"],
  TAIL: ["tail", "ribbon"],
  HEAD: ["helm"],
};
/** The marks from a bake: each part's reach (the median field value of its
 * plates' cells; the helmet's on the head's field) and when the front's lip
 * is there on each clock. */
export function skinMarks(bake) {
  const { w, h } = bake;
  const k = w / REXONANCE_SUIT_SIZE.width;
  const tile = REXONANCE_SUIT_TILE;
  const owner = new Array(w * h).fill("");
  // Front plates first: the first plate over a cell names it (skinRegions).
  for (const piece of REXONANCE_SUIT_PIECES) {
    const bits = Uint8Array.from(atob(piece.tiles), (c) => c.charCodeAt(0));
    const cols = Math.ceil(piece.w / tile);
    const rows = Math.ceil(piece.h / tile);
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        const bit = row * cols + col;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        const x0 = Math.max(0, Math.floor((piece.x + col * tile) * k));
        const y0 = Math.max(0, Math.floor((piece.y + row * tile) * k));
        const x1 = Math.min(w, Math.ceil(Math.min(piece.x + piece.w, piece.x + (col + 1) * tile) * k));
        const y1 = Math.min(h, Math.ceil(Math.min(piece.y + piece.h, piece.y + (row + 1) * tile) * k));
        for (let y = y0; y < y1; y += 1)
          for (let x = x0; x < x1; x += 1) if (!owner[y * w + x]) owner[y * w + x] = piece.group;
      }
  }
  const reach = {};
  for (const [part, groups] of Object.entries(SKIN_PART_GROUPS)) {
    const head = part === "HEAD";
    const values = [];
    for (let i = 0; i < w * h; i += 1)
      if (bake.field[i] >= 0 && groups.includes(owner[i]) && Boolean(bake.head[i]) === head)
        values.push(bake.field[i]);
    if (!values.length) throw new Error(`no cells for ${part}`);
    values.sort((a, b) => a - b);
    reach[part] = Math.round(values[values.length >> 1] * 1000) / 1000;
  }
  const at = (timeline, part) => skinReach(timeline, reach[part], part === "HEAD");
  return {
    reach,
    entry: Object.fromEntries(
      REXONANCE_SUIT_PARTS.map((part) => [part, Math.round(at(SKIN_ENTRY, part))]),
    ),
    scroll: ASSEMBLY_PARTS.map((part) => Math.round(at(SKIN_SCROLL, part) * 1000) / 1000),
  };
}

/** The marks' module, as committed. */
export function skinMarksSource(marks) {
  const object = (value) =>
    `{ ${Object.entries(value)
      .map(([key, number]) => `${key}: ${number}`)
      .join(", ")} }`;
  return `/* REXONANCE SKIN, its marks. Generated by scripts/build-rexonance-skin.mjs
   from the baked field and the skin's two clocks: do not edit (the tests
   compare it with the bake). Numbers only, so the call and the page read
   them without the skin's chunk. */

/** Where the front reaches each of the HUD's parts: the middle of the
 * part's own plates on the growth field (the helmet's on the head's). */
export const SKIN_PART_REACH = ${object(marks.reach)} as const;
/** When the front's lip is there in the entry (the call's canonical ms). */
export const SKIN_ENTRY_PARTS = ${object(marks.entry)} as const;
/** And in the scroll scene (its progress), in the HUD's order
 * (rexonance-resonance.js ASSEMBLY_PARTS). */
export const SKIN_SCROLL_PARTS = [${marks.scroll.join(", ")}] as const;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const debug = process.argv.find((arg) => arg.startsWith("--debug="))?.slice(8);
  const bake = await bakeSkinField();
  const target = join(root, SKIN_FIELD_FILE);
  if (check) {
    const { data, info } = await sharp(readFileSync(target))
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== bake.w || info.height !== bake.h || info.channels !== 3)
      throw new Error(`${SKIN_FIELD_FILE}: ${info.width}x${info.height}x${info.channels}`);
    for (let i = 0; i < data.length; i += 1)
      if (data[i] !== bake.texture[i]) throw new Error(`${SKIN_FIELD_FILE}: differs at byte ${i}`);
    console.log(`${SKIN_FIELD_FILE}: the committed picture is the bake`);
    if (readFileSync(join(root, SKIN_MARKS_FILE), "utf8") !== skinMarksSource(skinMarks(bake)))
      throw new Error(`${SKIN_MARKS_FILE}: differs from the bake's marks`);
    console.log(`${SKIN_MARKS_FILE}: the committed marks are the bake's`);
  } else {
    writeFileSync(join(root, SKIN_MARKS_FILE), skinMarksSource(skinMarks(bake)));
    console.log(`${SKIN_MARKS_FILE}: ${JSON.stringify(skinMarks(bake))}`);
    mkdirSync(dirname(target), { recursive: true });
    const png = await sharp(Buffer.from(bake.texture.buffer), {
      raw: { width: bake.w, height: bake.h, channels: 3 },
    })
      .png({ compressionLevel: 9, effort: 10, palette: false })
      .toBuffer();
    writeFileSync(target, png);
    console.log(`${SKIN_FIELD_FILE}: ${bake.w}x${bake.h}, ${png.length} bytes`);
  }
  if (debug) {
    mkdirSync(debug, { recursive: true });
    const wide = Buffer.alloc(bake.w * 3 * bake.h * 3);
    for (let y = 0; y < bake.h; y += 1)
      for (let x = 0; x < bake.w; x += 1)
        for (let c = 0; c < 3; c += 1) {
          const v = bake.texture[(y * bake.w + x) * 3 + c];
          const band = c === 0 && Math.floor(v / 12) % 2 ? 0.7 : 1;
          wide.fill(
            Math.round(v * band),
            (y * bake.w * 3 + c * bake.w + x) * 3,
            (y * bake.w * 3 + c * bake.w + x) * 3 + 3,
          );
        }
    await sharp(wide, { raw: { width: bake.w * 3, height: bake.h, channels: 3 } })
      .resize(bake.w * 9, bake.h * 3, { kernel: "nearest" })
      .png()
      .toFile(join(debug, "skin-field.png"));
  }
}
