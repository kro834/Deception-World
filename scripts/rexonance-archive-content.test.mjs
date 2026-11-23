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
    // The owner's canon of 2026-11-23: one finisher, its three calls, and
    // the stages' own words.
    "デウスシフト・レクソナンスパーク",
    "『MIDDLE！HIGH！XHIGH！MAX！ULTRA！』",
    "『DEUS SHIFT！！』",
    "『REXONANCE PERK！！』",
    "毎秒5穣（5×10²⁸）回以上",
    "超高密度の出力収束による周囲の空間崩壊を防ぐための安全制御として60秒の時間制限が設けられている",
    "レクソナンスコアを強く押し込むことで移行する、時間制限なしの攻撃限界拡張状態である。",
    '["認識・制御", "『Paranormal Realizer Ultra』／『Neural Resonancer Ultra』／『P14』"]',
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
    // Owner's canon 2026-11-23: five printed calls, one beat each
    // (Ultra DEUS！ opens the call again).
    "Ultra DEUS！",
    "REXONANCE！",
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
  // The archive's call grid is exactly the five lines, in order.
  assert.ok(
    updateSource.includes(
      '<div class="rexonance-call-grid">' +
        calls.map((call) => `<span>${call}</span>`).join("") +
        "</div>",
    ),
  );
  for (const obsolete of [
    "EXCONVERT！",
    "GODSIDE！RIDER！",
    "FAR UP！",
    "OVER SA-GA！RIDER！",
    // Owner 2026-11-23: no longer in the call.
    "<span>RIDER！</span>",
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
    // Superseded by the canon of 2026-11-23.
    "P14 Extreme Tuning",
    "レクソナンスメテオ",
    "レクソナンスリボルト",
    "REXONANCE METEOR",
    "本形態における神性とは",
    "明示なし",
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
  // The canon of 2026-11-23: its nine chapters, by the owner's titles.
  assert.deepEqual(
    REXONANCE_PROFILE_SECTIONS.map((section) => section.title),
    [
      "概要",
      "製造プロセス・特殊演算構造",
      "統合演算・神経接続機構",
      "超光速機動・推進制御機構",
      "装甲・外観",
      "形態段階",
      "固有能力",
      "追加武装",
      "必殺技",
    ],
  );
  assert.equal(rexonanceSection("概要").length, 3);
  for (const [section, count] of [["製造プロセス・特殊演算構造", 2], ["統合演算・神経接続機構", 4], ["超光速機動・推進制御機構", 3], ["装甲・外観", 1], ["形態段階", 3], ["固有能力", 2], ["必殺技", 1]]) {
    assert.equal(rexonanceEntries(section).length, count, section);
  }
  assert.deepEqual(rexonanceEntries("製造プロセス・特殊演算構造")[0], {
    name: "i-2",
    note: "第2世代・無限縮小製造プロセス",
    body: rexonanceEntries("製造プロセス・特殊演算構造")[0].body,
  });
  const [finisher] = rexonanceEntries("必殺技");
  assert.equal(finisher.name, "デウスシフト・レクソナンスパーク");
  assert.ok(
    finisher.body.startsWith(
      "『MIDDLE！HIGH！XHIGH！MAX！ULTRA！』\n『DEUS SHIFT！！』\n『REXONANCE PERK！！』\n",
    ),
  );
  assert.ok(finisher.body.includes("デュアルエクスコアへ特殊操作を行い、さらにリベレーターを操作することで発動する"));
});
