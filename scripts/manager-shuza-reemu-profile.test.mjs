import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/world/manager-stub.tsx", import.meta.url),
  "utf8",
);
const shuza = source.slice(
  source.indexOf("export const SHUZA"),
  source.indexOf("export const REEMU"),
);
const reemu = source.slice(
  source.indexOf("export const REEMU"),
  source.indexOf("export const ZEUS"),
);

test("Shuza dossier preserves the supplied identity, quotes, and authority", () => {
  for (const value of [
    "我慢なんかせんでもええんよ。あんたの欲しいもん、うちにはぜぇんぶ見えてますさかい",
    "好きにしはったらええよ。───もっとも、何を“好き”やと思うかは、もう、うちが決めてしもうたけど",
    "嗚呼…この子、うちの物になったの",
    "176.8cm",
    "61.3kg",
    "欲望／支配",
    "人格、記憶、思考を残したまま",
    "完全支配領域",
    "《朱雅管》",
    "《欲糸》",
  ]) {
    assert.ok(shuza.includes(value), `Shuza dossier should include ${value}`);
  }
  assert.doesNotMatch(shuza, /戦闘演算|最適解|フィフスセプションガヴ/);
});

test("Ruler record preserves the biological system, complete call, parts, and finishers", () => {
  for (const value of [
    'calls: ["GREED!", "GAVV GAVV GAVV GAVV", "GREED!", "DOMINATE!"]',
    "ディセプションガヴ × グリードゴチゾウ",
    "グリードプラズム",
    "背後で『欲しい』を反復",
    "完了時にシュザの名",
    "ディセプションヘッド／デザイアサイト",
    "グリードマスターブレスト／グリードバーストアーム",
    "グリードバーストレッグ",
    "ドミネイトクロー",
    "グリードカラパス／ドミネイトローブ",
    "カラクリポックリ",
    "PHOBOS CRACK！",
    "PHOBOS DESTROY！",
    'name: "フォボスクラック"',
    'name: "フォボスデストロイ"',
  ]) {
    assert.ok(shuza.includes(value), `Ruler record should include ${value}`);
  }
});

test("Reemu dossier replaces the obsolete observation authority without weakening him", () => {
  for (const value of [
    "なんかぁ……死なないといけない運命って辛いですよねぇ",
    "だからまあ、仕方ないですよね",
    "貴方が死ぬのは、僕のせいじゃない",
    "169.0cm",
    "63.2kg",
    "固定管轄なし",
    "状況、責任、因果、運命",
    "言い訳を現実にする男",
    "出力は並の管理人を大きく上回る",
    "ディルクルムサーガを圧倒",
  ]) {
    assert.ok(reemu.includes(value), `Reemu dossier should include ${value}`);
  }
  assert.doesNotMatch(reemu, /観測そのものを権限|観測／非介入|未確定領域/);
});

test("Fleet record preserves the supplied system, equipment, and finisher variants", () => {
  for (const value of [
    "デザイアドライバー × キジンソードバックル",
    'calls: ["SET! AMBITIOUS!", "DIVINE GENERAL!", "KIJIN SWORD!", "READY FIGHT!"]',
    "キジンソードフリートヘッド",
    "5000京光年先",
    "アジャスティングファイ／マーダーマスターチェスト",
    "キジンアーマー／オラクルバンテージ",
    "フルマックスデュアルカスタマイザー",
    "キジンクグツ",
    "KIJIN SWORD STRIKE！",
    "KIJIN SWORD VICTORY！",
    'name: "キジンソードストライク"',
    'name: "キジンソードビクトリー"',
    "十字剣とキック",
  ]) {
    assert.ok(reemu.includes(value), `Fleet record should include ${value}`);
  }
  assert.match(reemu, /フリートは独立戦力としてキジンクグツも生成できる/);
  assert.doesNotMatch(reemu, /name: "天智", body: "[^"]*キジンクグツ/);
});
