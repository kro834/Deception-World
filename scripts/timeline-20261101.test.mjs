import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

// Revised November 1 attachment: 60,602 physical lines. Keep the private export
// outside the repository; opt in with DREAM_NOV01_SOURCE=/absolute/path/to/export.
const revised = DREAM_CHRONICLE.filter(({ sourceRevision }) => sourceRevision === "2026-11-01");
const textOf = (event) => event.segments.map(({ text }) => text).join("\n");

test("November 1 replaces revised scenes and advances three unresolved encounters", () => {
  assert.deepEqual(
    revised.map(({ no }) => no),
    [57, 58, 59, 60, 61],
  );
  assert.deepEqual(
    DREAM_CHRONICLE.slice(53, 56).map(({ sourceRevision }) => sourceRevision),
    ["2026-10-27", "2026-10-27", "2026-10-27"],
  );
  assert.ok(revised.every(({ case: caseNo }) => caseNo === "5"));
  const [shrine, temple, right, left, resistance] = revised;
  assert.ok(shrine.cast.includes("八雲紫"));
  assert.match(textOf(shrine), /君自身の命.*紫の命/);
  assert.match(textOf(shrine), /惑わされ/);
  assert.ok(temple.cast.includes("豊聡耳神子"));
  assert.match(textOf(temple), /命を留める/);
  assert.equal(right.place, "人里外れの広場");
  assert.match(textOf(right), /タイル.*扉/);
  assert.match(textOf(right), /よく来たな……東風谷慶弥/);
  assert.match(textOf(right), /深く息を吐き/);
  assert.match(textOf(left), /ヴァーテックスサーガ/);
  assert.match(textOf(left), /フェイタルエッジ.*戦闘態勢/);
  assert.doesNotMatch(textOf(left), /ゼロ|総司令官|一閃を繰り出|変身したムツキ/);
  assert.match(textOf(resistance), /生命力/);
  assert.match(textOf(resistance), /二人同時に.*膝をついた/);
});

test("latest CASE 5 synopsis preserves the hostage crisis and unfinished battles", () => {
  const synopsis = DREAM_CASES[5].paragraphs.slice(13).join("\n");
  assert.match(synopsis, /紫を人質/);
  assert.match(synopsis, /十秒のカウントダウン/);
  assert.match(synopsis, /人里外れの広場へ転送/);
  assert.match(synopsis, /シンソウ/);
  assert.match(synopsis, /ムツキに迎えられる/);
  assert.match(synopsis, /死怒.*生命力/);
  assert.doesNotMatch(synopsis, /紫は藍のもと|息を引き取った|紫の瞼を閉じ|全員が帰還|ムツキを倒/);
  assert.match(DREAM_CASES[5].paragraphs.at(-1), /全員の帰還も、まだ描かれていない。$/);
});

test(
  "November 1 excerpts and headings match their physical source lines exactly",
  { skip: !process.env.DREAM_NOV01_SOURCE },
  () => {
    const lines = readFileSync(process.env.DREAM_NOV01_SOURCE, "utf8").split(/\r?\n/);
    // A terminal newline is a separator, not an additional physical line.
    if (lines.at(-1) === "") lines.pop();
    assert.equal(lines.length, 60602, "unexpected source revision or physical line count");
    assert.match(lines[1], /2026\/11\/01 16:41/);
    assert.equal(lines[60377], "2026/11/01(日)");
    for (const event of revised) {
      const anchors = event.lines.split(",").map(Number);
      assert.equal(anchors.length, event.segments.length, `event ${event.no} anchor count`);
      event.segments.forEach(({ text }, index) => {
        const anchor = anchors[index];
        assert.ok(Number.isInteger(anchor) && anchor >= 1 && anchor <= lines.length);
        assert.equal(text, lines[anchor - 1], `event ${event.no}, physical line ${anchor}`);
      });
      const titleAnchor = Number(event.title.lines);
      assert.ok(Number.isInteger(titleAnchor) && titleAnchor >= 1 && titleAnchor <= lines.length);
      assert.ok(lines[titleAnchor - 1].includes(event.title.text), `event ${event.no} heading`);
    }
  },
);
