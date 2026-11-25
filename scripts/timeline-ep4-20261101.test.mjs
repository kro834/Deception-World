import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_EPISODE_NOTES, WORLD_GLOSSARY } from "../src/components/world/world-annex-data.ts";

const { synopsis } = WORLD_EPISODE_NOTES.find(({ no }) => no === "04");

test("EP4 carries its November 1 events and their uncertainties into the continuation", () => {
  const earlier = synopsis.slice(0, 5).join("\n");
  assert.match(earlier, /六詠が世界を融合させているのではないかと考える/);
  assert.match(earlier, /慶弥とは去年、夢の中で共闘/);
  assert.match(earlier, /朱い海の底.*水面に上がった/);
  assert.match(earlier, /リミッターが外されており、使う者の命にも関わる/);
  assert.match(earlier, /ローアとジェームズを連れ、三人で向かう/);
  assert.match(earlier, /ダンテも自分の世界を喰われたのかと問う/);
  assert.match(earlier, /ミラがリュシアンを殴って気絶/);
});

test("EP4 reaches the November 18 exchange in the ruined castle", () => {
  const [dream, headquarters, trap, explom, returnToCastle, exchange] = synopsis.slice(5, 11);
  assert.match(dream, /魔理沙の面影.*花畑を出た.*崩壊の異界/);
  assert.match(headquarters, /ヴァルグ.*CODE北米本部を壊滅.*ウィル.*救難信号/);
  assert.match(trap, /シュザを裏切る.*焔雷・暁天穿.*再生までシュザに打ち消された/);
  assert.match(explom, /ナイトメアの力が目覚め.*エクスプロム.*フリートは再び天智で斬りかかる/);
  assert.match(returnToCastle, /真守がアルゲノム.*予告状.*レディックとなった千桐/);
  assert.match(exchange, /右手のガシャコンエッジを砕かれた.*もう一本を左手に.*片膝をついて踏みとどまった/);
  assert.doesNotMatch(synopsis.slice(0, 11).join(""), /シュザを撃破|フリートを倒した|第五の犬を倒した/);
});

test("implemented technology preserves its danger and EP3 historical development state", () => {
  const technology = WORLD_GLOSSARY.find(({ term }) => term === "反管理権限").body.join("");
  assert.match(technology, /レディックウォッチとゼッツドライバーへの実装を終えた/);
  assert.match(technology, /使用者の生命への危険/);
  assert.match(WORLD_EPISODE_NOTES.find(({ no }) => no === "03").synopsis.at(-1), /十七時間を要すると告げる/);
});

// Private export remains external. Posting dates: Oct 28 L10560-10578;
// Nov 1 16:10 L10614-10653 and 16:13 L10655-10764. Ranges are physical lines.
const sourcePath = process.env.WORLD_EP4_20261101_SOURCE;
test("EP4 quotations match the private November 1 LINE export", { skip: !sourcePath }, () => {
  const lines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
  assert.ok(lines.length >= 10764);
  assert.equal(lines[10590], "2026/11/01(日)");
  for (const [first, last, excerpt] of [
    [10560, 10578, "去年、夢の中で共闘した熱血漢だ"],
    [10560, 10566, "多分六詠にしかできない芸当だろ"],
    [10614, 10653, "生の執着と葛藤の火"],
    [10673, 10681, "リミッター外れてるよ"],
    [10683, 10688, "『反管理権限』を実装済みさ"],
    [10691, 10707, "三人で行くぞ"],
    [10715, 10747, "自分の世界を、アイツに喰われたんじゃないのか"],
    [10750, 10764, "リュシアンを気絶させたミラ"],
    [10750, 10764, "何処かへと歩き去って行った"],
  ]) assert.ok(lines.slice(first - 1, last).join("\n").includes(excerpt), `${first}-${last}: ${excerpt}`);
});
