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
  } else {
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
