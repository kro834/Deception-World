/** The special sites' chapters as the side menu lists them: [hash, label, code].
 * Shared with the site search so both name the same anchors. */
export type SpecialSiteId = "rexonance" | "extreme" | "final-stage";
export type SpecialSiteSection = readonly [hash: string, label: string, code: string];

export const SPECIAL_SITE_PATHS: Record<SpecialSiteId, string> = {
  rexonance: "/rexonance-saga",
  extreme: "/extreme-saga",
  "final-stage": "/final-stage",
};

export const SPECIAL_SITE_TITLES: Record<SpecialSiteId, string> = {
  rexonance: "レクソナンスサーガ",
  extreme: "エクスプリームサーガ",
  "final-stage": "ファイナルステージ",
};

export const SPECIAL_SITE_SECTIONS: Record<SpecialSiteId, readonly SpecialSiteSection[]> = {
  rexonance: [
    ["top", "トップ", "TOP"],
    ["performance", "パフォーマンス", "PERFORMANCE"],
    ["p14", "P14", "PROCESSOR"],
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
  "final-stage": [
    ["top", "トップ", "TOP"],
    ["story", "あらすじ", "STORY"],
    ["characters", "登場人物", "CHARACTERS"],
    ["far-from-saga", "ファーフロムサーガ", "RIDER 01"],
    ["realm-royal", "レルムロイヤル", "RIDER 02"],
  ],
};
