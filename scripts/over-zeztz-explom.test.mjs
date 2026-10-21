import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dossierImage } from "../src/lib/dossier-images.ts";

test("Over Zeztz reflects Explom's revised calls, estimated stats, anatomy and finisher", () => {
  const source = readFileSync(new URL("../src/components/world/rider-page.tsx", import.meta.url), "utf8");
  const rider = source.slice(source.indexOf('id: "over-zeztz"'), source.indexOf('id: "cipher"'));
  assert.match(source, /rider\.id === "over-zeztz"\s*\? rider\.forms/);
  for (const value of ["フィジカムインパクト", "エクスプロム", "アメイジング！ ライダー！",
    "ゼッツ！ゼッツ！ゼッツ！", "オーバー！", "エクスプロム！", "205.9cm（est.）",
    "110.0kg（est.）", "50.5m（ひと跳び est.）", "1.0秒（100m est.）",
    "エクスプロムスマッシュ", "炸ける", "エクスプロムカプセム",
    "クリムゾンオブザームロッド", "ベリルオプチカム", "ベリルシグナム", "ロバストクラッシャム",
    "オーバーゼッツネイキッド", "エクスプロムレッグ", "アメイジングマスキュラー",
    "オーバーゼッツゲイムライン", "エクスプロムアーム", "変身解除を実行する場合もある。",
    "外部から受けた衝撃を「エクスプロムゲイム」へと変換、蓄積する。"])
    assert.ok(rider.includes(value), value);
  assert.ok(!rider.includes("エクスプロムオーバースマッシュ"));
  assert.ok(!rider.includes("エクプロム・スマッシュ"));
  assert.match(rider, /"ゼッツ！ゼッツ！ゼッツ！",\s*"オーバー！",\s*"エクスプロム！"/);
  const search = readFileSync(new URL("../src/components/search/search-data.ts", import.meta.url), "utf8");
  for (const term of ["炸ける", "エクスプロムカプセム", "ベリルシグナム", "エクスプロムゲイム"])
    assert.ok(search.includes(term), term);
  assert.ok(!search.includes("エクスプロムオーバースマッシュ"));
  assert.equal(rider.split("77.7〜t（est.）").length - 1, 2);
  const image = "/rider-over-zeztz-explom-20261019-v2.jpeg";
  assert.ok(rider.includes(image));
  assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)));
  assert.ok(existsSync(new URL(`../public${dossierImage(image).srcSet}`, import.meta.url)));
});
