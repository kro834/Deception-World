import { isCommunityGalleryId } from "./gallery-community-client.ts";
import { readGalleryViewerRecord, type GalleryViewerRecord } from "./gallery-viewer-state.ts";

const galleryBase = "https://gallery.invalid";

export function isGalleryLinkId(value: string): boolean {
  return /^g(?:0[1-9]|[1-9][0-9]{1,5})$/.test(value) || isCommunityGalleryId(value);
}

export type GalleryArtworkLink =
  { kind: "none" } | { kind: "invalid" } | { kind: "artwork"; id: string };

/** URLs are user input; reject duplicate targets instead of choosing one silently. */
export function readGalleryArtworkLink(href: string): GalleryArtworkLink {
  try {
    const url = new URL(href, galleryBase);
    if (url.pathname !== "/gallery") return { kind: "none" };
    const values = url.searchParams.getAll("work");
    if (!values.length) return { kind: "none" };
    if (values.length !== 1 || !isGalleryLinkId(values[0])) return { kind: "invalid" };
    return { kind: "artwork", id: values[0].toLowerCase() };
  } catch {
    return { kind: "invalid" };
  }
}

/** Preserve the gallery's return anchor, but remove only its viewer parameter. */
export function galleryWithoutArtwork(href: string): string {
  let url: URL;
  try {
    url = new URL(href, galleryBase);
  } catch {
    return "/gallery";
  }
  url.searchParams.delete("work");
  return `/gallery${url.search}${url.hash}`;
}

/** Viewer navigation changes one history entry; anchors must not scroll its background. */
export function galleryArtworkHref(href: string, id: string): string {
  if (!isGalleryLinkId(id)) throw new Error("Invalid artwork identifier");
  const url = new URL(galleryWithoutArtwork(href), galleryBase);
  url.searchParams.set("work", id);
  return `/gallery${url.search}`;
}

/** A share contains no personal room, search, scroll position, or editable title. */
export function galleryArtworkShareUrl(origin: string, id: string): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Invalid gallery origin");
  return new URL(galleryArtworkHref("/gallery", id), url.origin).href;
}

export type GalleryEntryPlan =
  | { kind: "none" }
  | { kind: "invalid"; cleanHref: string }
  | { kind: "waiting"; failed: boolean }
  | { kind: "missing"; cleanHref: string }
  | {
      kind: "open";
      record: GalleryViewerRecord;
      // A direct URL needs a gallery entry underneath it. A restored viewer already has one.
      cleanHref: string | null;
    };

export function planGalleryArtworkEntry(options: {
  href: string;
  viewerState: unknown;
  availableIds: readonly string[];
  communityLoaded: boolean;
  communityFailed: boolean;
}): GalleryEntryPlan {
  const { href, availableIds, communityLoaded, communityFailed } = options;
  let url: URL;
  try {
    url = new URL(href, galleryBase);
  } catch {
    return { kind: "invalid", cleanHref: "/gallery" };
  }
  if (url.pathname !== "/gallery") return { kind: "none" };
  const record = readGalleryViewerRecord(options.viewerState);
  const link = readGalleryArtworkLink(href);
  const id = record?.id ?? (link.kind === "artwork" ? link.id : null);
  if (!id) {
    return link.kind === "invalid"
      ? { kind: "invalid", cleanHref: galleryWithoutArtwork(href) }
      : { kind: "none" };
  }
  if (!isGalleryLinkId(id)) return { kind: "invalid", cleanHref: galleryWithoutArtwork(href) };
  if (!availableIds.includes(id)) {
    if (isCommunityGalleryId(id) && (!communityLoaded || communityFailed))
      return { kind: "waiting", failed: communityFailed };
    return { kind: "missing", cleanHref: galleryWithoutArtwork(href) };
  }
  return {
    kind: "open",
    record: record
      ? { ...record, ids: record.ids.filter((value) => availableIds.includes(value)) }
      : { id, ids: [...availableIds], position: { top: 0, left: 0 } },
    cleanHref: record ? null : galleryWithoutArtwork(href),
  };
}
