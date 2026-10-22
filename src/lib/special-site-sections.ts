/** The special sites' chapters as the side menu lists them: [hash, label, code].
 * Shared with the site search so both name the same anchors. */
export type SpecialSiteId = "rexonance" | "extreme" | "far-from" | "final-stage";
export type SpecialSiteSection = readonly [hash: string, label: string, code: string];

export const SPECIAL_SITE_PATHS: Record<SpecialSiteId, string> = {
  rexonance: "/rexonance-saga",
  extreme: "/extreme-saga",
  "far-from": "/far-from-saga",
  "final-stage": "/final-stage",
};

export const SPECIAL_SITE_TITLES: Record<SpecialSiteId, string> = {
  rexonance: "レクソナンスサーガ",
  extreme: "エクスプリームサーガ",
  "far-from": "ファーフロムサーガ",
  "final-stage": "ファイナルステージ",
};

export const SPECIAL_SITE_SECTIONS: Record<SpecialSiteId, readonly SpecialSiteSection[]> = {
  rexonance: [
    ["top", "トップ", "TOP"],
    ["performance", "パフォーマンス", "PERFORMANCE"],
    ["p14", "P14", "PROCESSOR"],
    ["assembly", "変身", "SUIT-UP"],
    ["stages", "三つの運用段階", "STAGES"],
    ["system", "トリニティ・レゾナンス", "SYSTEM"],
  ],
  extreme: [
    ["top", "トップ", "TOP"],
    ["performance", "性能比較", "COMPARISON"],
    ["p14", "P14", "PROCESSOR"],
    ["stages", "二つの運用段階", "STAGES"],
    ["system", "中核システム", "SYSTEM"],
  ],
  // 2026-10-22: the owner's record in full; performance, p16 and suitup are
  // prepared chapters (準備中) on the page.
  "far-from": [
    ["top", "トップ", "TOP"],
    ["overview", "概要", "OVERVIEW"],
    ["specs", "スペック", "SPECS"],
    ["performance", "性能比較", "COMPARISON"],
    ["p16", "P16", "PROCESSOR"],
    ["suitup", "スーツアップ", "SUIT-UP"],
    ["stages", "五つの形態段階", "STAGES"],
    ["theories", "新規理論・中核機構", "CORE"],
    ["system", "装甲・浮遊ユニットと統合OS", "SYSTEM"],
    ["authority", "神属権限・継承能力", "AUTHORITY"],
    ["arsenal", "追加武装", "ARSENAL"],
    ["finishers", "必殺技", "FINISHER"],
  ],
  "final-stage": [
    ["top", "トップ", "TOP"],
    ["story", "あらすじ", "STORY"],
    ["characters", "登場人物", "CHARACTERS"],
    ["far-from-saga", "ファーフロムサーガ", "RIDER 01"],
    ["realm-royal", "レルムロイヤル", "RIDER 02"],
  ],
};
