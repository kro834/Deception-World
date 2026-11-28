// Every image the site names must be a file that ships in public/, spelled
// with the exact case (Vercel's file system is case-sensitive), and no live
// reference may lean on a legacy redirect (vite.config.ts legacyImageRedirects):
// a candidate that only resolves through a 308 is a file that does not exist.
// Owner, 2026-11-26: 「画像読み込みの問題を修正して」.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicRoot = join(root, "public");
const IMAGE = /\.(?:webp|png|jpe?g|gif|svg|avif|ico)$/i;

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

// Case-exact set of the shipped files ("/dir/name.webp").
const published = new Set(walk(publicRoot).map((path) => `/${relative(publicRoot, path)}`));
const exists = (path) => published.has(decodeURIComponent(path.split(/[?#]/)[0]));

const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
const redirectBlock = viteConfig.slice(
  viteConfig.indexOf("const legacyImageRedirects"),
  viteConfig.indexOf(".map(([from, to])"),
);
const { FINAL_STAGE_NATIVE_WIDTHS } = await import(
  new URL("../src/lib/rexonance-images.ts", import.meta.url)
);
// The same table vite.config.ts builds: the Final Stage's retired
// `-delivery-<native>` names, plus the literal pairs.
const redirectSources = new Set([
  ...Object.entries(FINAL_STAGE_NATIVE_WIDTHS).map(([source, width]) =>
    source.replace(/\.webp$/, `-delivery-${width}.webp`),
  ),
  ...[...redirectBlock.matchAll(/\["(\/[^"]+)",\s*"\/[^"]+"\]/g)].map((match) => match[1]),
]);

// Quoted, backticked or url()-wrapped literal paths that start at the site
// root. Template pieces (`${stem}-640.webp`) are checked through the
// registries below, where the code assembles them.
const LITERAL = /(?<=["'`(]\s*)(\/[A-Za-z0-9_@%./-]+\.(?:webp|png|jpe?g|gif|svg|avif|ico))(?=[?#"'`)\s])/gi;

function sourceFiles() {
  const fromSrc = walk(join(root, "src")).filter((path) => /\.(?:[cm]?[jt]sx?|css)$/.test(path));
  const fromServer = walk(join(root, "server")).filter((path) => /\.(?:[cm]?[jt]s)$/.test(path));
  const fromPublic = walk(publicRoot).filter((path) => /\.(?:css|js|html|webmanifest)$/.test(path));
  return [...fromSrc, ...fromServer, ...fromPublic].filter((path) => !/\.test\.[cm]?js$/.test(path));
}

test("every root-relative image literal in src/, server/ and public/ names a shipped file", () => {
  const missing = [];
  let checked = 0;
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LITERAL)) {
      const path = match[1];
      if (path.startsWith("//")) continue;
      checked++;
      if (!exists(path)) missing.push(`${relative(root, file)}: ${path}`);
    }
  }
  assert.ok(checked > 500, `expected to check the site's image references (checked ${checked})`);
  assert.deepEqual(missing, [], "referenced image files missing from public/ (exact case)");
});

test("public/ archive pages and stylesheets resolve their relative image URLs", () => {
  const missing = [];
  for (const file of walk(publicRoot).filter((path) => /\.(?:css|html)$/.test(path))) {
    const text = readFileSync(file, "utf8");
    const refs = [
      ...text.matchAll(/url\(\s*["']?(?!data:|#|https?:|\/)([^"')]+?\.(?:webp|png|jpe?g|gif|svg|avif))["']?\s*\)/gi),
      ...text.matchAll(/\b(?:src|href|poster)="(?!data:|#|https?:|\/)([^"]+?\.(?:webp|png|jpe?g|gif|svg|avif))"/gi),
    ];
    for (const [, ref] of refs) {
      const target = `/${relative(publicRoot, resolve(dirname(file), ref.split(/[?#]/)[0]))}`;
      if (!exists(target)) missing.push(`${relative(root, file)}: ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});

// Walk an exported value for image paths and srcset candidates.
function collect(value, out, seen = new Set()) {
  if (typeof value === "string") {
    for (const part of value.split(/,\s+(?=\/)/)) {
      const candidate = part.trim().split(/\s+/)[0];
      if (candidate.startsWith("/") && !candidate.startsWith("//") && IMAGE.test(candidate.split(/[?#]/)[0]))
        out.add(candidate);
    }
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const item of Object.values(value)) collect(item, out, seen);
}

test("responsive registries only offer candidates that ship (no 404s, no legacy redirects)", async () => {
  const lib = (name) => import(new URL(`../src/lib/${name}`, import.meta.url));
  const modules = await Promise.all(
    [
      "thumbnail-images.ts",
      "record-images.ts",
      "record-form-images.ts",
      "dossier-images.ts",
      "rexonance-images.ts",
      "rexonance-site-artwork.ts",
      "opening-logo.ts",
      "far-from-saga-artwork.ts",
      "far-from-ultra-art.ts",
      "illusionculum-saga-artwork.ts",
      "meta-unitas-saga-artwork.ts",
      "extreme-entry.ts",
    ].map(lib),
  );
  const paths = new Set();
  for (const module of modules) collect(module, paths);

  // The srcsets the helpers assemble at render time.
  const records = await lib("record-images.ts");
  for (const source of Object.keys(records.INDEX_ART_IMAGES)) collect(records.recordImage(source), paths);
  const rexonance = await lib("rexonance-images.ts");
  const site = await lib("rexonance-site-artwork.ts");
  for (const source of [
    ...Object.keys(rexonance.FINAL_STAGE_NATIVE_WIDTHS),
    ...Object.values(site.REXONANCE_SITE_ARTWORK),
  ])
    collect(rexonance.rexonanceImage(source), paths);
  const thumbnails = await lib("thumbnail-images.ts");
  for (const source of Object.keys(thumbnails.POSTER_IMAGES)) collect(thumbnails.posterImage(source), paths);
  for (const source of Object.keys(thumbnails.EPISODE_THUMBNAILS))
    collect(thumbnails.episodeThumbnail(source), paths);

  assert.ok(paths.size > 300, `expected the registries' candidates (found ${paths.size})`);
  const missing = [...paths].filter((path) => !exists(path));
  assert.deepEqual(missing, [], "registry candidates missing from public/");
  const redirected = [...paths].filter((path) => redirectSources.has(path));
  assert.deepEqual(redirected, [], "registry candidates that only resolve through a legacy 308");
});

test("legacy redirect sources are not referenced by live code", () => {
  assert.ok(redirectSources.size >= 10, "the legacy redirect table was not found in vite.config.ts");
  const offenders = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const source of redirectSources)
      if (text.includes(`"${source}"`) || text.includes(`${source} `))
        offenders.push(`${relative(root, file)}: ${source}`);
  }
  assert.deepEqual(offenders, []);
});

test("the World's server-rendered first print still reports a failure that settled before hydration", () => {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const home = read("src/components/world/world-home.tsx");
  const frames = read("src/components/world/use-world-poster-frames.ts");
  // The server HTML always holds poster 0 as the current layer.
  assert.match(frames, /current: \{ index: 0, key: 0 \}/);
  // React only hears an onError fired after hydration, so the element is read once on mount.
  assert.match(
    home,
    /useEffect\(\(\) => \{\s*const image = shellRef\.current\?\.querySelector<HTMLImageElement>\(\s*'#poster-stage \.world-stage-image\[data-layer="current"\]',\s*\);\s*if \(image\?\.complete && image\.naturalWidth === 0 && image\.currentSrc\) setPosterFailure\(0\);\s*\}, \[\]\);/,
  );
  assert.match(home, /id="poster-stage"/);
  assert.match(home, /data-layer=\{layer\}/);
  // The shared stage (gallery, command deck) settles the same way on mount.
  const stage = read("src/components/artwork-stage/artwork-stage.tsx");
  assert.match(
    stage,
    /if \(image\?\.complete && image\.naturalWidth > 0\) \{[\s\S]{0,120}\} else if \(image\?\.complete && image\.currentSrc && failedId !== artwork\.id\) \{[\s\S]{0,240}setFailedId\(artwork\.id\);/,
  );
});
