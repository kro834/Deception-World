import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "../node_modules/typescript/lib/typescript.js";
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(
    (name) => load(resolve(dirname(path), name.endsWith(".ts") ? name : `${name}.ts`)),
    module,
    module.exports,
  );
  cache.set(path, module.exports);
  return module.exports;
}
const graph = load("src/lib/world-map-data.ts");
const sources = load("src/components/world/world-annex-data.ts");
const forms = load("src/components/search/form-archive-index.ts");
test("world map identities are unique, public and edges resolve to distinct nodes", () => {
  const ids = graph.WORLD_MAP_NODES.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    new Set(graph.WORLD_MAP_NODES.map((n) => n.kind)),
    new Set(Object.keys(graph.MAP_KINDS)),
  );
  for (const n of graph.WORLD_MAP_NODES) {
    assert.doesNotMatch(n.title, /[?？]{2}|未公開|非公開/);
    assert.ok(n.href.startsWith("/"));
  }
  for (const e of graph.WORLD_MAP_EDGES) {
    assert.ok(ids.includes(e.from));
    assert.ok(ids.includes(e.to));
    assert.notEqual(e.from, e.to);
    assert.ok(e.evidence.startsWith("/"));
  }
});
test("every appearance relationship is backed by an exact mention in its cited episode paragraph", () => {
  for (const e of graph.WORLD_MAP_EDGES.filter((e) => e.label === "記録に登場")) {
    const [, no, index] = e.to.split(":");
    const episode = sources.WORLD_EPISODE_NOTES.find((c) => c.no === no);
    const subject = graph.WORLD_MAP_NODES.find((n) => n.id === e.from);
    assert.ok(episode.synopsis[Number(index)].includes(subject.title));
    assert.equal(e.evidence, `/world#wa-episode-${no}`);
  }
});
test("archive form ownership is retained without equating forms with people", () => {
  for (const f of forms.FORM_ARCHIVE_FORMS) {
    const node = graph.WORLD_MAP_NODES.find((n) => n.id === `form:${f.archive}:${f.id}`);
    assert.equal(node.title, f.name);
    const owner = `person:${f.archive === "saga" ? "yuma" : "bell"}`;
    assert.ok(graph.mapNeighbors(node.id).has(owner));
  }
});
test("search, kind filters and invalid shared URLs are deterministic", () => {
  assert.ok(graph.filterMapNodes("サーガ", "form").length);
  assert.ok(graph.filterMapNodes("", "chapter").every((n) => n.kind === "chapter"));
  assert.deepEqual(graph.filterMapNodes("存在しない記録99999", "all"), []);
  assert.deepEqual(graph.validateMapSearch({ q: 12, kind: "toString", node: "secret" }), {
    q: "",
    kind: "all",
    node: "person:yuma",
  });
  assert.equal(
    graph.validateMapSearch({ node: "person:bell", kind: "person" }).node,
    "person:bell",
  );
});
test("canonical dossier paths preserve identities and shared dossiers do not pick an arbitrary person", () => {
  assert.equal(graph.worldMapHrefForDossier("/managers/rex-loi"), "/world-map?node=person%3Arex");
  assert.equal(graph.worldMapHrefForDossier("/managers/zeus"), "/world-map?node=dossier%3Azeus");
  assert.equal(
    graph.worldMapHrefForDossier("/characters/ciel"),
    "/world-map?node=dream-person%3Aciel",
  );
  assert.match(graph.worldMapHrefForDossier("/riders/leddic"), /kind=person&q=/);
  assert.equal(graph.worldMapHrefForDossier("/managers/unknown"), undefined);
  for (const id of ["rexonance", "far-from", "illusionculum", "meta-unitas"])
    assert.equal(graph.worldMapLabHref(`form:saga:${id}`), `/transformation-lab?rider=${id}`);
  assert.equal(graph.worldMapLabHref("form:saga:rexonance-ultra"), undefined);
});
test("Dream chapter appearances and affiliations remain tied to reviewed public evidence", () => {
  const dream = load("src/components/dream-chapter/dream-chapter-data.ts");
  const names = {
    ciel: "シエル",
    keiya: "慶弥",
    kaisaku: "怪作",
    dynamite: "Dyna・Mite",
    nagamori: "永守荘司",
    aya: "射命丸文",
  };
  for (const c of graph.DREAM_MAP_APPEARANCES) {
    const chapter = dream.DREAM_CASES.find((d) => d.no === c.no);
    assert.ok(chapter);
    for (const id of c.people)
      assert.ok(
        chapter.paragraphs.some((p) => p.includes(names[id])),
        `${id} is witnessed in CASE ${c.no}`,
      );
  }
  for (const e of graph.WORLD_MAP_EDGES.filter((e) => e.label === "所属")) {
    const person = dream.DREAM_CAST_ROSTER.find((p) => `dream-person:${p.id}` === e.from);
    const faction = dream.DREAM_FACTIONS.find((f) => `dream-organization:${f.id}` === e.to);
    assert.equal(person.affiliation, faction.name);
  }
});
test("dossier aliases have one canonical person, and incoming source links resolve without leaking source state", () => {
  assert.equal(
    graph.worldMapHrefForDossier("/riders/vandal"),
    graph.worldMapHrefForDossier("/managers/rex-loi"),
  );
  assert.ok(!graph.WORLD_MAP_NODES.some((n) => n.id === "dossier:vandal"));
  assert.equal(graph.WORLD_MAP_NODES.filter((n) => n.title === "シエル").length, 1);
  assert.equal(graph.validateMapSearch({ source: "/characters/ciel" }).node, "dream-person:ciel");
  assert.equal(graph.validateMapSearch({ source: "/riders/vandal" }).node, "person:rex");
  assert.equal(graph.validateMapSearch({ source: "/riders/leddic" }).kind, "person");
  assert.ok(!Object.hasOwn(graph.validateMapSearch({ source: "/characters/ciel" }), "source"));
  const rider = readFileSync("src/components/world/rider-page.tsx", "utf8");
  assert.match(rider, /id: "vandal"[\s\S]{0,200}person: "レックス・ロワ"/);
});
test("every graph and evidence link targets a public canonical route and an actual source anchor", () => {
  const dream = load("src/components/dream-chapter/dream-chapter-data.ts");
  const library = load("src/lib/library-data.ts");
  const publicPaths = new Set(library.LIBRARY_ENTRIES.map((e) => e.path));
  const worldSource = readFileSync("src/components/world/world-annex.tsx", "utf8");
  const dreamSource = readFileSync("src/components/dream-chapter/dream-chapter.tsx", "utf8");
  // Match the actual rendering templates as well as the corresponding public IDs.
  for (const template of [
    "wa-person-${entry.id}",
    "wa-brief-${entry.id}",
    "wa-episode-${episode.no}",
  ])
    assert.ok(worldSource.includes(template));
  for (const template of [
    "dream-character-${item.id}",
    "dream-roster-${entry.id}",
    "dream-faction-${faction.id}",
    "dream-case-${episode.no}",
  ])
    assert.ok(dreamSource.includes(template));
  const worldAnchors = new Set([
    ...sources.WORLD_CAST_ROSTER.map((p) => `wa-person-${p.id}`),
    ...sources.WORLD_BRIEF.map((p) => `wa-brief-${p.id}`),
    ...sources.WORLD_EPISODE_NOTES.map((c) => `wa-episode-${c.no}`),
  ]);
  const dreamAnchors = new Set([
    ...dream.DREAM_CHARACTERS.map((p) => `dream-character-${p.id}`),
    ...dream.DREAM_CAST_ROSTER.map((p) => `dream-roster-${p.id}`),
    ...dream.DREAM_FACTIONS.map((f) => `dream-faction-${f.id}`),
    ...dream.DREAM_CASES.map((c) => `dream-case-${c.no}`),
  ]);
  for (const href of [
    ...graph.WORLD_MAP_NODES.map((n) => n.href),
    ...graph.WORLD_MAP_EDGES.map((e) => e.evidence),
  ]) {
    const url = new URL(href, "https://deception.invalid");
    assert.ok(publicPaths.has(url.pathname), href);
    if (url.pathname === "/world") assert.ok(worldAnchors.has(url.hash.slice(1)), href);
    if (url.pathname === "/dream-chapter") assert.ok(dreamAnchors.has(url.hash.slice(1)), href);
    if (url.pathname === "/form-archive")
      assert.ok(
        forms.FORM_ARCHIVE_FORMS.some(
          (f) =>
            f.archive === url.searchParams.get("archive") && f.id === url.searchParams.get("form"),
        ),
        href,
      );
  }
});

test("explicit graph selection wins over the original dossier source on subsequent navigation", () => {
  assert.equal(
    graph.validateMapSearch({ source: "/characters/ciel", node: "person:bell" }).node,
    "person:bell",
  );
});
