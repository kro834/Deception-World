/** Shared by search UI, URL validation and reading-return state. Keep this metadata-only. */
export const SEARCH_CATEGORIES = [
  { id: "all", label: "すべて", code: "ALL" },
  { id: "people", label: "人物", code: "PEOPLE" },
  { id: "riders", label: "ライダー", code: "RIDERS" },
  { id: "forms", label: "フォーム", code: "FORMS" },
  { id: "story", label: "物語", code: "STORY" },
  { id: "world", label: "世界・用語", code: "WORLD" },
  { id: "systems", label: "システム", code: "SYSTEMS" },
  { id: "pages", label: "ページ", code: "PAGES" },
] as const;

export type SearchCategory = (typeof SEARCH_CATEGORIES)[number]["id"];
const categoryIds = new Set<string>(SEARCH_CATEGORIES.map(({ id }) => id));

export function isSearchCategory(value: unknown): value is SearchCategory {
  return typeof value === "string" && categoryIds.has(value);
}
