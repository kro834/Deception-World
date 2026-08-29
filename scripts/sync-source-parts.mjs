#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const partsRoot = join(root, "source-parts");
const requested = new Set(process.argv.slice(2).map((value) => value.replaceAll("/", sep)));

function listPartGroups(dir, groups = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listPartGroups(path, groups);
    else if (entry.name.endsWith(".part")) {
      const group = relative(partsRoot, dirname(path));
      const files = groups.get(group) ?? [];
      files.push(path);
      groups.set(group, files);
    }
  }
  return groups;
}

function splitAtLineBoundaries(content, count) {
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
  const boundaries = [0];
  for (let index = 1; index < count; index += 1) {
    const start = boundaries.at(-1) ?? 0;
    let end = Math.floor((lines.length * index) / count);
    while (end > start && /^\s*\n$/.test(lines[end - 1])) end -= 1;
    boundaries.push(end);
  }
  boundaries.push(lines.length);
  return Array.from({ length: count }, (_, index) =>
    lines.slice(boundaries[index], boundaries[index + 1]).join(""),
  );
}

let synced = 0;
for (const [relativeTarget, partFiles] of listPartGroups(partsRoot)) {
  if (requested.size && !requested.has(relativeTarget)) continue;
  const target = resolve(root, relativeTarget);
  if (!existsSync(target)) throw new Error(`Missing authoritative source: ${relativeTarget}`);
  partFiles.sort();
  const chunks = splitAtLineBoundaries(readFileSync(target, "utf8"), partFiles.length);
  partFiles.forEach((part, index) => writeFileSync(part, chunks[index], "utf8"));
  console.log(`${relativeTarget}  ${partFiles.length} parts synchronized`);
  synced += 1;
}

if (requested.size && synced !== requested.size) {
  throw new Error(`Synchronized ${synced} of ${requested.size} requested source groups`);
}
console.log(`synchronized ${synced} source groups`);
