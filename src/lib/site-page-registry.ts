/** Lightweight published-page navigation, shared by library and search.
 * Descriptions and display names come from the existing pages; no story modules. */
export type SitePageEntry = {
  id: string;
  title: string;
  path: string;
  hash?: string;
  searchHash?: string;
  description: string;
  aliases: string[];
};

export const SITE_PAGE_ENTRIES: readonly SitePageEntry[] = [
  {
    id: "transformation-lab",
    title: "変身・フォーム研究室",
    path: "/transformation-lab",
    searchHash: "lab-main",
    description: "四つの変身を再生・逆再生し、同じ工程で形態を比較する。",
    aliases: ["変身ラボ", "研究室", "逆再生", "部位", "工程", "transformation lab"],
  },
  {
    id: "world-map",
    title: "世界関係図",
    path: "/world-map",
    searchHash: "world-map-main",
    description: "人物・組織・形態・章を、公開資料の根拠とともに辿る。",
    aliases: ["相関図", "関係図", "所属", "人物関係", "world map"],
  },
  {
    id: "world",
    searchHash: "top",
    title: "ディセプションワールド",
    path: "/world",
    description: "物語、六詠、八人のライダー、記録への入口。",
    aliases: ["deception world", "世界", "本編"],
  },
  {
    id: "dream",
    searchHash: "top",
    title: "夢の章",
    path: "/dream-chapter",
    description: "CASE 0–5、登場人物、出来事を辿る。",
    aliases: ["dream chapter", "幻想郷"],
  },
  {
    id: "gallery",
    searchHash: "gallery-collection",
    title: "ギャラリー",
    path: "/gallery",
    hash: "gallery-collection",
    description: "番号付きの展示作品を巡る。作品番号・題名の検索は展示室内から。",
    aliases: ["gallery", "展示", "作品", "画像", "番号", "美術館"],
  },
  {
    id: "forms",
    title: "フォームアーカイブ",
    path: "/form-archive",
    description: "サーガ／レルムの形態を検索し、スペックを比較する。",
    aliases: ["form archive", "saga", "realm", "サーガ", "レルム", "比較", "フォーム"],
  },
  {
    id: "rexonance",
    title: "レクソナンスサーガ",
    path: "/rexonance-saga",
    description: "形態、性能、システムの資料。",
    aliases: ["rexonance saga", "レクソナンス・サーガ"],
  },
  {
    id: "dogs-archive",
    title: "DOGS ARCHIVE",
    path: "/dogs-archive",
    searchHash: "dogs-selector",
    description: "5体の“犬”の個体セレクター。第五の“犬”を立体で鑑賞する。",
    aliases: ["dogs archive", "犬", "個体記録", "立体", "3D"],
  },
  {
    id: "extreme",
    title: "エクスプリームサーガ",
    path: "/extreme-saga",
    description: "形態、性能、システムの資料。",
    aliases: ["extreme saga", "エクスプリーム・サーガ", "エクストリームサーガ"],
  },
  {
    id: "far-from",
    title: "ファーフロムサーガ",
    path: "/far-from-saga",
    description: "変身、形態、性能、中核機構の資料。",
    aliases: ["far from saga", "ファーフロム・サーガ", "ファーフロム"],
  },
  {
    id: "illusionculum",
    title: "イリュージョンクルムサーガ",
    path: "/illusionculum-saga",
    description: "変身、形態、性能、装甲、武装、能力の資料。",
    aliases: ["illusionculum saga", "イリュージョンクルム・サーガ", "イリュージョンクルム"],
  },
  {
    id: "final",
    title: "ファイナルステージ",
    path: "/final-stage",
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
  {
    id: "meta-unitas",
    title: "メタ・ウニタスサーガ",
    path: "/meta-unitas-saga",
    searchHash: "top",
    description:
      "仮面ライダーメタ・ウニタスサーガの特設サイト。変身音声、スペック、性能比較、変身、基幹システム、固有能力、装甲・支援機構、形態段階、専用武装、必殺技を掲載。",
    aliases: ["meta unitas saga", "メタウニタスサーガ", "メタ・ウニタスサーガ・ウルトラ"],
  },
  {
    id: "saga-cinema",
    title: "映画四部作『仮面ライダーサーガ』",
    path: "/saga-cinema",
    searchHash: "top",
    description:
      "『仮面ライダーサーガ』本編をリメイクする映画4部作。邂逅、覚醒、激情、終末。ディセプションワールド内の映画特設ページ。",
    aliases: ["saga cinema", "映画四部作", "邂逅", "覚醒", "激情", "終末"],
  },
  {
    id: "gallery-tours",
    title: "展示ツアー",
    path: "/gallery-tours",
    searchHash: "main",
    description:
      "星の光、雨の動き、静かな横顔。テーマを選んで、ディセプションワールドの作品をゆっくり巡る展示ツアー。",
    aliases: ["gallery tours", "展示", "ツアー"],
  },
  {
    id: "exhibition",
    title: "原画のある展示室",
    path: "/exhibition",
    searchHash: "main",
    description: "原画をそのまま飾り、額縁・ガラス・漆喰の壁・石床・照明を立体で鑑賞する展示室。",
    aliases: ["exhibition", "展示室", "原画", "立体展示", "3D"],
  },
];
