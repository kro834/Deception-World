import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

// Physical lines in the 58,405-line attachment supplied on 2026-10-12.
// 2026/10/08 and 2026/10/12 are chat-post dates, not elapsed story days.
// The source remains outside the repository; opt in to direct comparison with
// DREAM_TIMELINE_SOURCE=/absolute/path/to/the/attachment.
const additions = DREAM_CHRONICLE.slice(44, 49);
const expected = [
  [45, "58050", "58024"],
  [46, "58207,58261", "58207"],
  [47, "58335,58341", "58335"],
  [48, "58363", "58363"],
  [49, "58385,58398,58404", "58404"],
];

test("new events identify their source revision and preserve the battle-opening endpoint", () => {
  assert.deepEqual(
    additions.map(({ no, lines, title }) => [no, lines, title.lines]),
    expected,
  );
  for (const event of additions) {
    assert.equal(event.case, "5");
    assert.equal(event.sourceRevision, "2026-10-12");
  }
  assert.ok(DREAM_CHRONICLE.slice(0, 44).every((event) => event.sourceRevision === undefined));
  const synopsis = DREAM_CASES[5].paragraphs;
  // Check the original battle opening at its position within the growing synopsis.
  assert.match(synopsis[6], /永遠亭へ向かう/);
  assert.match(synopsis[6], /後を追って/);
  assert.match(synopsis[6], /決戦へ向かうよう促す/);
  assert.match(synopsis[7], /十二体の武神/);
  assert.match(synopsis[7], /ロードインヴォーカー/);
  assert.match(synopsis[7], /奪還も、仲間たちとの帰還もまだ果たされない/);
  assert.match(synopsis[7], /最後の決戦が幕を開ける/);
  assert.doesNotMatch(
    synopsis.slice(6, 8).join(""),
    /全快|合流を果た|勝利を収め|奪還に成功|帰還を果た/,
  );
});

test(
  "new full utterances, narration and headings match the supplied attachment",
  {
    skip: !process.env.DREAM_TIMELINE_SOURCE,
  },
  () => {
    const lines = readFileSync(process.env.DREAM_TIMELINE_SOURCE, "utf8").split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    assert.equal(lines.length, 58405);
    for (const event of additions) {
      const texts = event.segments ? event.segments.map(({ text }) => text) : [event.text];
      const anchors = event.lines.split(",").map(Number);
      assert.equal(texts.length, anchors.length);
      texts.forEach((text, index) =>
        assert.equal(text, lines[anchors[index] - 1].trim(), `event ${event.no}`),
      );
      assert.ok(
        lines[Number(event.title.lines) - 1].includes(event.title.text),
        `event ${event.no} title`,
      );
    }
    assert.equal(lines[58403], additions.at(-1).segments.at(-1).text);
  },
);

const november26 = DREAM_CHRONICLE.filter(({ sourceRevision }) => sourceRevision === "2026-11-26");
const november26Anchors = [
  [76, "62217,62220,62255,62293", "62217"],
  [77, "62326,62397,62462,62541", "62397"],
  [78, "62566,62590,62605,62608", "62605"],
  [79, "62625,62627", "62627"],
  [80, "62650,62666,62678", "62666"],
  [81, "62792,62801,62818,62938", "62801"],
  [82, "62955,63016,63026,63035,63047", "63035"],
  [83, "63112,63124,63130,63164", "63130"],
  [84, "63205,63220,63229,63255", "63205"],
  [85, "63272", "63274"],
];

test("November 26 appends Case 5 scenes in post order and stops at the swing", () => {
  assert.deepEqual(november26.map(({ no, lines, title }) => [no, lines, title.lines]), november26Anchors);
  assert.ok(november26.every((event) => event.case === "5"));
  const previous = DREAM_CHRONICLE[74];
  assert.equal(previous.sourceRevision, "2026-11-18");
  assert.equal(previous.lines, "62207,62209,62210");
  assert.equal(DREAM_CHRONICLE.at(-1), november26.at(-1));
  assert.equal(november26.at(-1).title.text, "電圧をまとったその拳");
  assert.equal(november26.at(-1).segments[0].by, "東風谷慶弥");
  const synopsis = DREAM_CASES[5].paragraphs.slice(29);
  assert.equal(synopsis.length, 6);
  assert.match(synopsis[2], /博麗大結界の破壊.*ワンの語る計画/);
  assert.match(synopsis[3], /サヨと伴蔵.*にとりを、伴蔵が抱きとめた/);
  assert.match(synopsis.at(-1), /早苗.*拳が止まる.*元のゼッツダークネス.*セブンのベルトに向け、電圧をまとった拳を振り抜いた。$/);
});

test("November 26 export matches the previous endpoint and every added excerpt", {
  skip: !process.env.DREAM_NOV26_SOURCE,
}, () => {
  const lines = readFileSync(process.env.DREAM_NOV26_SOURCE, "utf8").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  assert.equal(lines.length, 63274);
  const previous = DREAM_CHRONICLE[74];
  for (const [index, line] of [62199, 62201, 62202].entries()) {
    // The final line also closes the multiline message in the export.
    const closingQuote = line === 62202 ? '"' : "";
    assert.ok(lines[line - 1] === previous.segments[index].text + closingQuote, `previous endpoint at ${line}`);
  }
  for (const event of november26) {
    const anchors = event.lines.split(",").map(Number);
    assert.equal(event.segments.length, anchors.length);
    for (const [index, line] of anchors.entries()) {
      assert.ok(lines[line - 1].trim() === event.segments[index].text, `event ${event.no}, line ${line}`);
    }
    assert.ok(lines[Number(event.title.lines) - 1].includes(event.title.text), `event ${event.no} title`);
  }
  // Only the heading quotes the last line. Its second-person narration belongs in the synopsis.
  assert.ok(lines.at(-1).includes("ベルトに向けて、過去最大の圧倒的電圧をまとったその拳を振り抜いた"));
});
