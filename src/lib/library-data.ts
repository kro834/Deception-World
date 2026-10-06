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
  {
    id: "world",
    title: "ディセプションワールド",
    path: "/world",
    kind: "page",
    description: "物語、六詠、八人のライダー、記録への入口。",
    aliases: ["deception world", "世界", "本編"],
  },
  {
    id: "dream",
    title: "夢の章",
    path: "/dream-chapter",
    kind: "page",
    description: "CASE 0–5、登場人物、出来事を辿る。",
    aliases: ["dream chapter", "幻想郷"],
  },
  {
    id: "gallery",
    title: "ギャラリー",
    path: "/gallery",
    hash: "gallery-collection",
    kind: "page",
    description: "番号付きの展示作品を巡る。作品番号・題名の検索は展示室内から。",
    aliases: ["gallery", "展示", "作品", "画像", "番号", "美術館"],
  },
  {
    id: "forms",
    title: "フォームアーカイブ",
    path: "/form-archive",
    kind: "page",
    description: "サーガ／レルムの形態を検索し、スペックを比較する。",
    aliases: ["form archive", "saga", "realm", "サーガ", "レルム", "比較", "フォーム"],
  },
  {
    id: "rexonance",
    title: "レクソナンスサーガ",
    path: "/rexonance-saga",
    kind: "page",
    description: "形態、性能、システムの資料。",
    aliases: ["rexonance saga", "レクソナンス・サーガ"],
  },
  {
    id: "extreme",
    title: "エクスプリームサーガ",
    path: "/extreme-saga",
    kind: "page",
    description: "形態、性能、システムの資料。",
    aliases: ["extreme saga", "エクスプリーム・サーガ", "エクストリームサーガ"],
  },
  {
    id: "final",
    title: "ファイナルステージ",
    path: "/final-stage",
    kind: "page",
    description: "ファーフロムサーガとレルムロイヤルの形態・性能資料。",
    aliases: [
      "realm royal",
      "final stage",
      "レルムロイヤル",
      "レルム・ロイヤル",
      "ファーフロムサーガ",
      "far from saga",
    ],
  },
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
  person("dante", "ダンテ", "/characters/dante", ["dante", "無管理"]),
  person("yoake-mamori", "夜明護尊", "/characters/yoake-mamori", ["yoake mamori"]),
  ...["交わる", "開く", "開ける", "明ける", "来たる", "叛く"].map((title, i): LibraryEntry => ({
    id: `dream-case-${i}`,
    title: `CASE ${i} ／ ${title}`,
    path: "/dream-chapter",
    hash: `dream-case-${i}`,
    kind: "chapter",
    description: "夢の章のあらすじへ。",
    aliases: [`case ${i}`, `case${i}`, "夢の章", "dream chapter"],
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
    LIBRARY_ENTRIES.find((entry) => entry.path === path && !entry.hash) ??
    LIBRARY_ENTRIES.find((entry) => entry.path === path)
  );
}
