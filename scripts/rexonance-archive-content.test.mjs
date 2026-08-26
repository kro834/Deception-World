import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updateSource = readFileSync(
  new URL("../public/rexonance-archive-update.js", import.meta.url),
  "utf8",
);

test("レクソナンス三形態の新設定と基礎値をフォームアーカイブへ保持する", () => {
  for (const expected of [
    "332.2t / 480.5t",
    "EXCONVERT！",
    "Ultra DEUS！",
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
