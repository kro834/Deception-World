import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadingArchive,
  parseArchiveProgress,
  searchReadingArchive,
} from "../src/components/dream-chapter/dream-reading-archive-model.ts";
const events = [
  { no: 1, cast: ["最初の人"], text: "扉を開ける。", lines: "1" },
  { no: 2, cast: ["後の人"], text: "秘密の正体。", lines: "2" },
  { no: 3, cast: ["最初の人"], text: "未来の説明。", lines: "3" },
];
test("progress bounds all identities, evidence, search and counts", () => {
  const scoped = buildReadingArchive(events, ["扉", "秘密"], 1);
  assert.deepEqual(
    scoped.map((entry) => entry.name),
    ["最初の人", "扉"],
  );
  assert.equal(searchReadingArchive(scoped, "秘密").length, 0);
  assert.equal(searchReadingArchive(scoped, "未来").length, 0);
  assert.equal(scoped[0].evidence.length, 1);
  assert.equal(scoped[0].first, 1);
  assert.deepEqual(buildReadingArchive(events, ["扉"], 0), []);
});
test("lowering a reading boundary removes previously available evidence", () => {
  assert.equal(buildReadingArchive(events, [], 3)[0].evidence.length, 2);
  assert.equal(buildReadingArchive(events, [], 1)[0].evidence.length, 1);
});
test("corrupt, noninteger, foreign-version and out-of-bounds storage safely returns unread", () => {
  for (const raw of [null, "", "{", "null", "true", '"2"', "{}", "-1", "1.5", "99"])
    assert.equal(parseArchiveProgress(raw, 3), 0);
  assert.equal(parseArchiveProgress("2", 3), 2);
});

test("archive evidence comes only from the actual CASE paragraphs", async () => {
  const { readFile } = await import("node:fs/promises");
  const component = await readFile(
    new URL("../src/components/dream-chapter/dream-reading-archive.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /chapter\.paragraphs\.map/);
  assert.match(component, /buildReadingArchive\(records,/);
  assert.doesNotMatch(component, /buildReadingArchive\(DREAM_CHRONICLE/);
  assert.doesNotMatch(component, /<img|portraitAlt|secondaryAlt/);
  assert.match(component, /dream-case-\$\{reference\(event.no\).chapter\}-paragraph-/);
});
