import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAST_ROSTER_SEARCH,
  isCastRosterOrigin,
  validateDossierOriginSearch,
} from "../src/lib/dossier-origin.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("only the named cast roster can override a dossier's return destination", () => {
  assert.deepEqual(validateDossierOriginSearch({ from: "cast-roster" }), CAST_ROSTER_SEARCH);
  assert.equal(isCastRosterOrigin({ from: "cast-roster" }), true);
  for (const from of [
    undefined,
    null,
    "",
    "other",
    ["cast-roster"],
    {},
    1,
    true,
    "https://example.com",
  ]) {
    assert.deepEqual(validateDossierOriginSearch({ from }), {});
    assert.equal(isCastRosterOrigin({ from }), false);
  }
  assert.deepEqual(
    validateDossierOriginSearch({ from: "cast-roster", guide: "forms" }),
    CAST_ROSTER_SEARCH,
  );
});

test("all three dossier route families validate the entry point", () => {
  for (const family of ["riders", "managers", "characters"]) {
    assert.match(read(`src/routes/${family}.tsx`), /validateSearch: validateDossierOriginSearch/);
  }
});

test("cast cards carry the origin without changing the canonical route or its image warm-up", () => {
  const annex = read("src/components/world/world-annex.tsx");
  assert.match(
    annex,
    /to=\{entry\.to\}\s+search=\{CAST_ROSTER_SEARCH\}\s+assets=\{DOSSIER_ASSETS\.get\(entry\.to\)/,
  );
});

test("header and footer returns use reactive URL state, with the original defaults intact", () => {
  const chrome = read("src/components/world/world-chrome.tsx");
  const header = chrome.slice(
    chrome.indexOf("export function DossierTopbar"),
    chrome.indexOf("export function SideMenuLayer"),
  );
  const nav = read("src/components/world/dossier-nav.tsx");
  for (const source of [header, nav]) {
    assert.match(source, /select: \(state\) => isCastRosterOrigin\(state\.location\.search\)/);
    assert.doesNotMatch(source, /sessionStorage|document\.referrer/);
  }
  assert.match(header, /targetHash = fromCastRoster \? "cast-roster" : returnHash/);
  assert.match(header, /targetAriaLabel = fromCastRoster \? "人物一覧へ戻る" : returnAriaLabel/);
  assert.equal((header.match(/hash=\{targetHash\}/g) ?? []).length, 2);
  assert.match(nav, /returnHash = fromCastRoster \? "cast-roster" : \(listHash \?\? pathHash\)/);
  assert.equal((nav.match(/search=\{originSearch\}/g) ?? []).length, 2);
});

test("guarded navigation keeps the origin in native links, retry links and every route branch", () => {
  const gate = read("src/components/load-gate.tsx");
  assert.match(gate, /new URLSearchParams\(search\)\.toString\(\)/);
  assert.match(gate, /const href = guardedHref\(to, hash, search\)/);
  assert.match(gate, /setDelayedRoute\(\{ href: guardedHref\(to, hash, search\)/);
  assert.match(gate, /const navigationSearch = search \? \(\) => search : undefined/);
  assert.equal(
    (gate.match(/navigate\(\{ to, hash, search: navigationSearch \}\)/g) ?? []).length,
    5,
  );
  assert.match(gate, /search: navigationSearch \?\? \(changesDocument \? undefined : true\)/);
  assert.match(
    gate,
    /void go\(\{ to, hash, search, assets, transition, focusDestination: e\.detail === 0 \}\)/,
  );
});
