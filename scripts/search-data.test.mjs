import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const cache = new Map();
function loadData(path) {
  const absolute = resolve(root, path);
  if (cache.has(absolute)) return cache.get(absolute);
  assert.ok(absolute.endsWith(".ts"), "search imports only pure TypeScript data");
  const exports = {};
  cache.set(absolute, exports);
  runInNewContext(ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    require: (specifier) => {
      assert.ok(specifier.startsWith("."), "catalogue has no runtime framework dependencies");
      return loadData(resolve(dirname(absolute), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`));
    },
  });
  return exports;
}

function sourceValue(path, name, references = {}) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(file) === name);
  assert.ok(declaration?.initializer, `published source exports ${name}`);
  const exports = {};
  runInNewContext(ts.transpileModule(`exports.value = ${declaration.initializer.getText(file)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, ...references });
  return exports.value;
}

const { SEARCH_CATEGORIES, SEARCH_DOCUMENTS } = loadData("src/components/search/search-data.ts");
const world = loadData("src/components/world/world-annex-data.ts");
const dream = loadData("src/components/dream-chapter/dream-chapter-data.ts");
const byId = new Map(SEARCH_DOCUMENTS.map((document) => [document.id, document]));

test("catalogue contains unique, complete records in the agreed categories", () => {
  assert.equal(byId.size, SEARCH_DOCUMENTS.length);
  assert.ok(SEARCH_DOCUMENTS.length >= 50 && SEARCH_DOCUMENTS.length <= 150);
  assert.deepEqual(Array.from(SEARCH_CATEGORIES, (category) => category.id),
    ["all", "people", "riders", "story", "world", "systems"]);
  const categories = new Set(SEARCH_CATEGORIES.slice(1).map((category) => category.id));
  for (const document of SEARCH_DOCUMENTS) {
    for (const field of ["id", "title", "description", "to", "hash"]) {
      assert.equal(typeof document[field], "string", `${document.id}: ${field}`);
      assert.ok(document[field].trim(), `${document.id}: nonempty ${field}`);
    }
    assert.ok(categories.has(document.category), document.id);
    assert.match(document.to, /^\/(?!\/)/);
    assert.doesNotMatch(document.hash, /[#\s]/);
    assert.ok(!document.keywords || document.keywords.every((keyword) => typeof keyword === "string"));
  }
  for (const category of categories) assert.ok(SEARCH_DOCUMENTS.some((doc) => doc.category === category));
});

test("published manager and rider excerpts and names remain source accurate", () => {
  const path = "src/components/world/manager-stub.tsx";
  const managers = ["ZEUS", "REX_LOI", "SHUZA", "OPUS", "REEMU"].map((name) => sourceValue(path, name));
  for (const manager of managers) {
    const document = byId.get(`manager-${manager.id}`);
    assert.equal(document.title, manager.name);
    assert.equal(document.description, manager.title);
    assert.equal(document.body, manager.sections.map((section) => [section.title, ...section.body].join("\n")).join("\n"));
  }
  assert.ok(read("src/components/world/lejas-page.tsx").replace(/\s+/g, " ").includes(byId.get("manager-lejas").body));
  const riders = sourceValue("src/components/world/rider-page.tsx", "RIDER_DOSSIERS", {
    REX_LOI: managers[1], REXONANCE_CALLS: [], FINAL_STAGE_ENTER_ASSETS: [],
  });
  assert.equal(riders.length, 8);
  for (const rider of riders) {
    const document = byId.get(`rider-${rider.id}`);
    assert.equal(document.title, `仮面ライダー${rider.ja}`);
    assert.equal(document.description, rider.title);
    assert.equal(document.body, rider.sections.map((section) => [section.title, ...section.body].join("\n")).join("\n"));
    assert.ok(document.keywords.includes(rider.person));
    for (const form of rider.forms) assert.ok(document.keywords.includes(form.displayName ?? form.name));
  }
  assert.equal(byId.get("extreme-saga").title, "仮面ライダーエクスプリームサーガ");
  assert.ok(byId.get("rider-realm").keywords.includes("レルムレジェンズ"));
  const dante = loadData("src/components/world/dante-data.ts");
  assert.equal(byId.get("person-dante").body, dante.DANTE_SECTIONS.flatMap(section => [section.title, ...section.body]).join("\n"));
  assert.equal(byId.get("person-ciel").body, byId.get("rider-saga").body);
  assert.ok(read("src/components/world/ciel-page.tsx").includes('RIDER_DOSSIERS.find((rider) => rider.id === "saga")'));
});

test("world records and six Dream chapters use the published text without invented continuations", () => {
  for (const entry of world.WORLD_GLOSSARY) {
    const doc = byId.get(`world-term-${entry.term}`);
    assert.equal(doc.description, entry.body[0]);
    assert.equal(doc.body, entry.body.join("\n"));
  }
  for (const entry of world.WORLD_CAST_ROSTER) {
    assert.equal(byId.get(`person-${entry.id}`).body, entry.profile.map((part) => part.text).join("\n"));
  }
  for (const entry of dream.DREAM_CASES) {
    const doc = byId.get(`dream-case-${entry.no}`);
    assert.equal(doc.description, entry.lead);
    assert.equal(doc.body, entry.paragraphs.join("\n"));
    assert.equal(doc.hash, `dream-case-${entry.no}`);
  }
  assert.equal(SEARCH_DOCUMENTS.filter((doc) => doc.id.startsWith("dream-case-")).length, 6);
});

test("every destination is an existing public route with its actual heading anchor", () => {
  const annex = read("src/components/world/world-annex.tsx");
  const worldPage = read("src/components/world/world-home.tsx") + annex;
  const dreamPage = read("src/components/dream-chapter/dream-chapter.tsx");
  const routeComponents = {
    "/world": worldPage,
    "/dream-chapter": dreamPage,
    "/extreme-saga": read("src/components/extreme-saga/extreme-saga.tsx"),
    "/rexonance-saga": read("src/components/rexonance-saga/rexonance-saga.tsx"),
    "/final-stage": read("src/components/final-stage/final-stage.tsx"),
    "/form-archive": read("src/routes/form-archive.tsx"),
  };
  const actualWorldAnchors = new Set([
    ...world.WORLD_CAST_ROSTER.map((entry) => `wa-person-${entry.id}`),
    ...world.WORLD_BRIEF.map((entry) => `wa-brief-${entry.id}`),
    ...world.WORLD_EPISODE_NOTES.map((entry) => `wa-episode-${entry.no}`),
    ...world.WORLD_GLOSSARY.map((entry) => `wa-term-${entry.term}`),
    ...world.WORLD_LOCATIONS.map((entry) => `wa-location-${entry.name}`),
  ]);
  const actualDreamAnchors = new Set([
    ...dream.DREAM_CAST_ROSTER.map((entry) => `dream-roster-${entry.id}`),
    ...dream.DREAM_CASES.map((entry) => `dream-case-${entry.no}`),
    ...dream.DREAM_CHARACTERS.map((entry) => `dream-character-${entry.id}`),
    ...dream.DREAM_DOLMINENCE.map((entry) => `dream-dolminence-${entry.id}`),
  ]);
  for (const doc of SEARCH_DOCUMENTS) {
    let source = routeComponents[doc.to];
    if (doc.to.startsWith("/riders/")) {
      assert.ok(existsSync(resolve(root, "src/routes/riders/$id.tsx")));
      assert.ok(byId.has(`rider-${doc.to.split("/").at(-1)}`));
      source = read("src/components/world/rider-page.tsx");
    } else if (doc.to.startsWith("/managers/")) {
      assert.ok(existsSync(resolve(root, `src/routes${doc.to}.tsx`)));
      source = read(doc.to.endsWith("/lejas") ? "src/components/world/lejas-page.tsx" : "src/components/world/manager-stub.tsx");
    } else if (doc.to.startsWith("/characters/")) {
      assert.ok(existsSync(resolve(root, `src/routes${doc.to}.tsx`)));
      const id = doc.to.split("/").at(-1);
      source = read(["terra", "luna"].includes(id) ? "src/components/world/related-page.tsx" : `src/components/world/${id}-page.tsx`);
    } else {
      assert.ok(existsSync(resolve(root, `src/routes${doc.to}.tsx`)));
    }
    assert.ok(source, `${doc.id}: route source exists`);
    if (doc.to === "/world" && actualWorldAnchors.has(doc.hash)) continue;
    if (doc.to === "/dream-chapter" && actualDreamAnchors.has(doc.hash)) continue;
    assert.ok(source.includes(`id="${doc.hash}"`), `${doc.id}: actual anchor ${doc.hash}`);
  }
  for (const expression of ["wa-person-${entry.id}", "wa-brief-${entry.id}", "wa-episode-${episode.no}", "wa-term-${entry.term}", "wa-location-${place.name}"]) {
    assert.ok(annex.includes("id={`" + expression + "`}"), expression);
  }
  for (const expression of ["dream-roster-${entry.id}", "dream-case-${episode.no}", "dream-character-${item.id}", "dream-dolminence-${record.id}"]) {
    assert.ok(dreamPage.includes("id={`" + expression + "`}"), expression);
  }
  // World result anchors belong to visible plates/headings, not a closed detail body.
  assert.match(annex, /<li key=\{place.name\} id=\{`wa-location-\$\{place.name\}`\}>/);
  assert.match(annex, /<li key=\{episode.no\} id=\{`wa-episode-\$\{episode.no\}`\}/);
  assert.match(annex, /<div key=\{entry.term\} id=\{`wa-term-\$\{entry.term\}`\}>/);
});

test("special system descriptions remain literal published component excerpts", () => {
  for (const site of ["extreme", "rexonance"]) {
    const systems = sourceValue(`src/components/${site}-saga/${site}-saga.tsx`, "CORE_SYSTEMS");
    for (const system of systems) {
      const doc = byId.get(`system-${site}-${system.number}`);
      assert.equal(doc.title, system.title);
      assert.equal(doc.description, system.body);
    }
  }
});
