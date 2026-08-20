#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const partsRoot = join(root, "source-parts");

function listDirs(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) listDirs(p, acc);
    else if (name.name.endsWith(".part")) acc.push(p);
  }
  return acc;
}

const groups = new Map();
for (const part of listDirs(partsRoot)) {
  const relDir = dirname(part).slice(partsRoot.length + 1);
  const list = groups.get(relDir) || [];
  list.push(part);
  groups.set(relDir, list);
}

let n = 0;
for (const [rel, files] of groups) {
  files.sort();
  const content = files.map((f) => readFileSync(f, "utf8")).join("");
  const dest = join(root, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  console.log(`${rel}  ${Buffer.byteLength(content)} bytes from ${files.length} parts`);
  n += 1;
}
console.log(`assembled ${n} files`);
