import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

test("opening title fits square and wide destinations without distortion", () => {
  const source = readFileSync(new URL("../src/components/cinematic/opening-handoff.tsx", import.meta.url), "utf8");
  const node = ts.createSourceFile("opening.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    .statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "fitLogoRect");
  assert.ok(node);
  const js = ts.transpile(node.getText(), {target: ts.ScriptTarget.ES2022});
  const context = vm.createContext({});
  vm.runInContext(js, context);
  for (const target of [{left:12, top:8, width:48, height:48}, {left:30, top:10, width:180, height:40}]) {
    const fitted = context.fitLogoRect({left:0, top:0, width:300, height:200}, target);
    assert.equal(fitted.width / fitted.height, 1.5);
    assert.ok(fitted.width <= target.width && fitted.height <= target.height);
    assert.equal(fitted.left + fitted.width / 2, target.left + target.width / 2);
    assert.equal(fitted.top + fitted.height / 2, target.top + target.height / 2);
  }
});

test("EP6 uses the supplied DEUS asset without invented pickup records", () => {
  const source = readFileSync(new URL("../src/components/world/world-home.tsx", import.meta.url), "utf8");
  const record = source.slice(source.indexOf('no: "06",', source.indexOf("const EPISODES"))).split("\n  },")[0];
  assert.match(record, /title: "DEUS"/);
  assert.match(record, /src: "\/episode-06-deus.webp"/);
  assert.doesNotMatch(record, /pickups:/);
  assert.ok(statSync(new URL("../public/episode-06-deus.webp", import.meta.url)).size < 300_000);
});
