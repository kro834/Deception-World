import assert from "node:assert/strict";
import test from "node:test";
import { GALLERY_FAVORITES_KEY } from "../src/components/gallery/gallery-discovery.ts";
import { GALLERY_FEATURE_KEY } from "../src/components/gallery/gallery-feature.ts";
import {
  changeGalleryPersonalFavorite,
  changeGalleryPersonalFeature,
  createGalleryPersonalPreferences,
  readGalleryPersonalPreferences,
} from "../src/components/gallery/gallery-personal-preferences.ts";

const ids = ["g01", "g02", "g03", "g04"];
const communityId = "u-12345678-1234-4234-8234-123456789abc";

function storage() {
  const values = new Map();
  return {
    values,
    blockedRead: false,
    blockedWrite: false,
    writes: 0,
    getItem(key) {
      if (this.blockedRead) throw new Error("SecurityError");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.writes++;
      if (this.blockedWrite) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
    removeItem(key) {
      this.writes++;
      if (this.blockedWrite) throw new Error("SecurityError");
      values.delete(key);
    },
  };
}

function initial(target) {
  return readGalleryPersonalPreferences(target, createGalleryPersonalPreferences(), ids);
}

function storedFavorites(target) {
  return JSON.parse(target.values.get(GALLERY_FAVORITES_KEY));
}

test("unavailable storage keeps both personal choices usable without claiming they were saved", () => {
  let state = initial(undefined);
  assert.match(state.favoriteError, /読み込めません/);
  assert.match(state.featureError, /読み込めません/);
  state = changeGalleryPersonalFavorite(undefined, state, "g01", ids);
  state = changeGalleryPersonalFeature(undefined, state, "g02", ids);
  assert.deepEqual(state.favorites, ["g01"]);
  assert.equal(state.featuredId, "g02");
  assert.equal(state.favoriteStatus, "");
  assert.equal(state.featureStatus, "");
  assert.match(state.favoriteError, /この画面に反映.*保存できません/);
  assert.match(state.featureError, /この画面に反映.*保存できません/);
});

test("blocked favorite reads never overwrite an unknown persisted list even when writes work", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, '["g03"]');
  target.blockedRead = true;
  let state = initial(target);
  state = changeGalleryPersonalFavorite(target, state, "g01", ids);
  assert.deepEqual(state.favorites, ["g01"]);
  assert.equal(target.writes, 0);
  assert.deepEqual(storedFavorites(target), ["g03"]);
  target.blockedRead = false;
  state = changeGalleryPersonalFavorite(target, state, "g02", ids);
  assert.deepEqual(state.favorites, ["g03", "g01", "g02"]);
  assert.deepEqual(storedFavorites(target), state.favorites);
  assert.deepEqual(state.favoriteIntents, {});
  assert.equal(state.favoriteError, "");
  assert.match(state.favoriteStatus, /保存しました/);
});

test("quota failures preserve add and remove intents while another tab changes unrelated favorites", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, '["g01","g03"]');
  let state = initial(target);
  target.blockedWrite = true;
  state = changeGalleryPersonalFavorite(target, state, "g01", ids);
  state = changeGalleryPersonalFavorite(target, state, "g02", ids);
  assert.deepEqual(state.favorites, ["g03", "g02"]);
  target.values.set(GALLERY_FAVORITES_KEY, '["g01","g04"]');
  state = readGalleryPersonalPreferences(target, state, ids, GALLERY_FAVORITES_KEY);
  assert.deepEqual(state.favorites, ["g04", "g02"]);
  assert.match(state.favoriteError, /保存できません/);
  assert.equal(state.favoriteStatus, "");
  target.blockedWrite = false;
  state = changeGalleryPersonalFavorite(target, state, "g03", ids);
  assert.deepEqual(storedFavorites(target), ["g04", "g02", "g03"]);
  assert.equal(state.favoriteError, "");
});

test("rapid repeated favorite toggles always use the latest session intent", () => {
  const target = storage();
  let state = initial(target);
  target.blockedWrite = true;
  for (let index = 0; index < 17; index++) {
    state = changeGalleryPersonalFavorite(target, state, "g01", ids);
    assert.equal(state.favorites.includes("g01"), index % 2 === 0);
  }
  target.blockedWrite = false;
  state = changeGalleryPersonalFavorite(target, state, "g02", ids);
  assert.deepEqual(storedFavorites(target), ["g01", "g02"]);
  for (let index = 0; index < 16; index++) {
    state = changeGalleryPersonalFavorite(target, state, "g01", ids);
    assert.equal(state.favorites.includes("g01"), index % 2 !== 0);
  }
  assert.deepEqual(new Set(storedFavorites(target)), new Set(["g01", "g02"]));
});

test("ordinary favorite actions merge persisted changes that arrived before the storage event", () => {
  const target = storage();
  let state = initial(target);
  target.values.set(GALLERY_FAVORITES_KEY, '["g03"]');
  state = changeGalleryPersonalFavorite(target, state, "g01", ids);
  assert.deepEqual(storedFavorites(target), ["g03", "g01"]);
  target.values.set(GALLERY_FAVORITES_KEY, '["g02"]');
  state = readGalleryPersonalPreferences(target, state, ids, GALLERY_FAVORITES_KEY);
  assert.deepEqual(state.favorites, ["g02"]);
  assert.equal(state.favoriteError, "");
  assert.equal(state.favoriteStatus, "");
});

test("clearing storage in another tab keeps pending local choices and clears ordinary saved choices", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, '["g03"]');
  target.values.set(GALLERY_FEATURE_KEY, "g03");
  let state = initial(target);
  target.blockedWrite = true;
  state = changeGalleryPersonalFavorite(target, state, "g01", ids);
  state = changeGalleryPersonalFeature(target, state, "g02", ids);
  target.values.clear();
  state = readGalleryPersonalPreferences(target, state, ids, null);
  assert.deepEqual(state.favorites, ["g01"]);
  assert.equal(state.featuredId, "g02");
  assert.match(state.favoriteError, /保存できません/);
  assert.match(state.featureError, /保存できません/);
  assert.deepEqual(initial(target).favorites, []);
  assert.equal(initial(target).featuredId, null);
});

test("failed feature selection and reset stay in this view until a later successful save", () => {
  const target = storage();
  target.values.set(GALLERY_FEATURE_KEY, "g03");
  let state = initial(target);
  target.blockedWrite = true;
  state = changeGalleryPersonalFeature(target, state, "g01", ids);
  assert.equal(state.featuredId, "g01");
  assert.equal(target.values.get(GALLERY_FEATURE_KEY), "g03");
  target.values.set(GALLERY_FEATURE_KEY, "g04");
  state = readGalleryPersonalPreferences(target, state, ids, GALLERY_FEATURE_KEY);
  assert.equal(state.featuredId, "g01");
  state = changeGalleryPersonalFeature(target, state, null, ids);
  assert.equal(state.featuredId, null);
  assert.equal(state.featurePending, true);
  assert.equal(state.featureStatus, "");
  assert.match(state.featureError, /保存できません/);
  state = readGalleryPersonalPreferences(target, state, ids, GALLERY_FEATURE_KEY);
  assert.equal(state.featuredId, null);
  target.blockedWrite = false;
  state = changeGalleryPersonalFeature(target, state, null, ids);
  assert.equal(target.values.has(GALLERY_FEATURE_KEY), false);
  assert.equal(state.featurePending, false);
  assert.equal(state.featureError, "");
  assert.match(state.featureStatus, /初期設定に戻しました/);
  target.values.set(GALLERY_FEATURE_KEY, "g02");
  state = readGalleryPersonalPreferences(target, state, ids, GALLERY_FEATURE_KEY);
  assert.equal(state.featuredId, "g02");
});

test("feature writes remain possible when reads are denied and do not touch saved favorites", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, '["g03"]');
  target.blockedRead = true;
  const state = changeGalleryPersonalFeature(target, initial(target), "g02", ids);
  assert.equal(state.featuredId, "g02");
  assert.equal(state.featurePending, false);
  assert.equal(state.featureError, "");
  assert.equal(target.values.get(GALLERY_FEATURE_KEY), "g02");
  assert.deepEqual(storedFavorites(target), ["g03"]);
});

test("unloaded valid community favorites and featured choices survive catalogue-only reads", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, JSON.stringify([communityId, "g03", "bad", 17]));
  target.values.set(GALLERY_FEATURE_KEY, communityId);
  let state = initial(target);
  assert.deepEqual(state.favorites, [communityId, "g03"]);
  assert.equal(state.featuredId, communityId);
  state = changeGalleryPersonalFavorite(target, state, "g01", ids);
  assert.deepEqual(storedFavorites(target), [communityId, "g03", "g01"]);
  target.blockedWrite = true;
  state = changeGalleryPersonalFavorite(target, state, communityId, [...ids, communityId]);
  state = changeGalleryPersonalFeature(target, state, communityId, [...ids, communityId]);
  state = readGalleryPersonalPreferences(target, state, ids);
  assert.equal(state.favorites.includes(communityId), false);
  assert.equal(state.featuredId, communityId);
  target.blockedWrite = false;
  state = changeGalleryPersonalFavorite(target, state, "g02", ids);
  assert.deepEqual(storedFavorites(target), ["g03", "g01", "g02"]);
});

test("invalid and not-yet-loaded target IDs cannot mutate preferences or persisted data", () => {
  const target = storage();
  target.values.set(GALLERY_FAVORITES_KEY, '["g01"]');
  target.values.set(GALLERY_FEATURE_KEY, "g02");
  let state = initial(target);
  for (const id of ["unknown", "g999", "u-not-a-uuid", communityId, "__proto__"]) {
    state = changeGalleryPersonalFavorite(target, state, id, ids);
    state = changeGalleryPersonalFeature(target, state, id, ids);
    assert.deepEqual(state.favorites, ["g01"]);
    assert.equal(state.featuredId, "g02");
    assert.match(state.favoriteError, /作品を確認できない/);
    assert.match(state.featureError, /作品を確認できない/);
  }
  assert.equal(target.writes, 0);
  assert.deepEqual(storedFavorites(target), ["g01"]);
  assert.equal(target.values.get(GALLERY_FEATURE_KEY), "g02");
});

test("a later failed read clears stale saved feedback and does not change visible choices", () => {
  const target = storage();
  let state = changeGalleryPersonalFavorite(target, initial(target), "g01", ids);
  state = changeGalleryPersonalFeature(target, state, "g02", ids);
  target.blockedRead = true;
  state = readGalleryPersonalPreferences(target, state, ids);
  assert.deepEqual(state.favorites, ["g01"]);
  assert.equal(state.featuredId, "g02");
  assert.equal(state.favoriteStatus, "");
  assert.equal(state.featureStatus, "");
  assert.match(state.favoriteError, /読み込めません/);
  assert.match(state.featureError, /読み込めません/);
});
