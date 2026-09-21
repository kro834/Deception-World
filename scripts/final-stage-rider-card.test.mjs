import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const riderPage = read("src/components/world/rider-page.tsx");
const styleIndex = read("src/styles-world.css");
const styles = read("src/styles-world/33.css");

test("Saga and Realm dossiers carry a Final Stage special-site card", () => {
  assert.match(riderPage, /special\?: \{/);
  assert.match(riderPage, /name: "ファーフロムサーガ"/);
  assert.match(riderPage, /name: "レルムロイヤル"/);
  assert.match(riderPage, /to: "\/final-stage";/);
  assert.equal((riderPage.match(/to: "\/final-stage",/g) ?? []).length, 2);
  assert.match(riderPage, /className="rider-special-site-card"/);
  assert.match(riderPage, /import \{ GuardedLink \} from "@\/components\/load-gate"/);
  assert.match(riderPage, /FINAL_STAGE_ENTER_ASSETS/);

  const sagaSpecial = riderPage.indexOf('name: "ファーフロムサーガ"');
  const realmId = riderPage.indexOf('id: "realm"');
  const realmSpecial = riderPage.indexOf('name: "レルムロイヤル"');
  const loreId = riderPage.indexOf('id: "lore"');
  assert.ok(sagaSpecial > -1 && realmId > -1 && realmSpecial > -1 && loreId > -1);
  assert.ok(sagaSpecial < realmId, "the Saga special card should sit inside the Saga dossier");
  assert.ok(realmSpecial > realmId, "the Realm special card should follow the Realm id");
  assert.ok(realmSpecial < loreId, "the Realm special card should sit inside the Realm dossier");
});

test("the special-site card styles are loaded in the world cascade", () => {
  assert.match(styleIndex, /@import "\.\/styles-world\/33\.css";/);
  assert.match(styles, /\.rider-special-site-card \{/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
