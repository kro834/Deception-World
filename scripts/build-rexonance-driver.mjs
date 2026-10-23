// Bake exactly the live driver's atlas crops and light separation for the
// loading stand-in. Original artwork and entrance-call assets stay untouched.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { REXONANCE_SUIT_ATLAS, REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import { REXONANCE_SUIT_DRIVER } from "../src/lib/rexonance-calls.ts";
import { separateDriverPixels } from "../src/lib/rexonance-unlit.js";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const { width, height } = REXONANCE_SUIT_SIZE;
const layers = await Promise.all(REXONANCE_SUIT_PIECES
  .filter((piece) => REXONANCE_SUIT_DRIVER.includes(piece.id)).reverse()
  .map(async (piece) => ({
    input: await sharp(root(`public${REXONANCE_SUIT_ATLAS.src}`))
      .extract({ left: piece.ax, top: piece.ay, width: piece.w, height: piece.h })
      .png().toBuffer(),
    left: piece.x, top: piece.y,
  })));
const data = await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
  .composite(layers).raw().toBuffer();
separateDriverPixels(data);
// 2026-10-23: the driver re-cut by SAM's masks: a new folder, so a cached
// stand-in never meets the new atlas.
await mkdir(root("public/rexonance-zenith-20261023"), { recursive: true });
await sharp(data, { raw: { width, height, channels: 4 } }).webp({ lossless: true })
  .toFile(root("public/rexonance-zenith-20261023/driver-standin.webp"));
