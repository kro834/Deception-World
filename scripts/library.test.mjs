import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { LIBRARY_ENTRIES, findLibraryLocation, searchLibrary } from "../src/lib/library-data.ts";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import {
  addLibraryVisit,
  emptyLibrarySaved,
  parseLibrarySaved,
  toggleLibraryBookmark,
  RECENT_LIMIT,
  writeLibrarySaved,
} from "../src/lib/library-storage.ts";

test("library metadata links to published routes and existing dream chapters", () => {
  assert.equal(new Set(LIBRARY_ENTRIES.map((entry) => entry.id)).size, LIBRARY_ENTRIES.length);
  const source = readFileSync(
    new URL("../src/components/dream-chapter/dream-chapter-data.ts", import.meta.url),
    "utf8",
  );
  for (const entry of LIBRARY_ENTRIES) {
    const route = entry.path.startsWith("/riders/") ? "riders/$id" : entry.path.slice(1);
    assert.ok(existsSync(new URL(`../src/routes/${route}.tsx`, import.meta.url)), entry.path);
    if (entry.kind === "chapter")
      assert.ok(source.includes(`title: "${entry.title.split(" ／ ")[1]}"`));
  }
  assert.equal(LIBRARY_ENTRIES.filter((entry) => entry.path.startsWith("/riders/")).length, 8);
  assert.deepEqual(
    LIBRARY_ENTRIES.filter((entry) => entry.kind === "chapter").map((entry) => ({
      title: entry.title,
      hash: entry.hash,
    })),
    DREAM_CASES.map((episode) => ({
      title: `CASE ${episode.no} ／ ${episode.title}`,
      hash: `dream-case-${episode.no}`,
    })),
  );
  const chapterPage = readFileSync(
    new URL("../src/components/dream-chapter/dream-chapter.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(chapterPage.includes("id={`dream-case-${episode.no}`}"));
  const nav = readFileSync(
    new URL("../src/components/world/dossier-nav.tsx", import.meta.url),
    "utf8",
  );
  for (const entry of LIBRARY_ENTRIES.filter(
    (entry) => entry.kind === "person" && entry.id !== "yoake-mamori" && entry.id !== "dante",
  ))
    assert.ok(nav.includes(`href: "${entry.path}"`), entry.path);
  const final = LIBRARY_ENTRIES.find((entry) => entry.id === "final");
  assert.equal(final.title, "ファイナルステージ");
  assert.ok(searchLibrary("ファーフロムサーガ").includes(final));
});
test("search accepts Japanese script, full width Latin, punctuation, and multiple terms", () => {
  assert.ok(searchLibrary("しえる").some((entry) => entry.id === "ciel"));
  assert.ok(searchLibrary("ＳＡＧＡ", "person").some((entry) => entry.id === "saga"));
  assert.ok(searchLibrary("れっくすろわ").some((entry) => entry.id === "rex-loi"));
  assert.deepEqual(
    searchLibrary("CASE ２", "chapter").map((entry) => entry.id),
    ["dream-case-2"],
  );
  assert.equal(searchLibrary("nonexistent").length, 0);
  assert.ok(searchLibrary("展示", "page").some((entry) => entry.id === "gallery"));
});
test("chapter location takes priority while unknown anchors resolve to the published page", () => {
  assert.equal(findLibraryLocation("/dream-chapter", "#dream-case-2").id, "dream-case-2");
  assert.equal(findLibraryLocation("/dream-chapter", "#unknown").id, "dream");
  assert.equal(findLibraryLocation("/api/export"), undefined);
});
test("storage validates version, limits, IDs, timestamps, and deduplicates", () => {
  assert.deepEqual(parseLibrarySaved(null), emptyLibrarySaved());
  assert.throws(() => parseLibrarySaved('{"version":2,"bookmarks":[],"recent":[]}'));
  assert.throws(() => parseLibrarySaved('{"version":1,"bookmarks":["foreign"],"recent":[]}'));
  assert.throws(() =>
    parseLibrarySaved(
      JSON.stringify({ version: 1, bookmarks: [], recent: [{ id: "saga", at: -1 }] }),
    ),
  );
  assert.throws(() =>
    parseLibrarySaved(
      JSON.stringify({ version: 1, bookmarks: [], recent: Array(17).fill({ id: "saga", at: 1 }) }),
    ),
  );
  assert.deepEqual(
    parseLibrarySaved(JSON.stringify({ version: 1, bookmarks: ["saga", "saga"], recent: [] }))
      .bookmarks,
    ["saga"],
  );
});
test("bookmarks toggle and recent visits remain unique and bounded", () => {
  let saved = toggleLibraryBookmark(emptyLibrarySaved(), "saga");
  assert.deepEqual(saved.bookmarks, ["saga"]);
  assert.deepEqual(toggleLibraryBookmark(saved, "saga").bookmarks, []);
  assert.throws(() => toggleLibraryBookmark(saved, "foreign"));
  for (const [index, entry] of LIBRARY_ENTRIES.entries())
    saved = addLibraryVisit(saved, entry.id, index);
  assert.equal(saved.recent.length, RECENT_LIMIT);
  saved = addLibraryVisit(saved, "saga", 100);
  assert.equal(saved.recent[0].id, "saga");
  assert.equal(saved.recent.filter((item) => item.id === "saga").length, 1);
});

test("persistence preserves latest tab state and never replaces corrupt or denied storage", () => {
  let raw = JSON.stringify(toggleLibraryBookmark(emptyLibrarySaved(), "realm"));
  const storage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
  const saved = writeLibrarySaved(storage, (state) => toggleLibraryBookmark(state, "saga"));
  assert.deepEqual(saved.bookmarks, ["realm", "saga"]);
  const before = raw;
  assert.throws(() =>
    writeLibrarySaved(
      {
        ...storage,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      (state) => toggleLibraryBookmark(state, "lore"),
    ),
  );
  assert.equal(raw, before);
  raw = "invalid";
  assert.throws(() => writeLibrarySaved(storage, (state) => toggleLibraryBookmark(state, "lore")));
  assert.equal(raw, "invalid");
  assert.throws(() =>
    writeLibrarySaved(
      {
        ...storage,
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
      (state) => state,
    ),
  );
});
