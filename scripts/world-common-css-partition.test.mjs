import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const imports = (css) => [...css.matchAll(/@import\s+"([^"]+)"\s*;/g)].map((match) => match[1]);
const source = read("src/lib/world-head.ts");
const compiled = ts.transpileModule(
  source.replace(
    /import (\w+) from "([^"]+)";/g,
    (_, name, path) => `const ${name} = ${JSON.stringify(path)};`,
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const head = {};
new Function("exports", compiled)(head);

function declarations(css) {
  const result = [];
  postcss.parse(css).walkDecls((decl) => {
    const context = [];
    for (let node = decl.parent; node.type !== "root"; node = node.parent) {
      context.unshift(
        node.type === "rule" ? node.selector.replace(/\s+/g, " ") : `@${node.name} ${node.params}`,
      );
    }
    result.push(
      JSON.stringify([context, decl.prop, decl.value.replace(/\s+/g, ""), Boolean(decl.important)]),
    );
  });
  return result.sort();
}

test("the reusable World cascade keeps all original imports in place except isolated sovereign and partner rules", () => {
  const full = imports(read("src/styles-world.css"));
  const common = imports(read("src/styles-world-common.css"));
  assert.equal(full.filter((path) => path === "./styles-world/26.css").length, 1);
  assert.deepEqual(
    common,
    full
      .filter((path) => path !== "./styles-world/26.css")
      .map((path) => path.replace("/20.css", "/20-shared.css")),
  );
  assert.ok(
    common.includes("./styles-world/10.css"),
    "manager base rules retain their original cascade position",
  );
  assert.deepEqual(
    declarations(read("src/styles-world/20.css")),
    declarations(read("src/styles-world/20-shared.css") + read("src/styles-world/20-dossier.css")),
    "no sovereign selector, declaration, media condition or keyframe is lost or added",
  );
});

test("World signals and cascade-sensitive sovereign subjects stay in the shared sheet", () => {
  const shared = read("src/styles-world/20-shared.css");
  const dedicated = read("src/styles-world/20-dossier.css");
  assert.doesNotMatch(dedicated, /\.(?:signal|signal-apex|manager-[\w-]+)\b/);
  for (const subject of [
    ".signal.zeus-signal",
    ".signal-apex",
    ".is-sovereign .manager-topbar",
    ".is-sovereign .manager-portrait-frame",
    ".is-sovereign .manager-portrait-column::before",
    ".sovereign-status-copy p",
    ".sovereign-status::after",
    ".sovereign-emblem > i",
  ]) {
    assert.ok(shared.includes(subject), subject);
  }
  assert.match(dedicated, /\.sovereign-apex-seal/);
  assert.match(dedicated, /@keyframes sovereign/);
});

test("dossiers and every rider reuse the same common URL, while only the matching private route adds artwork", () => {
  const common = head.WORLD_BASE_STYLESHEET_LINK;
  assert.equal(common.href, "@/styles-world-common.css?url");
  assert.equal(head.WORLD_CORE_STYLESHEET_LINKS[0], common);
  assert.equal(head.DOSSIER_STYLESHEET_LINKS[0], common);
  assert.deepEqual(head.DOSSIER_STYLESHEET_LINKS.slice(0, 4), head.WORLD_CORE_STYLESHEET_LINKS);
  for (const id of [...Object.keys(head.RIDER_ROUTE_META), "missing"]) {
    const links = head.createRiderHead(id).links;
    assert.equal(links[0], common, id);
    assert.equal(
      links.some(({ href }) => href === "@/styles-world/26.css?url"),
      id === "leddic",
      id,
    );
    assert.ok(!links.some(({ href }) => href === "@/styles-world/20-dossier.css?url"), id);
    assert.equal(links.filter(({ href }) => href === common.href).length, 1, id);
    assert.ok(!links.some(({ href }) => href === "@/styles-world.css?url"), id);
  }
  assert.equal(head.SOVEREIGN_STYLESHEET_LINKS[0], common);
  assert.equal(head.SOVEREIGN_STYLESHEET_LINKS[1].href, "@/styles-world/20-dossier.css?url");
  assert.deepEqual(
    head.SOVEREIGN_STYLESHEET_LINKS.slice(2, 5),
    head.WORLD_CORE_STYLESHEET_LINKS.slice(1),
  );
  assert.match(read("src/routes/managers/zeus.tsx"), /\.\.\.SOVEREIGN_STYLESHEET_LINKS/);
});
