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
  assert.equal(synopsis.length, 13);
  assert.match(synopsis[6], /永遠亭へ向かう/);
  assert.match(synopsis[6], /後を追って/);
  assert.match(synopsis[6], /決戦へ向かうよう促す/);
  assert.match(synopsis[7], /十二体の武神/);
  assert.match(synopsis[7], /ロードインヴォーカー/);
  assert.match(synopsis[7], /奪還も、仲間たちとの帰還もまだ果たされない/);
  assert.match(synopsis[7], /最後の決戦が幕を開ける/);
  assert.doesNotMatch(
    synopsis.slice(6).join(""),
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
