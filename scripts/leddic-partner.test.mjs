import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rider = read("src/components/world/rider-page.tsx");
const riderParts = ["01.part", "03.part", "04.part", "05.part"]
  .map((part) => read(`source-parts/src/components/world/rider-page.tsx/${part}`))
  .join("\n");
const gate = read("src/components/load-gate.tsx");
const transitionStyles = read("src/styles-world/22.css");
const partnerStyles = read("src/styles-world/26.css");
const navigation = read("src/components/world/dossier-nav.tsx");

test("Leddic adds Chigiri Naikami as Hanaka's skilled-duo partner", () => {
  for (const source of [rider, riderParts]) {
    for (const value of [
      "無神 千桐",
      "CHIGIRI NAIKAMI",
      "ないかみ ちぎり",
      "28歳",
      "198cm",
      "98kg",
      "警察官（警部）",
      "谷山紀章",
      "#敏腕コンビ",
      "レディック！！！ LETS GO！！！！！！！",
      "幹部候補生だった",
      "在原華火以外には一度も負けたことがない",
    ]) {
      assert.ok(source.includes(value), `${value} should remain in the Leddic dossier`);
    }
    assert.match(source, /className="rider-archive-civilian rider-partner-card"/);
    assert.match(source, /rider\.partner\.facts\.map/);
  }
});

test("Hanaka's Ishihen and Chigiri's Hoko and Rekka forms preserve every supplied catalog value", () => {
  for (const value of [
    "石偏フォーム",
    "GUARD By ROCK！！",
    "230cm",
    "308kg",
    "10.6t",
    "30.4t",
    "0.5m",
    "15秒",
    "草かんむりフォームと同じタイミング",
    "原子同士の結合を無理矢理破壊",
    "岩山盾",
    "480kg",
    "戈フォーム",
    "BREAK & Destroy！！！",
    "209.6cm",
    "99.8kg",
    "2t",
    "15t",
    "58.3m",
    "4.7秒",
    "1.35倍",
    "円龍幻月刀",
    "ヴァルキリー",
    "灬フォーム",
    "Frame To BURST！！！！",
    "199cm",
    "72kg",
    "0.2t",
    "68.2t",
    "88m",
    "0.5秒",
    "炎爪",
  ]) {
    assert.ok(rider.includes(value), `${value} should remain in Chigiri's form records`);
  }
  assert.match(rider, /partnerForms\.map/);
  assert.match(rider, /rider-leddic-hoko\.jpeg/);
  assert.match(rider, /rider-leddic-rekka-20260829\.jpeg/);
  assert.doesNotMatch(rider, /rider-leddic-rekka\.jpeg/);
  assert.doesNotMatch(rider, /rider-leddic-(?:hoko|rekka)-pending\.svg/);
  assert.match(rider, /rider\.id === "leddic"\s*\?\s*rider\.forms/);
});

test("supplied Chigiri artwork is optimized, preloaded, and deployment-stable", () => {
  for (const [file, limit] of [
    ["public/civilian-naikami-chigiri.jpeg", 350_000],
    ["public/rider-leddic-hoko.jpeg", 450_000],
    ["public/rider-leddic-ishihen.jpeg", 350_000],
    ["public/rider-leddic-rekka-20260829.jpeg", 450_000],
  ]) {
    const asset = new URL(`../${file}`, import.meta.url);
    assert.equal(existsSync(asset), true, `${file} should exist`);
    assert.ok(statSync(asset).size < limit, `${file} should stay below ${limit} bytes`);
  }
  assert.match(navigation, /civilian-naikami-chigiri\.jpeg/);
  assert.match(navigation, /rider-leddic-ishihen\.jpeg/);
  assert.match(navigation, /rider-leddic-hoko\.jpeg/);
  assert.match(navigation, /rider-leddic-rekka-20260829\.jpeg/);
});

test("Leddic opens through distinct crimson and green shoji doors", () => {
  assert.match(gate, /CRIMSON × GREEN \/\/ OPEN/);
  assert.match(gate, /leddic-shoji is-left/);
  assert.match(gate, /leddic-shoji is-right/);
  assert.match(transitionStyles, /\.leddic-shoji\.is-left \{[^]*?#341015[^]*?#f44f58|\.leddic-shoji\.is-left \{[^]*?#3a070d/);
  assert.match(transitionStyles, /\.leddic-shoji\.is-right/);
  assert.match(transitionStyles, /translate3d\(-102%, 0, 0\)/);
  assert.match(transitionStyles, /translate3d\(102%, 0, 0\)/);
  assert.match(partnerStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(partnerStyles, /@media \(max-width: 760px\)/);
  assert.match(partnerStyles, /@media \(prefers-reduced-motion: reduce\)/);
});
