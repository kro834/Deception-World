import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_EPISODE_NOTES } from "../src/components/world/world-annex-data.ts";

const ep4 = WORLD_EPISODE_NOTES.find(({ no }) => no === "04");
const ep5 = WORLD_EPISODE_NOTES.find(({ no }) => no === "05");

test("EP4 closes the two fights and leaves the red phenomenon unexplained", () => {
  const [moat, castle, succession, polaris, aftermath] = ep4.synopsis.slice(11);
  assert.match(moat, /エクスプロムスマッシュでフリートを退ける.*折れた天智/);
  assert.match(castle, /管理権限を盗む.*慶弥が神・武王発勁/);
  assert.match(succession, /ダンテ.*ディセプションガヴを奪って.*シュザは消滅/);
  assert.match(polaris, /レディック 犭フォーム.*千桐が二人の間に飛び込み、ダンテを倒した/);
  assert.match(aftermath, /大輪拳・徒桜.*赤い波動はダンテの亡骸を包み、どこへ向かったかも分からぬ/);
  assert.doesNotMatch(ep4.synopsis.slice(11).join(""), /リームーが死|フリートが死|城から退く|赤い海へ戻る/);
});

test("EP5 records the evacuation and ends at the greeting in the dream", () => {
  const [castle, flashback, rescue, end] = ep5.synopsis;
  assert.match(castle, /変身を解かれた千桐.*城から退く/);
  assert.match(flashback, /^その少し前.*未知のカプセムは消滅.*意識を失った/);
  assert.match(rescue, /ジェームズ.*シエルに出口の扉を求めた.*赤い海へ戻る/);
  assert.match(end, /古いソファー.*マキャベルゴアナイトメア.*シエルを迎えた/);
  assert.deepEqual(ep5.lines.at(-1), {
    text: "お帰りなさい、シエル",
    by: "マキャベルゴアナイトメア",
  });
  assert.doesNotMatch(ep5.synopsis.join(""), /全快|ジェームズが目覚め|赤い波動の正体が/);
});

// The owner-supplied LINE export is only needed for this optional evidence check.
const sourcePath = process.env.WORLD_TIMELINE_20261126_SOURCE;
test("the latest story boundary and quotations match the supplied export", { skip: !sourcePath }, () => {
  const lines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
  assert.match(lines[13467 - 1], /トークルーム名を「𝐸𝑃𝟓「来訪」」に変更しました/);
  for (const [index, line] of [13485, 13618, 13660].entries()) {
    assert.equal(lines[line - 1].trim().replace(/^「|」$/g, ""), ep5.lines[index].text);
  }
  assert.equal(lines.filter((line) => line.trim()).at(-1), '"');
  assert.ok(lines.slice(13660).some((line) => line.includes("その声が、波紋のように優しく響き渡った")));
});
