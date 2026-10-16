import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REXONANCE_CALLS } from "../src/lib/rexonance-calls.ts";
import { REXONANCE_PROFILE_SECTIONS, rexonanceEntries, rexonanceSection } from "../src/lib/rexonance-profile.ts";

const updateSource = readFileSync(
  new URL("../public/rexonance-archive-update.js", import.meta.url),
  "utf8",
);

test("レクソナンス三形態の新設定と基礎値をフォームアーカイブへ保持する", () => {
  for (const expected of [
    // Owner 2026-10-16: self-resonance, revised catalog values and manufacturing lore.
    "372.2t / 483.5t",
    "REXONANCE DEUS！",
    "Ultra DEUS！",
    "RIDER！",
    "SA-GA OS 5.5",
    "超自己進化",
    "自己共鳴",
    "第五の犬",
    "50000〜YOPS",
    "無限大",
    "二角形構造",
    "ASTRA-16 Ultra",
    "REXONANCE NANO ARMOR",
    "レルムスレイヤー・マークⅥ",
    "レルムスレイヤー・マークXIV",
    "レジェンズエッジ",
    "レクソナンスメテオ",
    "レクソナンスリボルト",
    "空間の崩壊を防ぐ為に時間制限が設けられている",
  ]) {
    assert.match(updateSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("微調整後の変身音をライダー詳細とフォームアーカイブで同じ順序にする", () => {
  const riderSource = readFileSync(
    new URL("../src/components/world/rider-page.tsx", import.meta.url),
    "utf8",
  );
  const calls = [
    // Owner 2026-10-16: six printed calls; animation keeps its five original beats.
    "Ultra DEUS！",
    "REXONANCE！",
    "RIDER！",
    "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
    "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
    "REXONANCE DEUS！",
  ];
  const riderBlock = riderSource.slice(
    riderSource.indexOf('name: "レクソナンスサーガ"'),
    riderSource.indexOf("stats: [", riderSource.indexOf('name: "レクソナンスサーガ"')),
  );
  assert.deepEqual(REXONANCE_CALLS, calls);
  assert.match(riderSource, /import \{ REXONANCE_CALLS \} from "@\/lib\/rexonance-calls"/);
  assert.match(riderBlock, /calls: \[\.\.\.REXONANCE_CALLS\]/);
  let archivePosition = -1;
  for (const call of calls) {
    archivePosition = updateSource.indexOf(call, archivePosition + 1);
    assert.notEqual(archivePosition, -1, `アーカイブに ${call} が順番どおり存在する`);
  }
  for (const obsolete of [
    "EXCONVERT！",
    "GODSIDE！RIDER！",
    "FAR UP！",
    "OVER SA-GA！RIDER！",
  ]) {
    assert.doesNotMatch(riderBlock, new RegExp(obsolete));
    assert.doesNotMatch(updateSource, new RegExp(obsolete));
  }
});

test("旧レクソナンス設定と旧比較倍率を再表示しない", () => {
  for (const obsolete of [
    "592.6t / 1026.8t",
    "MARIAGE！！",
    "ゴッドメテオ",
    "ゴッドリボルト",
    "パンチ比54.4×",
    "キック比51.1×",
  ]) {
    assert.doesNotMatch(updateSource, new RegExp(obsolete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("比較表の基底倍率を新しいカタログスペックから更新する", () => {
  // Owner 2026-10-16: 372.2/10.9 and 483.5/20.1, rounded to one decimal place.
  assert.match(updateSource, /\["34\.1×", "100%", "metric-punch"\]/);
  assert.match(updateSource, /\["24\.1×", "100%", "metric-kick"\]/);
  assert.match(updateSource, /\["38,095×", "100%", "metric-speed"\]/);
});

test("the archive carries all nine owner sections verbatim and the dossier shares them", () => {
  const data = updateSource.match(/var OWNER_SECTIONS = ([\s\S]*?);\n {2}\/\/ END OWNER_PROFILE_SECTIONS/);
  assert.ok(data);
  assert.deepEqual(JSON.parse(data[1]), REXONANCE_PROFILE_SECTIONS);
  assert.equal(REXONANCE_PROFILE_SECTIONS.length, 9);
  assert.equal(rexonanceSection("概要").length, 5);
  for (const [section, count] of [["製造プロセス", 2], ["統合演算機構", 4], ["超光速機動・推進制御機構", 3], ["装甲・外観", 1], ["能力", 2], ["必殺技", 4]]) {
    assert.equal(rexonanceEntries(section).length, count, section);
  }
  assert.ok(rexonanceEntries("必殺技")[3].body.includes("『REXONANCE PERK！！』"));
  assert.ok(rexonanceEntries("必殺技")[3].body.includes("リベレーターを二度操作し"));
});
