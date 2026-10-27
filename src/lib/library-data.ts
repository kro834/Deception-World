import { SITE_PAGE_ENTRIES } from "./site-page-registry.ts";
import { DREAM_CHAPTERS } from "./dream-chapter-index.ts";

export type LibraryKind = "page" | "person" | "chapter";
export type LibraryEntry = {
  id: string;
  title: string;
  kind: LibraryKind;
  path: string;
  hash?: string;
  description: string;
  aliases: string[];
};
export const LIBRARY_KINDS = {
  page: "展示・アーカイブ",
  person: "人物資料",
  chapter: "夢の章",
} as const;
const person = (id: string, title: string, path: string, aliases: string[] = []): LibraryEntry => ({
  id,
  title,
  path,
  kind: "person",
  description: "公開されている人物資料を開く。",
  aliases,
});
// Navigation metadata only: no story prose or large page modules are bundled here.
export const LIBRARY_ENTRIES: readonly LibraryEntry[] = [
  ...SITE_PAGE_ENTRIES.map((entry): LibraryEntry => ({ ...entry, kind: "page" })),
  person("saga", "仮面ライダーサーガ", "/riders/saga", ["saga", "サーガ"]),
  person("realm", "仮面ライダーレルム", "/riders/realm", ["realm", "レルム"]),
  person("lore", "仮面ライダーローア", "/riders/lore", ["lore", "ローア"]),
  person("vandal", "仮面ライダーヴァンダール", "/riders/vandal", ["vandal", "ヴァンダール"]),
  person("leddic", "仮面ライダーレディック", "/riders/leddic", ["leddic", "レディック"]),
  person("argenome", "仮面ライダーアルゲノム", "/riders/argenome", ["argenome", "アルゲノム"]),
  person("over-zeztz", "仮面ライダーオーバーゼッツ", "/riders/over-zeztz", [
    "over zeztz",
    "オーバーゼッツ",
  ]),
  person("cipher", "仮面ライダーサイファー", "/riders/cipher", ["cipher", "サイファー"]),
  person("zeus", "ゼウス", "/managers/zeus", ["zeus", "六詠"]),
  person("rex-loi", "レックス・ロワ", "/managers/rex-loi", ["rex loi", "レックスロワ", "六詠"]),
  person("shuza", "シュザ", "/managers/shuza", ["shuza", "六詠"]),
  person("lejas", "レジャス", "/managers/lejas", ["lejas", "六詠"]),
  person("opus", "オパス", "/managers/opus", ["opus", "六詠"]),
  person("reemu", "リームー", "/managers/reemu", ["reemu", "六詠"]),
  person("ciel", "シエル", "/characters/ciel", ["ciel", "六詠"]),
  person("terra", "テラ・アレイン", "/characters/terra", ["terra", "テラアレイン"]),
  person("luna", "ルナ・アレイン", "/characters/luna", ["luna", "ルナアレイン"]),
  person("dante", "ダンテ／ヴァルグ", "/characters/dante", ["dante", "無管理", "ヴァルグ", "varg", "第二の犬", "原圧"]),
  person("yoake-mamori", "夜明護尊", "/characters/yoake-mamori", ["yoake mamori"]),
  ...DREAM_CHAPTERS.map(({ title, no }): LibraryEntry => ({
    id: `dream-case-${no}`,
    title: `CASE ${no} ／ ${title}`,
    path: "/dream-chapter",
    hash: `dream-case-${no}`,
    kind: "chapter",
    description: "夢の章のあらすじへ。",
    aliases: [`case ${no}`, `case${no}`, "夢の章", "dream chapter"],
  })),
];
export function normalizeLibraryQuery(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60))
    .replace(/[\s・／/–—_-]+/g, "");
}
export function searchLibrary(query: string, kind: LibraryKind | "all" = "all"): LibraryEntry[] {
  const terms = query.trim().split(/\s+/).map(normalizeLibraryQuery).filter(Boolean);
  return LIBRARY_ENTRIES.filter(
    (entry) =>
      (kind === "all" || entry.kind === kind) &&
      terms.every((term) =>
        normalizeLibraryQuery(
          [entry.title, entry.description, ...entry.aliases].join(" "),
        ).includes(term),
      ),
  );
}
export function findLibraryLocation(path: string, hash = ""): LibraryEntry | undefined {
  const fragment = hash.replace(/^#/, "");
  return (
    LIBRARY_ENTRIES.find((entry) => entry.path === path && entry.hash === fragment) ??
    // A chapter's paragraphs and nested reading anchors belong to that chapter.
    // Match a complete hyphen boundary, longest first: CASE 2 is never CASE 20.
    LIBRARY_ENTRIES.filter((entry) =>
      entry.path === path && entry.kind === "chapter" && entry.hash &&
      fragment.startsWith(`${entry.hash}-`),
    ).sort((first, second) => (second.hash?.length ?? 0) - (first.hash?.length ?? 0))[0] ??
    LIBRARY_ENTRIES.find((entry) => entry.path === path && !entry.hash) ??
    LIBRARY_ENTRIES.find((entry) => entry.path === path)
  );
}
