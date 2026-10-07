import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserHistory, createMemoryHistory } from "@tanstack/history";
import {
  galleryArtworkHref,
  galleryArtworkShareUrl,
  galleryWithoutArtwork,
  planGalleryArtworkEntry,
  readGalleryArtworkLink,
} from "../src/components/gallery/gallery-artwork-link.ts";

const postId = "u-12345678-1234-4234-9234-123456789abc";
const catalogue = ["g01", "g81", "g113"];
const options = {
  href: "/gallery?work=g81",
  viewerState: undefined,
  availableIds: catalogue,
  communityLoaded: false,
  communityFailed: false,
};

test("mixed shuffled reload waits for posts even when its current catalogue image is available", () => {
  const privateId = "u-12345678-1234-4234-9234-123456789abd";
  const record = {
    id: "g81",
    ids: [postId, "g81", privateId, "g01"],
    mode: "shuffle",
    position: { top: 560, left: 0 },
  };
  const pending = { ...options, viewerState: record };
  assert.deepEqual(planGalleryArtworkEntry(pending), { kind: "waiting", failed: false });
  assert.deepEqual(planGalleryArtworkEntry({ ...pending, communityFailed: true }), {
    kind: "waiting",
    failed: true,
  });
  assert.deepEqual(
    planGalleryArtworkEntry({
      ...pending,
      communityLoaded: true,
      communityFailed: true,
      availableIds: [...catalogue, postId],
    }),
    { kind: "waiting", failed: true },
  );
  const loaded = planGalleryArtworkEntry({
    ...pending,
    communityLoaded: true,
    availableIds: [...catalogue, postId],
  });
  assert.equal(loaded.kind, "open");
  assert.deepEqual(loaded.record, { ...record, ids: [postId, "g81", "g01"] });
  assert.equal(loaded.cleanHref, null);
  assert.deepEqual(record.ids, [postId, "g81", privateId, "g01"]);
  const normal = planGalleryArtworkEntry({
    ...pending,
    viewerState: { ...record, mode: "normal" },
  });
  assert.equal(normal.kind, "open", "ordinary catalogue viewers still open during post loading");
});

test("artwork links accept stable catalogue and public post IDs, not selectors or ambiguous targets", () => {
  assert.deepEqual(readGalleryArtworkLink("/gallery"), { kind: "none" });
  assert.deepEqual(readGalleryArtworkLink("/world?work=g81"), { kind: "none" });
  assert.deepEqual(readGalleryArtworkLink(options.href), { kind: "artwork", id: "g81" });
  assert.deepEqual(readGalleryArtworkLink(`/gallery?work=${postId.toUpperCase()}`), {
    kind: "artwork",
    id: postId,
  });
  for (const href of [
    "/gallery?work=",
    "/gallery?work=g81&work=g113",
    "/gallery?work=g81&work=g81",
    "/gallery?work=g001",
    "/gallery?work=javascript:alert(1)",
    "/gallery?work=%22%5D%20body",
    "/gallery?work=%3Cscript%3E",
    "/gallery?work=g81%00",
    "/gallery?work=u-not-a-uuid",
    "https://[invalid",
  ])
    assert.deepEqual(readGalleryArtworkLink(href), { kind: "invalid" }, href);
  assert.deepEqual(planGalleryArtworkEntry({ ...options, href: "https://[invalid" }), {
    kind: "invalid",
    cleanHref: "/gallery",
  });
});

test("shared URLs exclude personal parameters, title and anchors while local returns keep their anchor", () => {
  assert.equal(
    galleryArtworkShareUrl("https://example.test/gallery?q=private#room", "g81"),
    "https://example.test/gallery?work=g81",
  );
  assert.equal(
    galleryArtworkShareUrl("http://localhost:8082", postId),
    `http://localhost:8082/gallery?work=${postId}`,
  );
  assert.equal(
    galleryWithoutArtwork("/gallery?q=blue&work=g81#gallery-collection"),
    "/gallery?q=blue#gallery-collection",
  );
  assert.equal(
    galleryArtworkHref("/gallery?q=blue&work=g81#gallery-collection", "g113"),
    "/gallery?q=blue&work=g113",
  );
  assert.throws(() => galleryArtworkShareUrl("javascript:alert(1)", "g81"));
  assert.throws(() => galleryArtworkHref("/gallery", '"] body'));
});

test("direct arrival inserts exactly one closeable viewer after a clean gallery entry", () => {
  const history = createMemoryHistory({ initialEntries: ["/world", options.href] });
  const plan = planGalleryArtworkEntry(options);
  assert.equal(plan.kind, "open");
  assert.equal(plan.cleanHref, "/gallery");
  assert.deepEqual(plan.record, { id: "g81", ids: catalogue, position: { top: 0, left: 0 } });
  history.replace(plan.cleanHref, { galleryViewer: undefined });
  history.push(galleryArtworkHref(history.location.href, plan.record.id), {
    galleryViewer: plan.record,
  });
  assert.equal(history.length, 3);
  history.replace(galleryArtworkHref(history.location.href, "g113"), {
    galleryViewer: { ...plan.record, id: "g113" },
  });
  assert.equal(history.length, 3, "artwork navigation must not add an entry");
  history.back();
  assert.equal(history.location.href, "/gallery");
  assert.equal(history.location.state.galleryViewer, undefined);
  history.forward();
  const restored = planGalleryArtworkEntry({
    ...options,
    href: history.location.href,
    viewerState: history.location.state.galleryViewer,
  });
  assert.equal(restored.kind, "open");
  assert.equal(restored.cleanHref, null, "Forward or reload must reuse the existing viewer entry");
  assert.equal(restored.record.id, "g113");
  history.back();
  history.back();
  assert.equal(history.location.href, "/world", "ordinary navigation beneath the gallery survives");
});

test("the native batched history commits a clean base before the viewer push", () => {
  const origin = "https://example.test";
  const entries = [{ href: options.href, state: undefined }];
  let index = 0;
  const listeners = new Map();
  const window = {
    location: new URL(options.href, origin),
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    history: {
      get state() {
        return entries[index].state;
      },
      get length() {
        return entries.length;
      },
      replaceState(state, _title, href) {
        entries[index] = { href: href ?? entries[index].href, state };
        window.location = new URL(entries[index].href, origin);
      },
      pushState(state, _title, href) {
        entries.splice(index + 1);
        entries.push({ href, state });
        index += 1;
        window.location = new URL(href, origin);
      },
      back() {
        if (index === 0) return;
        index -= 1;
        window.location = new URL(entries[index].href, origin);
        listeners.get("popstate")?.();
      },
      forward() {
        if (index === entries.length - 1) return;
        index += 1;
        window.location = new URL(entries[index].href, origin);
        listeners.get("popstate")?.();
      },
    },
  };
  const history = createBrowserHistory({ window });
  const plan = planGalleryArtworkEntry(options);
  assert.equal(plan.kind, "open");
  history.replace(plan.cleanHref, { ...history.location.state, galleryViewer: undefined });
  history.flush();
  history.push(galleryArtworkHref(history.location.href, plan.record.id), {
    galleryViewer: plan.record,
  });
  history.flush();
  assert.deepEqual(
    entries.map((entry) => entry.href),
    ["/gallery", "/gallery?work=g81"],
  );
  history.back();
  assert.equal(history.location.href, "/gallery");
  assert.equal(history.location.state.galleryViewer, undefined);
  history.forward();
  assert.equal(history.location.href, "/gallery?work=g81");
  assert.equal(history.location.state.galleryViewer.id, "g81");
  history.destroy();
});

test("normal viewer restoration retains deep fractional scroll and filtered order", () => {
  const record = { id: "g81", ids: ["g113", "g81"], position: { top: 9631.5, left: 3 } };
  const plan = planGalleryArtworkEntry({ ...options, viewerState: record });
  assert.equal(plan.kind, "open");
  assert.equal(plan.cleanHref, null);
  assert.deepEqual(plan.record, record);
  assert.notEqual(plan.record.ids, record.ids);
  assert.deepEqual(
    planGalleryArtworkEntry({ ...options, href: "/gallery", viewerState: true }),
    {
      kind: "none",
    },
    "old boolean history entries do not reopen an arbitrary artwork",
  );
});

test("post links wait for successful data, retry after failure, and never resolve a private post", () => {
  const pending = { ...options, href: `/gallery?work=${postId}` };
  assert.deepEqual(planGalleryArtworkEntry(pending), { kind: "waiting", failed: false });
  assert.deepEqual(planGalleryArtworkEntry({ ...pending, communityFailed: true }), {
    kind: "waiting",
    failed: true,
  });
  assert.deepEqual(planGalleryArtworkEntry({ ...pending, communityLoaded: true }), {
    kind: "missing",
    cleanHref: "/gallery",
  });
  assert.deepEqual(
    planGalleryArtworkEntry({ ...pending, communityLoaded: true, communityFailed: true }),
    {
      kind: "waiting",
      failed: true,
    },
    "a failed refresh is not evidence that a post has gone private",
  );
  const ready = planGalleryArtworkEntry({
    ...pending,
    availableIds: [...catalogue, postId],
    communityLoaded: true,
  });
  assert.equal(ready.kind, "open");
  assert.equal(ready.record.id, postId);
  const restored = planGalleryArtworkEntry({ ...pending, viewerState: ready.record });
  assert.deepEqual(restored, { kind: "waiting", failed: false }, "reload waits for post hydration");
  assert.deepEqual(planGalleryArtworkEntry({ ...options, href: "/gallery?work=g999" }), {
    kind: "missing",
    cleanHref: "/gallery",
  });
});

test("a shuffled session survives history restoration without sharing its private order", () => {
  const record = {
    id: "g81",
    ids: ["g113", "g01", "g81"],
    mode: "shuffle",
    position: { top: 2364.5, left: 0 },
  };
  const history = createMemoryHistory({ initialEntries: ["/gallery"] });
  history.push("/gallery?work=g81", { galleryViewer: record });
  history.back();
  assert.equal(history.location.href, "/gallery");
  history.forward();
  const restored = planGalleryArtworkEntry({
    ...options,
    href: history.location.href,
    viewerState: history.location.state.galleryViewer,
  });
  assert.equal(restored.kind, "open");
  assert.equal(restored.cleanHref, null);
  assert.deepEqual(restored.record, record);
  const sharedHref = galleryArtworkShareUrl("https://example.test/gallery", record.id);
  assert.equal(sharedHref, "https://example.test/gallery?work=g81");
  const sharedArrival = planGalleryArtworkEntry({ ...options, href: sharedHref });
  assert.equal(sharedArrival.kind, "open");
  assert.equal(sharedArrival.record.mode, undefined);
  assert.deepEqual(sharedArrival.record.ids, catalogue);
  const withMissingWork = planGalleryArtworkEntry({
    ...options,
    viewerState: record,
    availableIds: ["g81", "g113"],
  });
  assert.equal(withMissingWork.kind, "open");
  assert.equal(withMissingWork.record.mode, "shuffle");
  assert.deepEqual(withMissingWork.record.ids, ["g113", "g81"]);
});
