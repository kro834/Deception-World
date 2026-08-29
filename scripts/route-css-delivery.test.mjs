import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
    } else if ([".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

const worldHead = await read("src/lib/world-head.ts");
const routeSources = Object.fromEntries(
  await Promise.all(
    [
      "src/routes/world.tsx",
      "src/routes/riders/$id.tsx",
      "src/routes/managers/lejas.tsx",
      "src/routes/managers/opus.tsx",
      "src/routes/managers/reemu.tsx",
      "src/routes/managers/rex-loi.tsx",
      "src/routes/managers/shuza.tsx",
      "src/routes/managers/zeus.tsx",
      "src/routes/characters/luna.tsx",
      "src/routes/characters/terra.tsx",
      "src/routes/dream-chapter.tsx",
      "src/routes/rexonance-saga.tsx",
      "src/routes/extreme-saga.tsx",
      "src/routes/form-archive.tsx",
      "src/routes/intelligence.tsx",
      "src/routes/download.tsx",
    ].map(async (path) => [path, await read(path)]),
  ),
);

test("route-only CSS is emitted as URLs instead of entering the root CSS graph", async () => {
  const sourceFiles = await collectSourceFiles(new URL("src/", root));
  const offenders = [];
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    if (/import\s+["'][^"']+\.css(?:\?[^"']*)?["'];?/.test(source)) {
      offenders.push(relative(new URL(".", root).pathname, file.pathname));
    }
  }
  assert.deepEqual(offenders, []);
});

test("shared world styles keep base-before-addon cascade order", () => {
  assert.match(worldHead, /styles-world\.css\?url/);
  assert.match(worldHead, /styles-world-addon\.css\?url/);
  assert.ok(
    worldHead.indexOf("WORLD_BASE_STYLESHEET_LINK,") <
      worldHead.indexOf("WORLD_ADDON_STYLESHEET_LINK,"),
  );
  assert.match(worldHead, /links:\s*stylesheetLinks/);

  for (const path of [
    "src/routes/world.tsx",
    "src/routes/riders/$id.tsx",
    "src/routes/managers/lejas.tsx",
    "src/routes/managers/opus.tsx",
    "src/routes/managers/reemu.tsx",
    "src/routes/managers/rex-loi.tsx",
    "src/routes/managers/shuza.tsx",
    "src/routes/managers/zeus.tsx",
    "src/routes/characters/luna.tsx",
    "src/routes/characters/terra.tsx",
  ]) {
    assert.match(routeSources[path], /create(?:World|Rider)Head/);
  }
});

test("special routes append their CSS after world base and addon styles", () => {
  const dream = routeSources["src/routes/dream-chapter.tsx"];
  const rexonance = routeSources["src/routes/rexonance-saga.tsx"];
  const extreme = routeSources["src/routes/extreme-saga.tsx"];
  const archive = routeSources["src/routes/form-archive.tsx"];
  const intelligence = routeSources["src/routes/intelligence.tsx"];
  const download = routeSources["src/routes/download.tsx"];

  assert.ok(
    dream.indexOf("...WORLD_STYLESHEET_LINKS") <
      dream.indexOf('{ rel: "stylesheet", href: dreamChapterCssUrl }'),
  );
  assert.ok(
    rexonance.indexOf("...WORLD_STYLESHEET_LINKS") <
      rexonance.indexOf('{ rel: "stylesheet", href: rexonanceSagaCssUrl }'),
  );
  const rexonanceLink = extreme.indexOf('{ rel: "stylesheet", href: rexonanceSagaCssUrl }');
  const extremeLink = extreme.indexOf('{ rel: "stylesheet", href: extremeSagaCssUrl }');
  assert.ok(
    extreme.indexOf("...WORLD_STYLESHEET_LINKS") < rexonanceLink && rexonanceLink < extremeLink,
  );
  assert.match(archive, /links:\s*WORLD_STYLESHEET_LINKS/);
  assert.ok(
    intelligence.indexOf("...WORLD_STYLESHEET_LINKS") <
      intelligence.indexOf('{ rel: "stylesheet", href: intelligenceCssUrl }'),
  );
  assert.match(download, /stylesheetLinks:\s*\[WORLD_ADDON_STYLESHEET_LINK\]/);
});
