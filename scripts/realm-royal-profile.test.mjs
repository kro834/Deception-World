import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REALM_ROYAL } from "../src/components/final-stage/final-stage-data.ts";
import { syncRealmRoyalProfile } from "./sync-realm-royal-profile.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Realm Royal retains the owner's November setting, limits and Ultra baseline", () => {
  assert.deepEqual(
    REALM_ROYAL.systems.map((item) => item.title),
    ["エクスサーガドライバー", "レアストラコア", "レジェンズルーレット"],
  );
  assert.deepEqual(
    REALM_ROYAL.computing.map((item) => item.title),
    ["Spark XR", "REALMS OS 6", "Paranormal Realizer Pro Max", "Neural Resonancer Pro Max"],
  );
  assert.deepEqual(
    Object.values(REALM_ROYAL.forms).map((form) => form.body.length),
    [2, 3, 3, 3, 4],
  );
  const specs = Object.fromEntries(REALM_ROYAL.forms.nehan.specs.map(({ dt, dd }) => [dt, dd]));
  assert.equal(specs["パンチ力"], "398.2t");
  assert.equal(specs["キック力"], "663.5t");
  assert.equal(specs.EMP, "5000E");
  assert.match(REALM_ROYAL.abilities[1].body.join(""), /貯蔵容量の限界/);
  assert.match(REALM_ROYAL.forms.nehan.body.join(""), /消費したEMPが回復するわけではない/);
  assert.deepEqual(
    REALM_ROYAL.finishers.map((item) => item.body.length),
    [3, 5],
  );
  assert.doesNotMatch(
    JSON.stringify(REALM_ROYAL),
    /ロイヤルコア|レルムズドライバー|再抽選権|勝利譚の加護/,
  );
});

test("Royal static cards and comparison table stay synchronized without changing artwork", () => {
  const standalone = read("archives/realm-form-archive-standalone.html");
  assert.equal(syncRealmRoyalProfile(standalone), standalone, "projection is idempotent");
  for (const path of [
    "archives/realm-form-archive-standalone.html",
    "public/realm-form-archive-embedded.html",
  ]) {
    const html = read(path);
    const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(
      (match) => match[0],
    );
    const ultra = cards.filter((card) =>
      /id="realm--(?:saga-compare-[ab]-)?saga-detail-royal-nehan"/.test(card),
    );
    assert.equal(ultra.length, 3);
    for (const card of ultra) {
      assert.match(card, /398\.2t/);
      assert.match(card, /663\.5t/);
      assert.match(card, /data-image-key="royal-nehan"/);
      assert.doesNotMatch(card, /勝利譚|因果補正|王国宣言|再抽選/);
    }
    const row = html.match(/<tr data-form-id="royal-nehan">[\s\S]*?<\/tr>/)?.[0];
    assert.match(row, /398\.2t<\/td><td>663\.5t/);
    assert.doesNotMatch(html, /ロイヤルコア|王国宣言|終端属性群/);
  }
});
