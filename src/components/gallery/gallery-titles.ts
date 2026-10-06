export const GALLERY_TITLES_KEY = "deception-world.gallery-titles.v1";
export const GALLERY_TITLE_LIMIT = 100;
export type GalleryTitles = Record<string, string>;
type TitleStorage = Pick<Storage, "getItem" | "setItem">;

export function readGalleryTitles(storage: Pick<Storage, "getItem">): GalleryTitles {
  const raw = storage.getItem(GALLERY_TITLES_KEY);
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([id, title]) =>
        /^g(?:0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$/.test(id) &&
        typeof title === "string" &&
        title.trim().length > 0 &&
        title.length <= GALLERY_TITLE_LIMIT,
    ),
  );
}

/** Read again before writing so another tab's edits to other pictures survive. */
export function saveGalleryTitle(storage: TitleStorage, id: string, draft: string): GalleryTitles {
  if (!/^g(?:0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$/.test(id))
    throw new Error("Invalid artwork identifier");
  const title = draft.trim();
  if (title.length > GALLERY_TITLE_LIMIT) throw new Error("Title too long");
  const titles = readGalleryTitles(storage);
  if (title) titles[id] = title;
  else delete titles[id];
  // The caller only shows success after this succeeds (private mode/quota can reject it).
  storage.setItem(GALLERY_TITLES_KEY, JSON.stringify(titles));
  return titles;
}
