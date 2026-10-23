import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_CAST_ROSTER } from "../src/components/world/world-annex-data.ts";
import {
  activateCastDirectoryFilter,
  castDirectoryCounts,
  createCastDirectoryNavigation,
  matchesCastDirectoryFilter,
  watchCastDirectoryHash,
  watchCastDirectoryRouter,
} from "../src/components/world/world-cast-directory-model.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("cast facets count destination records without inventing character affiliations", () => {
  assert.deepEqual(castDirectoryCounts(WORLD_CAST_ROSTER), {
    all: 14,
    riders: 7,
    managers: 3,
    characters: 3,
    profile: 1,
  });
  const visible = (filter) =>
    WORLD_CAST_ROSTER.filter((entry) => matchesCastDirectoryFilter(entry, filter));
  assert.deepEqual(
    visible("managers").map(({ name }) => name),
    ["レックス・ロワ", "リームー", "シュザ"],
  );
  assert.deepEqual(
    visible("characters").map(({ name }) => name),
    ["ルナ・アレイン", "テラ・アレイン", "夜明護尊"],
  );
  assert.deepEqual(
    visible("profile").map(({ name }) => name),
    ["アザト"],
  );
  // These are two people with one shared record, not duplicate destinations to remove.
  assert.ok(visible("riders").some(({ id }) => id === "hanabi"));
  assert.ok(visible("riders").some(({ id }) => id === "chigiri"));
  assert.ok(visible("riders").some(({ id, role }) => id === "roa" && role === "管理人・ローア"));
  for (const entry of WORLD_CAST_ROSTER) {
    const kinds = ["riders", "managers", "characters", "profile"].filter((filter) =>
      matchesCastDirectoryFilter(entry, filter),
    );
    assert.equal(kinds.length, 1, entry.name);
  }
});

test("changing facets keeps the canonical numbers and the complete cards mounted", () => {
  const original = WORLD_CAST_ROSTER.map((entry, index) => ({ entry, number: index + 1 }));
  assert.deepEqual(
    original
      .filter(({ entry }) => matchesCastDirectoryFilter(entry, "characters"))
      .map(({ number }) => number),
    [11, 12, 13],
  );
  const annex = read("src/components/world/world-annex.tsx");
  const cast = annex.slice(
    annex.indexOf("function CastFiles()"),
    annex.indexOf("function WorldFiles()"),
  );
  assert.match(cast, /WORLD_CAST_ROSTER\.map\(\(entry, index\) =>/);
  assert.match(
    cast,
    /<li key=\{entry\.id\} hidden=\{!matchesCastDirectoryFilter\(entry, filter\)\}>/,
  );
  assert.match(cast, /\{pad\(index \+ 1\)\}/);
  assert.match(cast, /search=\{CAST_ROSTER_SEARCH\}/);
  assert.doesNotMatch(cast, /WORLD_CAST_ROSTER\.filter/);
});

test("filter activation moves focus to the chosen visible control before hiding old cards", () => {
  let focused = "a profile control that will become hidden";
  const sequence = [];
  const control = {
    focus(options) {
      assert.deepEqual(options, { preventScroll: true });
      focused = "facet button";
      sequence.push("focus");
    },
  };
  for (const value of ["managers", "profile", "all"]) {
    activateCastDirectoryFilter(value, control, (filter) => {
      assert.equal(focused, "facet button");
      assert.equal(filter, value);
      sequence.push("update");
    });
  }
  assert.deepEqual(sequence, ["focus", "update", "focus", "update", "focus", "update"]);
});

function navigationHarness() {
  let filter = "riders";
  let hash = "";
  let sequence = 0;
  const frames = new Map();
  const landings = [];
  const navigation = createCastDirectoryNavigation({
    entries: WORLD_CAST_ROSTER,
    getFilter: () => filter,
    revealAll: () => {
      filter = "all";
    },
    getHash: () => hash,
    getTarget: (id) => ({ scrollIntoView: (options) => landings.push({ id, options }) }),
    requestFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelFrame: (id) => frames.delete(id),
  });
  return {
    navigation,
    frames,
    landings,
    filter: () => filter,
    setFilter: (next) => {
      filter = next;
    },
    setHash: (next) => {
      hash = next;
    },
    flush: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test("native hidden-person hash reveals the card and lands only after the committed layout", () => {
  const run = navigationHarness();
  const events = new EventTarget();
  const stop = watchCastDirectoryHash(events, () => run.navigation.navigate("#wa-person-azato"));
  run.setHash("#wa-person-azato");
  events.dispatchEvent(new Event("hashchange"));
  assert.equal(run.filter(), "all");
  assert.equal(run.frames.size, 0);
  assert.equal(run.landings.length, 0);
  run.navigation.afterCommit();
  run.flush();
  assert.deepEqual(run.landings, [
    { id: "wa-person-azato", options: { block: "start", behavior: "instant" } },
  ]);
  stop();
  run.navigation.cancel();
  events.dispatchEvent(new Event("hashchange"));
  assert.equal(run.frames.size, 0);
});

test("router pushState reaches the same hidden person without a native hashchange", () => {
  const run = navigationHarness();
  run.setHash("#wa-person-azato");
  // TanStack's location.hash omits the leading #.
  run.navigation.navigate("wa-person-azato");
  assert.equal(run.filter(), "all");
  // A duplicate native/router notification must not discard the pending landing.
  run.navigation.navigate("#wa-person-azato");
  run.navigation.afterCommit();
  run.flush();
  assert.equal(run.landings[0].id, "wa-person-azato");
  const hook = read("src/components/world/use-world-cast-directory.ts");
  assert.match(hook, /useState<CastDirectoryFilter>\("all"\)/);
  assert.match(hook, /useRouterState\(\{ select: \(state\) => state\.location\.hash \}\)/);
  assert.match(hook, /navigation\.navigate\(routerHash\)/);
  assert.match(hook, /navigation\.navigate\(window\.location\.hash\)/);
  assert.match(hook, /useLayoutEffect\(\(\) => navigation\.afterCommit\(\)/);
  assert.doesNotMatch(hook, /localStorage|sessionStorage|history\./);
});

test("episode and already-visible hashes keep filtering and never request a landing", () => {
  const run = navigationHarness();
  for (const hash of [
    "#wa-episode-03",
    "#cast-roster",
    "#wa-person-yuma",
    "#wa-person-missing",
    "#%E0%A4",
  ]) {
    run.navigation.navigate(hash);
    run.navigation.afterCommit();
    assert.equal(run.filter(), "riders", hash);
    assert.equal(run.frames.size, 0, hash);
  }
});

test("router same-href reload reveals a newly hidden person and unsubscribes cleanly", () => {
  const run = navigationHarness();
  let listener;
  let unsubscribed = 0;
  const stop = watchCastDirectoryRouter((next) => {
    listener = next;
    return () => {
      listener = undefined;
      unsubscribed += 1;
    };
  }, run.navigation);
  const sameLocation = { pathname: "/world", hash: "wa-person-azato" };
  run.setHash("#wa-person-azato");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    run.setFilter("riders");
    listener(sameLocation);
    assert.equal(run.filter(), "all");
    run.navigation.afterCommit();
    run.flush();
  }
  assert.equal(run.landings.length, 2);
  run.setFilter("riders");
  listener(sameLocation);
  run.navigation.afterCommit();
  listener({ pathname: "/download", hash: "wa-person-azato" });
  assert.equal(run.frames.size, 0, "leaving World cancels a pending landing");
  stop();
  assert.equal(listener, undefined);
  assert.equal(unsubscribed, 1);
  const hook = read("src/components/world/use-world-cast-directory.ts");
  assert.match(
    hook,
    /router\.subscribe\("onBeforeNavigate", \(\{ toLocation \}\) => navigate\(toLocation\)\)/,
  );
  assert.match(hook, /\(\) =>\s*watchCastDirectoryRouter\(/);
});

test("new hash navigation and cleanup cancel a pending person's landing", () => {
  for (const action of ["new hash", "unmount", "hash changed before callback"]) {
    const run = navigationHarness();
    run.setHash("#wa-person-azato");
    run.navigation.navigate("#wa-person-azato");
    run.navigation.afterCommit();
    assert.equal(run.frames.size, 1);
    run.setHash("#wa-episode-03");
    if (action === "new hash") run.navigation.navigate("#wa-episode-03");
    if (action === "unmount") run.navigation.cancel();
    run.flush();
    assert.equal(run.landings.length, 0, action);
  }
});

test("the local controls expose their selected state and remain touchable on narrow screens", () => {
  const component = read("src/components/world/world-cast-directory.tsx");
  const css = read("src/styles-world-cast-directory.css");
  assert.match(component, /aria-pressed=\{filter === value\}/);
  assert.match(component, /aria-controls="cast-roster"/);
  assert.match(component, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /\.wa-directory-controls \{[^}]*flex-wrap: wrap/s);
  assert.match(css, /#cast-roster \.wa-roster > li\[hidden\] \{\s*display: none;/);
});
