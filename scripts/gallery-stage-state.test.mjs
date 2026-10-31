import assert from "node:assert/strict";
import test from "node:test";
import {
  readGalleryStagePreview,
  rememberGalleryStagePreview,
  resolveGalleryStageArtwork,
} from "../src/components/gallery/gallery-stage-state.ts";

test("stage preview respects saved choice after hydration and never becomes a personal preference", () => {
  const works = [{ id: "default" }, { id: "saved" }, { id: "preview" }];
  assert.equal(resolveGalleryStageArtwork(works, null, null, works[0]), works[0]);
  assert.equal(resolveGalleryStageArtwork(works, null, "saved", works[0]), works[1]);
  rememberGalleryStagePreview("entry-a", "preview");
  assert.equal(
    resolveGalleryStageArtwork(works, readGalleryStagePreview("entry-a"), "saved", works[0]),
    works[2],
  );
  assert.equal(readGalleryStagePreview("entry-b"), null);
  rememberGalleryStagePreview("entry-a", null);
  assert.equal(
    resolveGalleryStageArtwork(works, readGalleryStagePreview("entry-a"), "saved", works[0]),
    works[1],
  );
});
test("pending or removed previews preserve saved fallback and resolve when community artwork arrives", () => {
  const fallback = { id: "default" },
    saved = { id: "saved" },
    community = { id: "post-pending" };
  rememberGalleryStagePreview("entry-return", community.id);
  assert.equal(
    resolveGalleryStageArtwork(
      [fallback, saved],
      readGalleryStagePreview("entry-return"),
      saved.id,
      fallback,
    ),
    saved,
  );
  assert.equal(
    resolveGalleryStageArtwork(
      [fallback, saved, community],
      readGalleryStagePreview("entry-return"),
      saved.id,
      fallback,
    ),
    community,
  );
  assert.equal(
    resolveGalleryStageArtwork([fallback], "removed", "also-removed", fallback),
    fallback,
  );
});
