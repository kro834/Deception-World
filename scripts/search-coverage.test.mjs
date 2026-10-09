// rx6: the site search covers every published record, from the data modules
// the pages render, with chapter metadata that matches the dossiers.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { buildFormIndexSource, extractArchiveForms } from "./build-search-form-index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const cache = new Map();
function loadData(path) {
  const absolute = resolve(root, path);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  runInNewContext(
    ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (specifier) => {
        assert.ok(specifier.startsWith("."), `${path}: ${specifier} is a relative data import`);
        return loadData(resolve(dirname(absolute), `${specifier.replace(/\.ts$/, "")}.ts`));
      },
    },
  );
  return exports;
}
function sourceValue(path, name, references = {}) {
  const file = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(file) === name);
  const exports = {};
  runInNewContext(
    ts.transpileModule(`exports.value = ${declaration.initializer.getText(file)}`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports, ...references },
  );
  return exports.value;
}

const { SEARCH_DOCUMENTS } = loadData("src/components/search/search-data.ts");
const byId = new Map(SEARCH_DOCUMENTS.map((document) => [document.id, document]));
const destinations = new Set(SEARCH_DOCUMENTS.map((document) => document.to));
const world = loadData("src/components/world/world-annex-data.ts");
const dream = loadData("src/components/dream-chapter/dream-chapter-data.ts");
const finalStage = loadData("src/components/final-stage/final-stage-data.ts");
// Values from vm contexts compare by structure, not by realm.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const chapters = (sections) => plain(sections.map(({ no, title }) => ({ no, title })));

test("every rider, manager and character dossier route has a record", () => {
  for (const file of readdirSync(resolve(root, "src/routes/managers"))) {
    if (file === "index.tsx") continue;
    assert.ok(destinations.has(`/managers/${file.replace(".tsx", "")}`), file);
  }
  for (const file of readdirSync(resolve(root, "src/routes/characters"))) {
    if (file === "index.tsx") continue;
    assert.ok(destinations.has(`/characters/${file.replace(".tsx", "")}`), file);
  }
  const managers = ["ZEUS", "REX_LOI", "SHUZA", "OPUS", "REEMU"].map((name) =>
    sourceValue("src/components/world/manager-stub.tsx", name),
  );
  const riders = sourceValue("src/components/world/rider-page.tsx", "RIDER_DOSSIERS", {
    REX_LOI: managers[1],
    REXONANCE_CALLS: [],
    FINAL_STAGE_ENTER_ASSETS: [],
  });
  for (const rider of riders) {
    const document = byId.get(`rider-${rider.id}`);
    assert.equal(document.to, `/riders/${rider.id}`);
    // Chapter metadata matches the rendered dossier (#character-section-NN).
    assert.deepEqual(plain(document.sections), chapters(rider.sections), rider.id);
  }
  for (const manager of managers)
    assert.deepEqual(plain(byId.get(`manager-${manager.id}`).sections), chapters(manager.sections));
});

test("character dossiers index the chapters their pages render", () => {
  const related = loadData("src/components/world/related-data.ts").RELATED_SECTIONS;
  const yoake = loadData("src/components/world/yoake-mamori-data.ts").YOAKE_MAMORI_SECTIONS;
  const dante = loadData("src/components/world/dante-data.ts").DANTE_SECTIONS;
  for (const id of ["terra", "luna"]) {
    const document = byId.get(`character-${id}`);
    assert.equal(document.to, `/characters/${id}`);
    assert.equal(
      document.body,
      related[id].map((section) => [section.title, ...section.body].join("\n")).join("\n"),
    );
    assert.deepEqual(plain(document.sections), chapters(related[id]));
    assert.match(
      read("src/components/world/related-page.tsx"),
      new RegExp(`sections: RELATED_SECTIONS\\.${id},`),
    );
  }
  assert.deepEqual(plain(byId.get("character-yoake-mamori").sections), chapters(yoake));
  assert.match(
    read("src/components/world/yoake-mamori-page.tsx"),
    /const sections = YOAKE_MAMORI_SECTIONS;/,
  );
  assert.deepEqual(plain(byId.get("person-dante").sections), chapters(dante));
  assert.deepEqual(plain(byId.get("person-ciel").sections), plain(byId.get("rider-saga").sections));
});

test("World episodes, columns, terms, places and briefs are all indexed with anchors", () => {
  const columns = loadData("src/components/world/world-columns-data.ts").WORLD_COLUMNS;
  assert.equal(columns.length, 4);
  for (const column of columns) {
    const document = byId.get(`world-column-${column.no}`);
    assert.equal(document.description, column.body);
    assert.equal(document.hash, `world-column-${column.no}`);
  }
  const home = read("src/components/world/world-home.tsx");
  assert.match(home, /locationHash === `world-column-\$\{item\.no\}`/);
  for (const episode of world.WORLD_EPISODE_NOTES)
    assert.ok(byId.has(`world-episode-${episode.no}`));
  for (const entry of world.WORLD_GLOSSARY) assert.ok(byId.has(`world-term-${entry.term}`));
  for (const entry of world.WORLD_LOCATIONS) assert.ok(byId.has(`world-location-${entry.name}`));
  for (const entry of world.WORLD_BRIEF) assert.ok(byId.has(`world-brief-${entry.id}`));
  for (const entry of world.WORLD_CAST_ROSTER) {
    const document = byId.get(`person-${entry.id}`);
    // A roster card defers to the person's own dossier when both match.
    assert.equal(Boolean(document.secondary), Boolean(entry.to));
  }
});

test("Dream cases, characters, factions and terms are indexed", () => {
  for (const entry of dream.DREAM_CASES) assert.ok(byId.has(`dream-case-${entry.no}`));
  for (const entry of dream.DREAM_CHARACTERS) assert.ok(byId.has(`dream-dossier-${entry.id}`));
  for (const entry of dream.DREAM_CAST_ROSTER) assert.ok(byId.has(`dream-person-${entry.id}`));
  for (const entry of dream.DREAM_DOLMINENCE) assert.ok(byId.has(`dream-dolminence-${entry.id}`));
  for (const entry of dream.DREAM_FACTIONS) {
    const document = byId.get(`dream-faction-${entry.id}`);
    assert.equal(document.hash, `dream-faction-${entry.id}`);
    assert.ok(document.body.includes(entry.statements[0].text));
  }
  for (const entry of dream.DREAM_GLOSSARY)
    assert.equal(byId.get(`dream-term-${entry.term}`).hash, "glossary");
  assert.match(read("src/components/dream-chapter/dream-chapter.tsx"), /<section id="glossary"/);
});

test("Final Stage story and cast, and every special-site chapter, are indexed", () => {
  for (const person of finalStage.CAST)
    assert.equal(byId.get(`final-stage-cast-${person.id}`).hash, "characters");
  assert.ok(byId.get("final-stage").body.includes(finalStage.STORY.paragraphs[0]));
  const { SPECIAL_SITE_SECTIONS, SPECIAL_SITE_PATHS } = loadData(
    "src/lib/special-site-sections.ts",
  );
  for (const [site, sections] of Object.entries(SPECIAL_SITE_SECTIONS)) {
    for (const [hash] of sections) {
      if (hash === "top") continue;
      const document = byId.get(`site-${site}-${hash}`);
      assert.equal(document.to, SPECIAL_SITE_PATHS[site]);
    }
  }
  // The side menu lists the same chapters.
  assert.match(read("src/components/world/world-chrome.tsx"), /SPECIAL_SITE_SECTIONS\[/);
});

test("every Form Archive form is indexed from the archive documents, opening the form itself", async () => {
  const saga = extractArchiveForms(read("public/saga-form-archive-embedded.html"), "saga");
  const realm = extractArchiveForms(read("public/realm-form-archive-embedded.html"), "realm");
  assert.ok(saga.length >= 10 && realm.length >= 5);
  for (const form of [...saga, ...realm]) {
    const document = byId.get(`form-${form.archive}-${form.id}`);
    assert.ok(document, `${form.archive}/${form.id}`);
    assert.equal(document.title, form.name);
    assert.equal(document.to, "/form-archive");
    assert.deepEqual(
      plain(document.search),
      // rx6: the archive keeps ?form= in its URL, so a hit opens the form itself.
      form.archive === "realm" ? { archive: "realm", form: form.id } : { form: form.id },
    );
  }
  // Regenerate with `node scripts/build-search-form-index.mjs` after an archive edit.
  assert.equal(read("src/components/search/form-archive-index.ts"), await buildFormIndexSource());
});

test("dossier records carry the library's English spellings", () => {
  assert.ok(byId.get("rider-saga").aliases.includes("saga"));
  assert.ok(byId.get("manager-rex-loi").aliases.includes("rex loi"));
});
