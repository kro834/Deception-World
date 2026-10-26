import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as mode from "../src/lib/command-deck-mode.ts";

test("the initial visit stays on the dashboard unless replay is explicitly requested", () => {
  for (const opening of [undefined, false, 0, "0", "false", "true", {}, [], [1]]) {
    assert.equal(mode.showsOpening(mode.validateCommandDeckSearch({ opening })), false);
  }
  for (const opening of [true, 1, "1"]) {
    assert.deepEqual(mode.validateCommandDeckSearch({ opening }), { opening: true });
    assert.equal(mode.showsOpening(mode.validateCommandDeckSearch({ opening })), true);
  }
});

test("existing audit links retain the opening, without coercing unrelated query values", () => {
  for (const value of ["", true, 1, "1"]) {
    assert.equal(
      mode.showsOpening(mode.validateCommandDeckSearch({ "opening-audit": value })),
      true,
    );
  }
  for (const value of [undefined, false, "false", 0]) {
    assert.equal(
      mode.showsOpening(mode.validateCommandDeckSearch({ "opening-audit": value })),
      false,
    );
  }
});

test("dashboard head does not preload the opening; replay head retains its exact cinema assets", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    require(name) {
      if (name === "@tanstack/react-router") return { createFileRoute: () => (config) => config };
      if (name === "@/lib/command-deck-mode") return mode;
      if (name === "@/lib/opening-logo")
        return {
          OPENING_LOGO_FIRST: { src: "/logo.webp", srcSet: "logo-set" },
          OPENING_LOGO_SIZES: "logo-size",
        };
      if (name === "@/lib/world-head") return { DOSSIER_HUD_FONTS_URL: "hud-fonts" };
      if (name.endsWith("?url")) return { default: name };
      return {};
    },
  });
  const head = (search) =>
    exports.Route.head({ match: { search: mode.validateCommandDeckSearch(search) } });
  assert.deepEqual(
    Array.from(head({}).links, (link) => link.href),
    ["../styles-command-deck.css?url"],
  );
  const opening = head({ opening: 1 }).links;
  assert.equal(opening.find((link) => link.rel === "preload").href, "/logo.webp");
  assert.equal(opening.at(-1).href, "../styles-opening-cinema.css?url");
  assert.equal(head({ "opening-audit": "" }).links.at(-1).href, opening.at(-1).href);
});
