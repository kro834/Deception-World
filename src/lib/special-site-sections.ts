/** The special sites' chapters as the side menu lists them: [hash, label, code].
 * Shared with the site search so both name the same anchors. */
export type SpecialSiteId =
  | "rexonance"
  | "extreme"
  | "far-from"
  | "illusionculum"
  | "meta-unitas"
  | "final-stage";
export type SpecialSiteSection = readonly [hash: string, label: string, code: string];

export const SPECIAL_SITE_PATHS: Record<SpecialSiteId, string> = {
  rexonance: "/rexonance-saga",
  extreme: "/extreme-saga",
  "far-from": "/far-from-saga",
  illusionculum: "/illusionculum-saga",
  "meta-unitas": "/meta-unitas-saga",
  "final-stage": "/final-stage",
};

export const SPECIAL_SITE_TITLES: Record<SpecialSiteId, string> = {
  rexonance: "レクソナンスサーガ",
  extreme: "エクスプリームサーガ",
  "far-from": "ファーフロムサーガ",
  illusionculum: "イリュージョンクルムサーガ",
  "meta-unitas": "メタ・ウニタスサーガ",
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
  // (the Rexonance site's five chapters since 2026-10-23 — overview, P16,
  // suit-up, stages, system — with the record's own sections as their
  // sub-chapters; the two comparison documents inside #report). The codes
  // are the page's own: a chapter's code is its CONTENTS code (OVERVIEW,
  // PROCESSOR for P16, SUIT-UP, 5 STAGES, SYSTEM), a sub-chapter's its
  // head's. performance, the documents (report-*) and p16 come from the
  // owner's comparison text.
  "far-from": [
    ["top", "トップ", "TOP"],
    ["overview", "概要", "OVERVIEW"],
    ["specs", "スペック", "SPECS"],
    ["performance", "性能比較", "PERFORMANCE"],
    ["report-rexonance", "対レクソナンス比較資料", "REPORT 01"],
    ["report-saga", "究極形態の比較資料", "REPORT 02"],
    ["p16", "P16", "PROCESSOR"],
    ["suitup", "変身", "SUIT-UP"],
    ["stages", "形態", "5 STAGES"],
    ["theories", "中核機構", "SYSTEM"],
    ["system", "装甲・OS", "ARMOR & OS"],
    ["authority", "能力", "ABILITY"],
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
  // 2026-10-23: the owner's record (design/illusionculum-saga-20261023/owner-text.md), in the page's
  // chapter order — the Rexonance site's grammar: overview (specs and the
  // comparison as its sub-chapters), suit-up, forms, then the record's own
  // sections (装甲・外観, 専用武装, 能力 with 必殺技).
  illusionculum: [
    ["top", "トップ", "TOP"],
    ["overview", "概要", "OVERVIEW"],
    ["specs", "スペック", "SPECS"],
    ["comparison", "性能比較", "COMPARISON"],
    ["suitup", "変身", "SUIT-UP"],
    ["forms", "形態", "FORMS"],
    ["armour", "装甲・外観", "ARMOR"],
    ["arsenal", "専用武装", "WEAPONS"],
    ["abilities", "能力", "ABILITY"],
    ["finishers", "必殺技", "FINISHER"],
  ],
  // 2026-10-23: the owner's record in the page's order — five chapters
  // (概要, 変身, 機構, 形態, 武装) with the record's own sections inside them.
  "meta-unitas": [
    ["top", "トップ", "TOP"],
    ["overview", "概要", "OVERVIEW"],
    ["specs", "スペック", "SPECS"],
    ["performance", "性能比較", "PERFORMANCE"],
    ["p16", "P14・P16", "PROCESSOR"],
    ["suitup", "変身", "SUIT-UP"],
    ["system", "基幹システム", "SYSTEM"],
    ["abilities", "固有能力", "ABILITY"],
    ["armor", "装甲・支援機構", "ARMOR"],
    ["stages", "形態段階", "STAGES"],
    ["arsenal", "専用武装", "WEAPONS"],
    ["finishers", "必殺技", "FINISHER"],
  ],
};
