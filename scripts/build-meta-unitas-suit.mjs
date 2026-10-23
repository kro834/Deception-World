#!/usr/bin/env node
// (2026-10-23, owner: 「メタ・ウニタスはレクソナンスと同じ装着です」) This script now
// only writes SAM's prompts; the suit is built for the Rexonance engine by
// scripts/build-meta-unitas-rx-suit.mjs from the same masks.
// META UNITAS SAGA (2026-10-23): the scroll suit-up's raster parts, cut from
// the owner's two transparent cutouts (design/meta-unitas-saga-20261023/
// cutouts/middle.webp and ultra.webp, 1024 x 1536, one frame: the helix, the
// buckle and the soles meet pixel for pixel, so no registration is needed;
// the build checks it). Reproducible:
//
//   node scripts/build-meta-unitas-suit.mjs --sam-prompts      (SAM's prompts)
//   <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site meta-unitas-middle --model <…>
//   <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site meta-unitas-ultra --model <…>
//   node scripts/build-meta-unitas-suit.mjs [--debug=<dir>]
//
// The plates are SAM's (owner, 2026-10-23: 「装甲切り出しはSAMを用いて」): the
// regions and clips of scripts/meta-unitas-suit-regions.mjs are only SAM's
// prompts; the masks it writes (design/meta-unitas-saga-20261023/sam-masks/
// <form>/plates/*.png with a manifest) are what this build cuts by, so it
// stays reproducible without SAM. The driver keeps its traced outline and
// claims first. Every figure pixel belongs to exactly one plate: the build
// normalises the masks' shares, gives an unclaimed pixel to the plate nearest
// it, and fails if any opaque pixel is left without one.
//
// The scene (src/lib/meta-unitas-partition.ts) draws, per form, at the figure
// height 1040 px (693 x 1040, the whole frame, never cropped):
//   <form>-figure.webp  the finished figure (the still tiers' picture, and
//                        what the scene settles on);
//   <form>-plates.webp  each plate's art in one atlas, premultiplied box-
//                        filtered on the figure grid (no dark fringe);
//   middle-lit.webp     ミドル's plates as light (the same atlas places): the
//                        single glowing whole, each plate rimmed in orange;
//   <form>-seams.webp   the boundaries between the plates, in orange;
//   middle-glow.webp    the whole as one soft light (before it partitions);
//   undersuit.webp      Rexonance's undersuit (the same wearer, 月城悠真),
//                        composited so its soles and reactor meet ミドル's soles
//                        and helix.
// and the generated module src/lib/meta-unitas-suit.ts lists the plates.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  META_UNITAS_BELTS,
  META_UNITAS_MARKS,
  META_UNITAS_REGIONS,
} from "./meta-unitas-suit-regions.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);

const VERSION = "20261023";
const DESIGN = join(ROOT, `design/meta-unitas-saga-${VERSION}`);
const SAM_ROOT = join(DESIGN, "sam-masks");
const OUT_DIR = join(ROOT, `public/meta-unitas-suit-${VERSION}/`);
const PUBLIC_PATH = `/meta-unitas-suit-${VERSION}`;
const MODULE = join(ROOT, "src/lib/meta-unitas-suit.ts");
const FORMS = ["middle", "ultra"];
const CUTOUT = (form) => `design/meta-unitas-saga-${VERSION}/cutouts/${form}.webp`;
const W = 1024;
const H = 1536;
const FIG_H = 1040;
const SCALE = FIG_H / H;
const FIG_W = Math.round(W * SCALE);
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const DEBUG = debugArg ? debugArg.slice("--debug=".length) : null;

// --- SAM's prompts --------------------------------------------------------------
if (process.argv.includes("--sam-prompts")) {
  for (const form of FORMS) {
    const dir = join(SAM_ROOT, form);
    mkdirSync(dir, { recursive: true });
    const regions = META_UNITAS_REGIONS[form];
    const prompts = {
      site: `meta-unitas-${form}`,
      generatedBy: "scripts/build-meta-unitas-suit.mjs --sam-prompts",
      frame: [W, H],
      images: { full: CUTOUT(form) },
      ornamentGroups: [],
      regions: regions.map(({ id, group, poly }) => ({ id, group, poly })),
      splits: Object.fromEntries(
        regions.map((region) => [
          region.id,
          region.plates.map((plate) => ({
            id: plate.id,
            clip: plate.clip,
            dir: "up",
            group: region.group,
          })),
        ]),
      ),
      belt: { region: "belt", outline: [META_UNITAS_BELTS[form]] },
      marks: META_UNITAS_MARKS,
    };
    writeFileSync(join(dir, "prompts.json"), `${JSON.stringify(prompts)}\n`);
    console.log(`wrote ${join(dir, "prompts.json")}`);
  }
  process.exit(0);
}
console.log("the suit itself is built by scripts/build-meta-unitas-rx-suit.mjs");


