import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_EPISODE_NOTES, WORLD_GLOSSARY } from "../src/components/world/world-annex-data.ts";

const story = WORLD_EPISODE_NOTES.find(({ no }) => no === "04").synopsis.join("");
test("EP4 advances to November 1 while leaving pending conflicts unresolved", () => {
  for (const passage of ["去年、夢の中で共闘した熱血漢", "融合も、ハイクの推測にとどまる", "敵として現れた理由はまだ分からない", "真守は朱い海面へ浮上", "生きようとする思いを取り戻し始める", "使用には命の危険", "ローアとセヴンとの三人", "シュザとの再戦はまだ始まっていない", "ダンテも自分の世界を喰われたのではないかと問い詰める", "ミラがリュシアンを殴って気絶", "発言の成否も、まだ分からない"])
    assert.ok(story.includes(passage), passage);
  assert.doesNotMatch(story, /その答えはまだ語られておらず|シュザを撃破|真守が復帰|第五の犬を倒した/);
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
