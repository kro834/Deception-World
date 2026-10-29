// Copy a built guardian v3 candidate into a versioned public asset folder and
// rewrite the manifest's asset identity for the delivered file name.
//
//   node scripts/blender/deliver_guardian_v3.mjs --build DIR --stamp t7 \
//     --dest public/dogs-archive-20261029 [--name guardian-v3.glb]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opt = { name: "guardian-v3.glb" };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, "")] = args[i + 1];
if (!opt.build || !opt.stamp || !opt.dest) {
  console.error("usage: --build DIR --stamp STAMP --dest DIR [--name FILE]");
  process.exit(1);
}
const source = resolve(opt.build, `guardian-${opt.stamp}-draco.glb`);
const manifestPath = resolve(opt.build, "model-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
mkdirSync(opt.dest, { recursive: true });
const target = resolve(opt.dest, opt.name);
copyFileSync(source, target);
const bytes = readFileSync(target);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const delivered = {
  ...manifest,
  model: opt.name,
  assetBytes: bytes.length,
  assetSha256: sha256,
  assets: [{ file: opt.name, draco: true, bytes: bytes.length, sha256 }],
  deliveredFrom: { build: opt.build, stamp: opt.stamp, rawGlbSha256: manifest.assets.find((a) => !a.draco)?.sha256 ?? null },
  stage: "browser delivery from Blender (v3 organ rebuild)",
};
writeFileSync(resolve(opt.dest, "model-manifest.json"), JSON.stringify(delivered, null, 2) + "\n");
console.log("DELIVERED", target, statSync(target).size, sha256);
