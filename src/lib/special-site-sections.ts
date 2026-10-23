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
  // 2026-10-22: the owner's record in full, in the page's chapter order
  // (the Rexonance order — performance, processor, suit-up, stages, system
  // — with the record's own chapters around it; far-from-saga.tsx numbers
  // them 01–11, the two comparison documents inside 03). performance, the
  // documents (report-*) and p16 come from the owner's comparison text.
  "far-from": [
    ["top", "トップ", "TOP"],
    ["overview", "概要", "OVERVIEW"],
    ["specs", "スペック", "SPECS"],
    ["performance", "性能比較", "PERFORMANCE"],
    ["report-rexonance", "対レクソナンス比較資料", "REPORT 01"],
    ["report-saga", "究極形態の比較資料", "REPORT 02"],
    ["p16", "P16", "PROCESSOR"],
    ["suitup", "変身シークエンス", "SUIT-UP"],
    ["stages", "形態", "5 STAGES"],
    ["theories", "中核機構", "MECHANISM"],
    ["system", "装甲・OS", "ARMOR & OS"],
    ["authority", "神属権限", "AUTHORITY"],
    ["arsenal", "武装", "WEAPONS"],
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
