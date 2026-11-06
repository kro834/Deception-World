import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const imports = (css) => [...css.matchAll(/@import\s+"([^"]+)"\s*;/g)].map((match) => match[1]);

test("World's common cascade preserves dossier order except the Leddic partner sheet", () => {
  const full = imports(read("src/styles-world.css"));
  const common = imports(read("src/styles-world-common.css"));
  assert.equal(full.filter((path) => path === "./styles-world/26.css").length, 1);
  assert.deepEqual(common, full.filter((path) => path !== "./styles-world/26.css"));
});

test("the full World cascade remains attached to dossiers", () => {
  const head = read("src/lib/world-head.ts");
  assert.match(head, /WORLD_BASE_STYLESHEET_LINK[\s\S]*?href:\s*worldCommonCssUrl/);
  assert.match(head, /DOSSIER_STYLESHEET_LINKS[\s\S]*?href:\s*worldCssUrl/);
});
