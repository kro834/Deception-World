#!/usr/bin/env node
/**
 * Merge complete source from the published source ZIP into this checkout.
 *
 *   npm run fetch-source
 *
 * Images still come from `npm run fetch-assets`.
 */
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const BASE = process.env.DW_ASSET_BASE || "https://sand-zenith-meadow-dune.grok.me";
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const url = `${BASE.replace(/\/$/, "")}/Deception-World-source.zip`;

function walk(dir, files = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

async function main() {
  process.stdout.write(`fetch ${url} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`fail ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const destZip = join(root, "Deception-World-source.zip");
  writeFileSync(destZip, buf);
  console.log(`${buf.length} bytes`);

  const unpacked = "/tmp/dw-source-unpack";
  spawnSync("rm", ["-rf", unpacked]);
  mkdirSync(unpacked, { recursive: true });
  const unzip = spawnSync("unzip", ["-o", destZip, "-d", unpacked], { encoding: "utf8" });
  if (unzip.status !== 0) {
    console.error(unzip.stderr || unzip.stdout);
    process.exit(1);
  }

  const inner = join(unpacked, "Deception-World");
  let copied = 0;
  let skipped = 0;
  for (const src of walk(inner)) {
    const rel = relative(inner, src);
    if (rel === "README.txt") continue;
    const dest = join(root, rel);
    const srcSize = statSync(src).size;
    if (existsSync(dest) && statSync(dest).size >= srcSize) {
      skipped += 1;
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    copied += 1;
    console.log(`  ${rel} (${srcSize} bytes)`);
  }
  console.log(`done copied=${copied} kept=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
