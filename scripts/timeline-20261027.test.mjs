import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

// October 27 attachment (60,120 physical lines): the party enters the Dolminence headquarters
// and the final battle continues across Gensokyo. The source stays outside the repository;
// opt in with DREAM_OCT27_SOURCE=/absolute/path/to/the/attachment.
const additions = DREAM_CHRONICLE.slice(53);

test("October 27 story enters the headquarters and keeps the final battle unfinished", () => {
  const dream = DREAM_CASES[5].paragraphs.slice(13).join("");
  for (const scene of ["ドルミネンス本部", "ロードナイト", "摩虎羅", "伐折羅", "如月狡", "毘羯羅"])
    assert.ok(dream.includes(scene), scene);
  assert.match(dream, /紫の胸を貫く/);
  assert.match(dream, /安否は、まだ分からない/);
  assert.match(dream, /誰も命は落としていない/);
  assert.match(DREAM_CASES[5].paragraphs.at(-1), /全員の帰還も、まだ描かれていない。$/);
  assert.doesNotMatch(dream, /奪還に成功|全員が帰還|十二神将を全滅|ロードナイトを倒/);
  assert.deepEqual(
    additions.map(({ no, sourceRevision }) => [no, sourceRevision]),
    [54, 55, 56, 57, 58].map((no) => [no, "2026-10-27"]),
  );
});

test("October 27 excerpts match the attachment exactly", { skip: !process.env.DREAM_OCT27_SOURCE }, () => {
  const lines = readFileSync(process.env.DREAM_OCT27_SOURCE, "utf8").split(/\r?\n/);
  for (const event of additions) {
    const texts = event.segments ? event.segments.map(({ text }) => text) : [event.text];
    const anchors = event.lines.split(",").map(Number);
    assert.equal(texts.length, anchors.length, `event ${event.no}`);
    texts.forEach((text, i) => assert.equal(text, lines[anchors[i] - 1].trim(), `event ${event.no}`));
    assert.ok(lines[Number(event.title.lines) - 1].includes(event.title.text), `event ${event.no}`);
  }
});
