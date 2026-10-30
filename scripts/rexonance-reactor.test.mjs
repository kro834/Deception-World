import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import postcss from "postcss";
import * as calls from "../src/lib/rexonance-calls.ts";
import * as suit from "../src/lib/rexonance-suit.ts";
import * as ignition from "../src/lib/rexonance-ignition.js";
import {
  reactorFormation,
  reactorCoilAngle,
  reactorCoilScale,
} from "../src/lib/rexonance-reactor.js";
import {
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_GOLD_AT,
} from "../src/lib/rexonance-calls.ts";

test("the reactor coil turns and grows continuously into the exact original pose", () => {
  assert.equal(reactorFormation(0), 0);
  assert.equal(reactorFormation(1), 1);
  assert.equal(reactorCoilAngle(0), -Math.PI * 1.25);
  assert.equal(reactorCoilAngle(1), 0);
  assert.equal(reactorCoilScale(0), 0.55);
  assert.equal(reactorCoilScale(1), 1);
  for (let step = 1; step <= 100; step += 1) {
    const before = (step - 1) / 100;
    const now = step / 100;
    assert.ok(reactorFormation(now) > reactorFormation(before));
    assert.ok(reactorCoilAngle(now) > reactorCoilAngle(before));
    assert.ok(reactorCoilScale(now) > reactorCoilScale(before));
  }
  for (const u of [-5, -1, 2, 20]) {
    const edge = u < 0 ? 0 : 1;
    assert.equal(reactorFormation(u), reactorFormation(edge));
    assert.equal(reactorCoilAngle(u), reactorCoilAngle(edge));
    assert.equal(reactorCoilScale(u), reactorCoilScale(edge));
  }
});

test("only the coil joins the reactor clock; every other entrance seat keeps its timing", () => {
  assert.equal(REXONANCE_SUIT_FIT["core-swirl"], REXONANCE_SUIT_FIT["core-disc"]);
  assert.equal(REXONANCE_SUIT_GOLD_AT["core-swirl"][0], REXONANCE_SUIT_GOLD_AT["core-disc"][0]);
  for (const { from, to, order } of REXONANCE_SUIT_CASCADE)
    order.forEach((id, index) => {
      if (id === "core-swirl") return;
      assert.equal(
        REXONANCE_SUIT_FIT[id],
        Math.round(from + ((to - from) * index) / (order.length - 1)),
        id,
      );
    });
});

test("the cold DOM coil uses the same reactor window and pivot behind the existing motion gates", () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(
    new URL("../src/components/rexonance-saga/rexonance-call-sequence.tsx", import.meta.url),
    "utf8",
  );
  const probe = {};
  runInNewContext(
    ts.transpileModule(source + "\nexport const __pieceClock = pieceClock;", {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports: probe,
      require(name) {
        if (name === "@/lib/rexonance-calls") return calls;
        if (name === "@/lib/rexonance-suit") return suit;
        if (name === "@/lib/rexonance-ignition.js") return ignition;
        if (name === "./rexonance-suit-nanites") return { SuitNanites() {} };
        // Owner (2026-10-30): the call mounts the surge layer (装着遷移の強化).
        if (name === "./rexonance-suit-surge") return { EntrySurge() {}, EntrySurgeBack() {} };
        return require(name);
      },
    },
  );
  const coil = suit.REXONANCE_SUIT_PIECES.find((piece) => piece.id === "core-swirl");
  const disc = suit.REXONANCE_SUIT_PIECES.find((piece) => piece.id === "core-disc");
  const style = probe.__pieceClock(coil);
  assert.equal(style["--rx-suit-t"], probe.__pieceClock(disc)["--rx-suit-t"]);
  assert.ok(
    Math.abs(
      (Number.parseFloat(style["--rx-coil-x"]) / 100) * coil.w +
        coil.x -
        suit.REXONANCE_SUIT_MARKS.core[0],
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      (Number.parseFloat(style["--rx-coil-y"]) / 100) * coil.h +
        coil.y -
        suit.REXONANCE_SUIT_MARKS.core[1],
    ) < 1e-6,
  );
  const sheet = postcss.parse(
    readFileSync(new URL("../src/styles-rexonance-calls.css", import.meta.url), "utf8"),
  );
  let animations = 0;
  sheet.walkRules((rule) => {
    rule.walkDecls("animation", (declaration) => {
      if (!/rxSuitCoil/.test(declaration.value)) return;
      animations += 1;
      assert.match(
        rule.selector,
        /\[data-mode="entry"\]\[data-tier="full"\]\[data-phase="covering"\]/,
      );
      assert.match(rule.selector, /\[data-piece="core-swirl"\]/);
      assert.match(rule.parent.params, /prefers-reduced-motion: no-preference/);
      assert.match(rule.parent.params, /forced-colors: none/);
      assert.match(declaration.value, /100ms/);
      assert.match(declaration.value, /var\(--rx-suit-t\)/);
      assert.doesNotMatch(rule.toString(), /filter:|background-image:|box-shadow:/);
    });
  });
  assert.equal(animations, 2, "only the existing wrapper and art child animate");
  const frames = new Map();
  sheet.walkAtRules("keyframes", (rule) => frames.set(rule.params, rule));
  for (const name of ["rxSuitCoilTurn", "rxSuitCoilGrow"])
    assert.match(frames.get(name).toString(), /to\s*\{\s*transform:\s*none/);
});
