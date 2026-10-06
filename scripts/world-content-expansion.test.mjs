import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
} from "../src/components/world/world-annex-data.ts";

// Public story dialogue only. Physical lines identify the private attachment
// reviewed in docs/world-content-source-review-20261006.md; it is never copied
// into the repository or made a requirement for the normal test suite.
const selectedLines = [
  { physicalLine: 84, text: "世界を変える", by: "月城悠真" },
  { physicalLine: 261, text: "掴め、悠真", by: "ベル・アレイン" },
  { physicalLine: 428, text: "我々『六詠』が介入し、秩序を保ちます", by: "レックス・ロワ" },
  { physicalLine: 4080, text: "お帰りなさい、ベル", by: "ルナ・アレイン" },
  { physicalLine: 4513, text: "貴方達、運命を捻じ曲げる気ですか", by: "リームー" },
  { physicalLine: 4637, text: "這ってでも取れ！", by: "テラ・アレイン" },
  { physicalLine: 5230, text: "レックスはんには悪いけど、あの子らはうちが貰うわ", by: "シュザ" },
  { physicalLine: 5348, text: "ならば、次は俺が相手をする", by: "月城悠真" },
  {
    physicalLine: 5482,
    text: "───もっとも、あんたらは私を愛し.......何を“好き”やと思うかさえも、うちが決めさせてもらうけど",
    by: "シュザ",
  },
  { physicalLine: 7469, text: "頼む。お前の力が必要なんだ", by: "月城悠真" },
  { physicalLine: 7591, text: "生きていて良かった", by: "月城悠真" },
  { physicalLine: 5121, text: "お前の気持ちが分かったよ、悠真", by: "ベル・アレイン" },
  { physicalLine: 7587, text: "そこまでしても……お前達を死なせるわけにはいかなかった", by: "月城悠真" },
  { physicalLine: 7615, text: "少し来てくれるか、サーガ", by: "フェイブル" },
  { physicalLine: 3165, text: "わかった。しろいひと、うるさいからしずかにして", by: "在原華火" },
  {
    physicalLine: 3262,
    text: "やはり管理外の存在からの攻撃は、管理人に対しては弱点の様です。\u3000弱点を見つけられて良かったですね、君達",
    by: "リームー",
  },
];

const publishedLines = [
  ...WORLD_EPISODE_NOTES.flatMap(({ lines }) => lines),
  ...WORLD_QUOTES,
  ...WORLD_CAST_ROSTER.flatMap(({ name, line }) => line ? [{ text: line, by: name }] : []),
  ...WORLD_GLOSSARY.flatMap(({ said }) => said),
];

test("selected World dialogue preserves source wording and speakers", () => {
  for (const { text, by } of selectedLines) {
    assert.ok(publishedLines.some((line) => line.text === text && line.by === by), by);
  }
  assert.equal(
    WORLD_GLOSSARY.find(({ term }) => term === "管理外の存在").said[0].text,
    selectedLines.find(({ physicalLine }) => physicalLine === 3262).text,
    "the space within the complete speech must remain an ideographic space",
  );
});

const sourcePath = process.env.WORLD_CONTENT_SOURCE;
test("selected dialogue matches the reviewed attachment's physical lines", { skip: !sourcePath }, () => {
  const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
  for (const { physicalLine, text, by } of selectedLines) {
    const sourceLine = sourceLines[physicalLine - 1];
    const start = sourceLine.indexOf("「");
    const end = sourceLine.lastIndexOf("」");
    assert.ok(start >= 0 && end > start, `${by}: ${physicalLine}`);
    // This in-story speaker cue is attribution, not part of Hanabi's words.
    const sourceText = sourceLine.slice(start + 1, end).replace(/^『華火』/, "");
    assert.equal(text, sourceText, `${by}: ${physicalLine}`);
  }
});

test("World episode records follow the actual chapter boundaries and later consequences", () => {
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ no, title }) => [no, title]),
    [["01", "HIDE-AND-SEEK"], ["02", "LEGENDS"], ["03", "DECEPTION WORLD"]],
  );
  for (const { synopsis } of WORLD_EPISODE_NOTES) {
    assert.ok(synopsis.length >= 2 && synopsis.length <= 3);
    assert.ok(synopsis.every((paragraph) => paragraph.length > 80));
  }
  const first = WORLD_EPISODE_NOTES[0].synopsis.join("");
  assert.match(first, /誰も彼を攻略できない/);
  const legends = WORLD_EPISODE_NOTES[1].synopsis.join("");
  assert.match(legends, /弟をかばったテラが命を落とす/);
  assert.match(legends, /不適正と変身不可/);
  const ongoing = WORLD_EPISODE_NOTES[2].synopsis.join("");
  assert.match(ongoing, /リームーが神聖なる間へ戻る/);
  assert.match(ongoing, /4\.2秒/);
  assert.match(ongoing, /ジェームズと真守の傷を消す/);
  assert.match(ongoing, /シュザがまだ彼らを狙っている/);
  assert.match(ongoing, /黒い扉からフェイブルが現れ/);
  assert.doesNotMatch(ongoing, /シュザを倒した|シュザを倒す|テラが復活|新しいコアが完成|全ての戦いが終わ/);
});

test("the dream refuge describes witnessed recovery without promising a safe ending", () => {
  assert.equal(WORLD_EPISODE_NOTES[2].stage, "天守閣〜悠真の夢");
  const dream = WORLD_LOCATIONS.find(({ name }) => name === "悠真の夢");
  assert.match(dream.text, /ジェームズと真守の傷を消す/);
  assert.match(dream.text, /フェイブル/);
  const nightmare = WORLD_GLOSSARY.find(({ term }) => term === "マキャベルゴアナイトメア");
  assert.match(nightmare.body.join(""), /変身を解除/);
  assert.doesNotMatch(dream.text + nightmare.body.join(""), /永遠に安全|シュザに勝利|夢の世界を支配/);
  for (const { synopsis } of WORLD_EPISODE_NOTES) {
    assert.doesNotMatch(synopsis.join(""), /保存日時|\[LINE\]|参加しました|送信を取り消しました|@/);
  }
});
