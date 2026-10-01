import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REXONANCE_CALLS } from "../src/lib/rexonance-calls.ts";

const updateSource = readFileSync(
  new URL("../public/rexonance-archive-update.js", import.meta.url),
  "utf8",
);

test("レクソナンス三形態の新設定と基礎値をフォームアーカイブへ保持する", () => {
  for (const expected of [
    "332.2t / 480.5t",
    "REXONANCE DEUS！",
    "FAR UP！",
    "RIDER！",
    "SA-GA OS 5.5",
    "超自己進化",
    "絶対秩序",
    "REXONANCE NANO ARMOR",
    "レルムスレイヤー・マークⅥ",
    "レルムスレイヤー・マークⅩⅣ",
    "レジェンズエッジ",
    "レクソナンスメテオ",
    "レクソナンスリボルト",
    "一時的にレクソナンス・ウルトラへ移行する",
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
    "FAR UP！",
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
    "Ultra DEUS！",
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
  assert.match(updateSource, /\["30\.5×", "100%", "metric-punch"\]/);
  assert.match(updateSource, /\["23\.9×", "100%", "metric-kick"\]/);
  assert.match(updateSource, /\["38,095×", "100%", "metric-speed"\]/);
});
