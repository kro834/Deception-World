// PROTOTYPE (2026-11-23, step 1 of "innovative side menu and dossiers").
// The real menu's seven regions and their destinations, as the live menu
// lists them on /riders/saga. Labels are the owner's text, copied as shown.
import { RELATED_NAV, RIDER_NAV, RIKUEI_NAV } from "@/components/world/dossier-nav";
import { launcherTile } from "@/lib/thumbnail-images";

export type ProtoItem = { label: string; href?: string; img?: string };
export type ProtoRegion = { id: string; label: string; items: ProtoItem[] };

const file = (link: { name: string; href: string | null }): ProtoItem => ({
  label: link.name,
  href: link.href ?? undefined,
  img: launcherTile(link.href),
});

export const PROTO_REGIONS: ProtoRegion[] = [
  {
    id: "find",
    label: "資料",
    items: [
      { label: "クイック検索" },
      { label: "全文検索", href: "/search" },
      { label: "資料室・しおり", href: "/library" },
      {
        label: "変身・フォーム研究室",
        href: "/transformation-lab",
        img: "/rider-saga-rexonance-thumbnail-20260827-240.webp",
      },
      {
        label: "世界関係図",
        href: "/world-map",
        img: "/episode-03-deception-world-delivery-600.webp",
      },
      {
        label: "フォームアーカイブ",
        href: "/form-archive",
        img: "/archive-media/thumbs/realm-royal.webp",
      },
      {
        label: "DOGS ARCHIVE",
        href: "/dogs-archive",
        img: "/dogs-archive-20261028/guardian-480.webp",
      },
      { label: "資料を保存" },
    ],
  },
  {
    id: "sections",
    label: "ページ内",
    items: [
      { label: "人物紹介", href: "/riders/saga#dossier-profile" },
      { label: "関連記録", href: "/riders/saga#identity-records" },
      { label: "人物資料", href: "/riders/saga#dossier-index" },
      { label: "変身記録", href: "/riders/saga#form-records" },
      { label: "ワールドへ戻る", href: "/world" },
    ],
  },
  {
    id: "special",
    label: "サーガ",
    items: [
      { label: "エクスプリームサーガ", href: "/extreme-saga#top" },
      { label: "レクソナンスサーガ", href: "/rexonance-saga#top" },
      { label: "イリュージョンクルムサーガ", href: "/illusionculum-saga#top" },
      { label: "メタ・ウニタスサーガ", href: "/meta-unitas-saga#top" },
      { label: "ファーフロムサーガ", href: "/far-from-saga#top" },
    ],
  },
  {
    id: "stories",
    label: "物語",
    items: [
      { label: "映画四部作「仮面ライダーサーガ」本編リメイク", href: "/saga-cinema#top" },
      { label: "映画第一作「ドリームチャプター」", href: "/dream-chapter" },
      { label: "ファイナルステージ", href: "/final-stage#top" },
    ],
  },
  {
    id: "people",
    label: "人物",
    items: [
      ...RIDER_NAV.map(file),
      ...RIKUEI_NAV.map(file),
      ...RELATED_NAV.map(file),
      file({ name: "夜明護尊", href: "/characters/yoake-mamori" }),
      { label: "ダンテ／ヴァルグ", href: "/characters/dante", img: "/character-dante-thumb.webp" },
    ],
  },
  {
    id: "information",
    label: "ギャラリー・お知らせ",
    items: [{ label: "ギャラリー", href: "/gallery" }, { label: "お知らせ" }],
  },
  {
    id: "system",
    label: "設定",
    items: [
      { label: "シエルボタン" },
      { label: "ボタン：リキッドグラス" },
      { label: "高品質" },
      { label: "軽量" },
      { label: "トップ", href: "/" },
      { label: "オープニング", href: "/?opening=true" },
    ],
  },
];

/** One destination: a real link, or (search, save, toggles) an inert button
 * in the prototype. */
export function protoItemProps(item: ProtoItem) {
  return item.href ? ({ href: item.href } as const) : ({ role: "button", tabIndex: 0 } as const);
}
