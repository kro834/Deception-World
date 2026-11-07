// Site font subsets: the Japanese faces cut down to the characters the site
// actually sets, served from this origin.
//
// Owner (2026-11-06,「サイト全体が重いので軽くして」): Google's Noto Sans JP,
// Zen Kaku Gothic New and Shippori Mincho sheets slice each face into ~120
// unicode-range files by general Japanese frequency. Our dossiers use
// uncommon kanji spread over most of those slices, so a World page fetched 156
// font files (2.7 MB) and Dream Chapter 363 (9 MB) for about 2,200 distinct
// characters in the whole site.
//
// This script asks the Google Fonts API for the same faces restricted to our
// characters (`&text=`; same glyphs, metrics, variation axes and OpenType
// features as Google's slices) in a few chunks, saves them under
// public/fonts/subsets/ with a content hash in the name, and writes one
// @font-face sheet per delivery point (src/styles-font-subsets-*.css). Each
// sheet is linked after the Google sheet of the same faces, and @font-face
// rules declared later are tried first, so a character in a chunk comes from
// the chunk and never fetches a Google slice; any other character (a search
// query, new copy) still falls through to Google's slice exactly as before.
//
// Chunks: every non-kanji character of the site plus all ASCII, kana, CJK
// punctuation and full-width forms in one file (so Latin and kana pairs keep
// their kerning in one font), the title's kanji in their own file, then the
// remaining kanji grouped by which routes use them (`route-chars.json`, from
// scripts/font-subsets/crawl.mjs) in files of CHUNK kanji.
//
// Regenerate after large copy changes (needs network to fonts.googleapis.com):
//   npm run build && PREVIEW_ROOT=. PORT=4971 node scripts/preview-production.mjs &
//   BASE=http://127.0.0.1:4971 node scripts/font-subsets/crawl.mjs
//   node scripts/build-font-subsets.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(repo, "public/fonts/subsets");
const PUBLIC_PATH = "/fonts/subsets";
const CHUNK = 150;
// The modern Safari Google serves the site's own sheets to (WOFF2, variable).
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

/** Faces to cut, with the descriptors of the faces they stand in for. */
export const FACES = [
  // SITE_CORE_FONTS_URL / styles-opening-fonts.css: variable, no overrides.
  { sheet: "core", family: "Noto Sans JP", api: "Noto+Sans+JP:wght@400..600", weight: "400 600", slug: "noto-sans-jp" },
  // styles-site-display-fonts.css: the static weights with its overrides.
  ...[500, 700].map((w) => ({
    sheet: "display",
    family: "Zen Kaku Gothic New",
    api: `Zen+Kaku+Gothic+New:wght@${w}`,
    weight: String(w),
    slug: `zen-kaku-gothic-new-${w}`,
    overrides: ["ascent-override: 109%", "descent-override: 36%", "line-gap-override: 0%"],
  })),
  // DREAM_FONTS_URL (dream-chapter.tsx).
  ...[500, 800].map((w) => ({
    sheet: "dream",
    family: "Shippori Mincho B1",
    api: `Shippori+Mincho+B1:wght@${w}`,
    weight: String(w),
    slug: `shippori-mincho-b1-${w}`,
  })),
  ...[400, 500, 700].map((w) => ({
    sheet: "dream",
    family: "Shippori Mincho",
    api: `Shippori+Mincho:wght@${w}`,
    weight: String(w),
    slug: `shippori-mincho-${w}`,
  })),
];

export const isKanji = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || c >= 0x20000;
};

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));

/** Every character the site's sources could set (copy lives in src/). */
function sourceCharacters() {
  const chars = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:tsx?|jsx?|mjs|json|md|css|html)$/.test(entry.name)) for (const ch of readFileSync(path, "utf8")) chars.add(ch);
    }
  };
  walk(join(repo, "src"));
  return chars;
}

/** Split the characters into the chunks described above, for one face. */
export function planChunks(sourceChars, routeChars, family, chunk = CHUNK) {
  // Printable characters: no controls, BOM, replacement character or whitespace but the space.
  const usable = (ch) => /^[^\p{Cc}\s\ufeff\ufffd]$/u.test(ch) || ch === " ";
  const all = new Set([...sourceChars].filter(usable));
  for (const fams of Object.values(routeChars)) for (const text of Object.values(fams)) for (const ch of text) if (usable(ch)) all.add(ch);
  for (const ch of [...range(0x20, 0x7e), ...range(0x3000, 0x30ff), ...range(0xff01, 0xff5e)]) all.add(ch);
  const sorted = (list) => [...list].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const base = sorted([...all].filter((ch) => !isKanji(ch)));
  const kanji = [...all].filter(isKanji);
  // Routes where this face appears; a route's every character counts (the
  // family may be a fallback in another family's list).
  const routes = Object.entries(routeChars)
    .filter(([, fams]) => family in fams)
    .map(([route, fams]) => [route, new Set(Object.values(fams).join(""))])
    .sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1));
  const title = new Set(Object.values(routeChars["/"] ?? {}).join(""));
  const opening = routes.some(([route]) => route === "/") ? sorted(kanji.filter((ch) => title.has(ch))) : [];
  const signature = (ch) => routes.map(([, set]) => (set.has(ch) ? "0" : "1")).join("") + String(ch.codePointAt(0)).padStart(6, "0");
  const rest = kanji.filter((ch) => !opening.includes(ch)).sort((a, b) => (signature(a) < signature(b) ? -1 : 1));
  const chunks = [base];
  if (opening.length) chunks.push(opening);
  for (let i = 0; i < rest.length; i += chunk) chunks.push(sorted(rest.slice(i, i + chunk)));
  return chunks;
}

function curl(args) {
  return execFileSync("curl", ["-sS", "--fail", "--retry", "3", "-A", UA, ...args], { maxBuffer: 64 << 20 });
}

function fetchChunk(face, chars) {
  const url = `https://fonts.googleapis.com/css2?family=${face.api}&display=swap&text=${encodeURIComponent(chars.join(""))}`;
  const css = curl([url]).toString("utf8");
  const src = css.match(/src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('woff2'\)/)?.[1];
  const unicodeRange = css.match(/unicode-range: ([^;]+);/)?.[1];
  if (!src || !unicodeRange || (css.match(/@font-face/g) ?? []).length !== 1) throw new Error(`unexpected sheet for ${face.slug}:\n${css}`);
  return { font: curl([src]), unicodeRange };
}

/** Code points of a unicode-range value ("U+20-7e, U+3042"). */
export function rangeCodepoints(range) {
  return range.split(",").flatMap((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-").map((hex) => parseInt(hex, 16));
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

/** A unicode-range value for code points, as Google writes them. */
export function formatRange(points) {
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const hex = (n) => n.toString(16);
    parts.push(j > i ? `U+${hex(sorted[i])}-${hex(sorted[j])}` : `U+${hex(sorted[i])}`);
    i = j;
  }
  return parts.join(", ");
}

// The local snapshots of Google's sheets for the same faces. Chromium starts
// loading every face that covers a character while the first is still
// loading, so a Google slice overlapping a chunk was fetched as well (FAR
// FROM's phone layout fetched 45 slices). Each snapshot face keeps Google's
// range minus the characters the chunks of its weight carry; a face left
// with nothing is dropped. Google's own ranges are re-read every run (keyed
// by the face's file), so a smaller chunk set gives the characters back.
export const SNAPSHOTS = [
  {
    file: "src/styles-opening-fonts.css",
    family: "Noto Sans JP",
    google: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..600&display=swap",
  },
  {
    file: "src/styles-site-display-fonts.css",
    family: "Zen Kaku Gothic New",
    google: "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap",
  },
];

/** Trim one snapshot's faces of `family` by the covered code points of each weight. */
export function trimSnapshot(css, family, covered, originals) {
  return css.replace(/(\/\*[^*]*\*\/\n)?@font-face \{[^}]*\}\n?/g, (block) => {
    if (!block.includes(`font-family: '${family}';`)) return block;
    const src = block.match(/src: url\(([^)]+)\)/)[1];
    const original = originals.get(src);
    if (!original) throw new Error(`${family}: ${src} is not in Google's current sheet; refresh the snapshot`);
    const weight = block.match(/font-weight: ([^;]+);/)[1];
    const keep = rangeCodepoints(original).filter((c) => !covered.get(weight)?.has(c));
    if (!keep.length) return "";
    return block.replace(/unicode-range: [^;]+;/, `unicode-range: ${formatRange(keep)};`);
  });
}

function trimSnapshots() {
  const covered = new Map();
  for (const sheet of ["core", "display"]) {
    const css = readFileSync(join(repo, `src/styles-font-subsets-${sheet}.css`), "utf8");
    for (const block of css.match(/@font-face \{[^}]*\}/g) ?? []) {
      const key = `${block.match(/font-family: '([^']+)'/)[1]}|${block.match(/font-weight: ([^;]+);/)[1]}`;
      if (!covered.has(key)) covered.set(key, new Set());
      for (const c of rangeCodepoints(block.match(/unicode-range: ([^;]+);/)[1])) covered.get(key).add(c);
    }
  }
  for (const snapshot of SNAPSHOTS) {
    const originals = new Map();
    for (const block of curl([snapshot.google]).toString("utf8").match(/@font-face \{[^}]*\}/g) ?? [])
      originals.set(block.match(/src: url\(([^)]+)\)/)[1], block.match(/unicode-range: ([^;]+);/)[1]);
    const byWeight = new Map(
      [...covered].filter(([key]) => key.startsWith(`${snapshot.family}|`)).map(([key, set]) => [key.split("|")[1], set]),
    );
    const path = join(repo, snapshot.file);
    const before = readFileSync(path, "utf8");
    const after = trimSnapshot(before, snapshot.family, byWeight, originals);
    writeFileSync(path, after);
    const count = (text) => (text.match(new RegExp(`font-family: '${snapshot.family}'`, "g")) ?? []).length;
    console.log(snapshot.file, snapshot.family, "faces", count(before), "->", count(after));
  }
}

function main() {
  if (process.argv.includes("--trim-only")) return trimSnapshots();
  const routeChars = JSON.parse(readFileSync(new URL("./font-subsets/route-chars.json", import.meta.url), "utf8"));
  const source = sourceCharacters();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const sheets = {};
  let total = 0;
  for (const face of FACES) {
    const chunks = planChunks(source, routeChars, face.family);
    chunks.forEach((chars, index) => {
      const { font, unicodeRange } = fetchChunk(face, chars);
      const name = `${face.slug}.${index}.${createHash("sha256").update(font).digest("hex").slice(0, 10)}.woff2`;
      writeFileSync(join(OUT_DIR, name), font);
      total += font.length;
      (sheets[face.sheet] ??= []).push(
        [
          "@font-face {",
          `  font-family: '${face.family}';`,
          "  font-style: normal;",
          `  font-weight: ${face.weight};`,
          "  font-display: swap;",
          ...(face.overrides ?? []).map((line) => `  ${line};`),
          `  src: url(${PUBLIC_PATH}/${name}) format('woff2');`,
          `  unicode-range: ${unicodeRange};`,
          "}",
        ].join("\n"),
      );
      console.log(face.slug, index, chars.length, "chars", font.length, "bytes");
    });
  }
  const header = (sheet) =>
    `/* Generated by scripts/build-font-subsets.mjs (do not edit by hand): the ${sheet} faces cut to the\n` +
    ` * site's characters, linked after the Google sheet of the same faces so these are tried first. */\n`;
  for (const [sheet, faces] of Object.entries(sheets))
    writeFileSync(join(repo, `src/styles-font-subsets-${sheet}.css`), header(sheet) + faces.join("\n") + "\n");
  console.log("total", total, "bytes");
  trimSnapshots();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
