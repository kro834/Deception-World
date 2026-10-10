import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CINEMA_EXIT_MS,
  createCinemaExit,
  shouldAnimateCinemaClick,
} from "../src/lib/external-cinema-exit.js";

function harness() {
  const environment = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: false });
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: { dataset: {} },
    querySelector: () => null,
  });
  const timers = new Map();
  const states = [];
  let navigations = 0;
  let sequence = 0;
  const observations = [];
  environment.document = doc;
  environment.matchMedia = () => media;
  environment.setTimeout = (callback, duration) => {
    const id = ++sequence;
    timers.set(id, { callback, duration });
    return id;
  };
  environment.clearTimeout = (id) => timers.delete(id);
  environment.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      observations.push(this);
    }
    observe() {
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
    }
  };
  const exit = createCinemaExit(
    {
      onActive: (active) => states.push(active),
      navigate: () => {
        navigations += 1;
      },
    },
    environment,
  );
  return {
    exit,
    environment,
    media,
    doc,
    timers,
    states,
    get navigations() {
      return navigations;
    },
    get observation() {
      return observations.at(-1);
    },
    complete() {
      [...timers.values()].forEach(({ callback }) => callback());
    },
  };
}

test("ordinary pointer and keyboard activation animate, browser alternatives stay native", () => {
  const event = {
    button: 0,
    currentTarget: { target: "", hasAttribute: () => false },
  };
  assert.equal(shouldAnimateCinemaClick(event), true);
  assert.equal(shouldAnimateCinemaClick({ ...event, detail: 0 }), true);
  for (const key of ["defaultPrevented", "metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    assert.equal(shouldAnimateCinemaClick({ ...event, [key]: true }), false, key);
  }
  assert.equal(shouldAnimateCinemaClick({ ...event, button: 1 }), false);
  assert.equal(
    shouldAnimateCinemaClick({
      ...event,
      currentTarget: {
        target: "_blank",
        hasAttribute: () => false,
      },
    }),
    false,
  );
  assert.equal(
    shouldAnimateCinemaClick({
      ...event,
      currentTarget: {
        target: "",
        hasAttribute: () => true,
      },
    }),
    false,
  );
});

test("650ms deadline navigates once and clears cover before navigation", () => {
  const h = harness();
  assert.equal(h.exit.begin(), true);
  assert.equal(h.exit.begin(), true);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].duration, CINEMA_EXIT_MS);
  assert.equal(CINEMA_EXIT_MS, 650);
  h.complete();
  h.complete();
  assert.equal(h.navigations, 1);
  assert.deepEqual(h.states, [true, false]);
  assert.equal(h.timers.size, 0);
  assert.equal(h.observation.connected, false);
  h.exit.dispose();
});

test("reduced motion, economy, hidden documents and user motion-off navigate natively", () => {
  for (const policy of ["reduced", "economy", "hidden", "off"]) {
    const h = harness();
    if (policy === "reduced") h.media.matches = true;
    if (policy === "economy") h.doc.documentElement.dataset.worldEffects = "economy";
    if (policy === "hidden") h.doc.hidden = true;
    if (policy === "off") h.doc.querySelector = () => ({});
    assert.equal(h.exit.begin(), false, policy);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.states, []);
    h.exit.dispose();
  }
});

test("changing motion preference mid-exit finishes immediately once", () => {
  for (const policy of ["reduced", "economy", "off"]) {
    const h = harness();
    h.exit.begin();
    if (policy === "reduced") {
      h.media.matches = true;
      h.media.dispatchEvent(new Event("change"));
    } else {
      if (policy === "economy") h.doc.documentElement.dataset.worldEffects = "economy";
      else h.doc.querySelector = () => ({});
      h.observation.callback();
    }
    h.complete();
    assert.equal(h.navigations, 1, policy);
    assert.deepEqual(h.states, [true, false]);
    assert.equal(h.timers.size, 0);
    h.exit.dispose();
  }
});

test("pagehide cancels redirects and pageshow restores a reusable cover-free link", () => {
  const h = harness();
  h.exit.begin();
  const staleTimer = [...h.timers.values()][0].callback;
  h.environment.dispatchEvent(new Event("pagehide"));
  staleTimer();
  h.environment.dispatchEvent(new Event("pageshow"));
  assert.equal(h.navigations, 0);
  assert.equal(h.states.at(-1), false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.exit.begin(), true);
  staleTimer();
  assert.equal(h.navigations, 0, "a canceled timer cannot finish a new attempt");
  h.complete();
  assert.equal(h.navigations, 1);
  h.exit.dispose();
});

test("unmount disposal prevents stale timers, state updates and redirects", () => {
  const h = harness();
  h.exit.begin();
  const staleTimer = [...h.timers.values()][0].callback;
  h.exit.dispose();
  staleTimer();
  h.environment.dispatchEvent(new Event("pageshow"));
  h.media.dispatchEvent(new Event("change"));
  assert.deepEqual(h.states, [true]);
  assert.equal(h.navigations, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.observation.connected, false);
  assert.equal(h.exit.begin(), false);
});

test("the shared STORIES group adds exactly one cinema row above both Dream branches", () => {
  const chrome = readFileSync(
    new URL("../src/components/world/world-chrome.tsx", import.meta.url),
    "utf8",
  );
  const stories = chrome.slice(chrome.indexOf("<p>STORIES</p>"));
  assert.equal(chrome.match(/<ExternalCinemaLink /g)?.length, 1);
  assert.ok(stories.indexOf("<ExternalCinemaLink ") < stories.indexOf('context === "movie"'));
  const component = readFileSync(
    new URL("../src/components/world/external-cinema-link.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /https:\/\/kamen-rider-saga-cinema\.akiopromax13\.chatgpt\.site\//);
  assert.match(component, /映画四部作「仮面ライダーサーガ」/);
  assert.match(component, /<i>本編リメイク<\/i>/);
  assert.match(component, /<a href=\{CINEMA_URL\}/);
  assert.match(component, /createPortal\([\s\S]*document\.body/);
  const css = readFileSync(
    new URL("../src/components/world/external-cinema-link.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(css, /\binfinite\b/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
