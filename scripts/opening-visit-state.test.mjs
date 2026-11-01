import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTALLED_OPENING_SEEN_KEY,
  OPENING_REPLAY_KEY,
  OPENING_SEEN_KEY,
  isColdOpeningLaunch,
  isStandaloneOpening,
  rememberOpeningCompletion,
  shouldResumeOpening,
} from "../src/lib/opening-visit-state.ts";

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
function setup(overrides = {}) {
  const session = storage();
  const persistent = storage();
  return {
    installed: false,
    session: () => session,
    persistent: () => persistent,
    documentEntryReplay: true,
    coldLaunch: true,
    ...overrides,
  };
}
const throws = () => {
  throw new Error("storage unavailable");
};

test("cold launch accepts only ordinary root navigation, preserving reload and explicit URLs", () => {
  assert.equal(isColdOpeningLaunch({ type: "navigate", name: "https://example.com/" }), true);
  for (const entry of [
    undefined,
    { type: "reload", name: "https://example.com/" },
    { type: "back_forward", name: "https://example.com/" },
    { type: "navigate", name: "https://example.com/?opening=true" },
    { type: "navigate", name: "https://example.com/world" },
    { type: "navigate", name: "invalid" },
  ])
    assert.equal(isColdOpeningLaunch(entry), false);
});

test("both native standalone signals detect installed launch; ordinary tabs do not", () => {
  assert.equal(isStandaloneOpening({ navigator: { standalone: true }, matchMedia: throws }), true);
  assert.equal(isStandaloneOpening({ navigator: {}, matchMedia: () => ({ matches: true }) }), true);
  assert.equal(
    isStandaloneOpening({ navigator: {}, matchMedia: () => ({ matches: false }) }),
    false,
  );
  assert.equal(isStandaloneOpening({ navigator: {}, matchMedia: throws }), false);
});

test("first launch plays, then completed installed launch survives a new session", () => {
  const options = setup({ installed: true });
  assert.equal(shouldResumeOpening(options), false);
  rememberOpeningCompletion(options);
  assert.equal(options.session().getItem(OPENING_SEEN_KEY), "1");
  assert.equal(options.persistent().getItem(INSTALLED_OPENING_SEEN_KEY), "1");
  assert.equal(shouldResumeOpening({ ...options, session: () => storage() }), true);
  assert.equal(shouldResumeOpening(options), true, "retained session also resumes a cold launch");
});

test("ordinary tabs keep session-only return, reload and new-document behaviour", () => {
  const options = setup();
  rememberOpeningCompletion(options);
  assert.equal(options.persistent().getItem(INSTALLED_OPENING_SEEN_KEY), null);
  assert.equal(shouldResumeOpening({ ...options, documentEntryReplay: false }), true);
  assert.equal(shouldResumeOpening(options), false);
  assert.equal(shouldResumeOpening({ ...options, session: () => storage() }), false);
  options.persistent().setItem(INSTALLED_OPENING_SEEN_KEY, "1");
  assert.equal(shouldResumeOpening({ ...options, session: () => storage() }), false);
});

test("installed explicit replay is consumed and reload/explicit URL still play", () => {
  const options = setup({ installed: true });
  rememberOpeningCompletion(options);
  assert.equal(shouldResumeOpening({ ...options, coldLaunch: false }), false);
  options.session().setItem(OPENING_REPLAY_KEY, "1");
  assert.equal(shouldResumeOpening(options), false);
  assert.equal(options.session().getItem(OPENING_REPLAY_KEY), null);
  assert.equal(shouldResumeOpening(options), true);
});

test("storage access/read/write failures safely retain available session behaviour", () => {
  assert.equal(shouldResumeOpening(setup({ installed: true, session: throws })), false);
  assert.equal(shouldResumeOpening(setup({ installed: true, persistent: throws })), false);
  const options = setup({ installed: true, persistent: throws });
  assert.doesNotThrow(() => rememberOpeningCompletion(options));
  assert.equal(shouldResumeOpening({ ...options, documentEntryReplay: false }), true);
  assert.doesNotThrow(() => rememberOpeningCompletion(setup({ installed: true, session: throws })));
  const failed = { getItem: throws, setItem: throws, removeItem: throws };
  assert.equal(shouldResumeOpening(setup({ installed: true, session: () => failed })), false);
  assert.equal(shouldResumeOpening(setup({ installed: true, persistent: () => failed })), false);
  assert.doesNotThrow(() =>
    rememberOpeningCompletion(
      setup({ installed: true, session: () => failed, persistent: () => failed }),
    ),
  );
});
