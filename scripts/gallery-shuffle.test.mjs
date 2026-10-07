import assert from "node:assert/strict";
import test from "node:test";
import {
  availableGalleryDeck,
  shuffleGalleryDeck,
} from "../src/components/gallery/gallery-shuffle.ts";
import {
  galleryAdjacentId,
  readGalleryViewerRecord,
} from "../src/components/gallery/gallery-viewer-state.ts";
import { planGalleryArtworkEntry } from "../src/components/gallery/gallery-artwork-link.ts";

test("shuffle is an immutable finite deck with each selected work exactly once", () => {
  const source = ["a", "b", "c", "d"].map((id) => ({ id }));
  const deck = shuffleGalleryDeck(source, null, () => 0);
  assert.deepEqual(
    source.map((work) => work.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    deck.map((work) => work.id),
    ["b", "c", "d", "a"],
  );
  const ids = deck.map((work) => work.id);
  const seen = [ids[0]];
  let next;
  while ((next = galleryAdjacentId(ids, seen.at(-1), 1, "shuffle"))) seen.push(next);
  assert.deepEqual(seen, ids);
  assert.equal(galleryAdjacentId(ids, ids[0], -1, "shuffle"), null);
  assert.equal(galleryAdjacentId(ids, ids[1], -1, "shuffle"), ids[0]);
  assert.equal(galleryAdjacentId(ids, ids.at(-1), 1), ids[0]);
});

test("zero/one work decks terminate and a new round avoids the preceding work", () => {
  assert.deepEqual(shuffleGalleryDeck([]), []);
  assert.deepEqual(shuffleGalleryDeck([{ id: "a" }], "a"), [{ id: "a" }]);
  assert.equal(galleryAdjacentId(["a"], "a", 1, "shuffle"), null);
  const deck = shuffleGalleryDeck([{ id: "a" }, { id: "b" }, { id: "a" }], "a", () => 0.99);
  assert.deepEqual(
    deck.map((work) => work.id),
    ["b", "a"],
  );
});

test("session membership stays fixed while current public data replaces stale metadata", () => {
  const session = [{ id: "a", title: "old" }, { id: "b" }, { id: "c" }];
  const available = [{ id: "d" }, { id: "c" }, { id: "a", title: "new" }];
  const deck = availableGalleryDeck(session, available);
  assert.deepEqual(deck, [{ id: "a", title: "new" }, { id: "c" }]);
  assert.deepEqual(availableGalleryDeck(session, []), []);
  assert.equal(
    galleryAdjacentId(
      deck.map((work) => work.id),
      "a",
      1,
      "shuffle",
    ),
    "c",
  );
});

test("history restores the same finite order and rejects an unknown mode", () => {
  const record = {
    id: "b",
    ids: ["c", "b", "a"],
    position: { top: 400, left: 0 },
    mode: "shuffle",
  };
  assert.deepEqual(readGalleryViewerRecord(JSON.parse(JSON.stringify(record))), record);
  assert.equal(readGalleryViewerRecord({ ...record, mode: "random" }), null);
  const { mode: _mode, ...legacy } = record;
  assert.deepEqual(readGalleryViewerRecord(legacy), legacy);
});

test("Forward and reload entry retain finite order, excluding only unavailable members", () => {
  const record = {
    id: "g02",
    ids: ["g03", "g02", "g01"],
    position: { top: 800, left: 0 },
    mode: "shuffle",
  };
  const plan = planGalleryArtworkEntry({
    href: "/gallery?work=g02",
    viewerState: JSON.parse(JSON.stringify(record)),
    availableIds: ["g01", "g02", "g04"],
    communityLoaded: true,
    communityFailed: false,
  });
  assert.equal(plan.kind, "open");
  assert.deepEqual(plan.record, { ...record, ids: ["g02", "g01"] });
  assert.equal(plan.cleanHref, null);
  const shared = planGalleryArtworkEntry({
    href: "/gallery?work=g02",
    viewerState: undefined,
    availableIds: ["g01", "g02", "g04"],
    communityLoaded: true,
    communityFailed: false,
  });
  assert.equal(shared.kind, "open");
  assert.equal(shared.record.mode, undefined);
});
