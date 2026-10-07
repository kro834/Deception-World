/** Short, source-grounded paths through material that is already public. */
export type InquiryGuideId = "keepers" | "forms";

export type InquiryStop = {
  id: string;
  title: string;
  to: string;
  hash?: string;
  lookFor: string;
  excerpt: string;
  sourceLabel: string;
};

export type InquiryGuide = {
  id: InquiryGuideId;
  question: string;
  intro: string;
  color: "gold" | "blue";
  stops: readonly InquiryStop[];
};

// The order is a suggested way to observe the records, not story chronology or a
// claim that one form evolved into another. Excerpts are verbatim source snippets.
export const INQUIRY_GUIDES: readonly InquiryGuide[] = [
  {
    id: "keepers",
    question: "この世界を管理するのは誰？",
    intro: "管理人の一覧から、二人の人物資料へ。立場と語られ方の違いを、公開記録の中で見比べます。",
    color: "gold",
    stops: [
      {
        id: "manager-archive",
        title: "六詠の一覧を眺める",
        to: "/world",
        hash: "manager-archive",
        lookFor: "六つの個体記録が並ぶ入口で、名前と位置を確かめてください。",
        excerpt: "最上位管理人、六詠。六つの個体記録を照合できます。",
        sourceLabel: "World / 管理人一覧",
      },
      {
        id: "zeus",
        title: "ゼウスの資料を開く",
        to: "/managers/zeus",
        hash: "dossier-profile",
        lookFor: "第一位という肩書と、本人の経験について書かれた箇所を見比べてください。",
        excerpt: "本人はまだルーキーで、管理もあまり上手くない。",
        sourceLabel: "ゼウス / 人物資料",
      },
      {
        id: "rex-loi",
        title: "レックス・ロワの資料を開く",
        to: "/managers/rex-loi",
        hash: "dossier-profile",
        lookFor: "固定管轄を持たない立場と、引き受けている役割に注目してください。",
        excerpt: "固定された管轄を持たない六詠の管理人",
        sourceLabel: "レックス・ロワ / 人物資料",
      },
    ],
  },
  {
    id: "forms",
    question: "形態で何が変わる？",
    intro: "人物の記録、個別の形態資料、比較できるアーカイブを巡ります。並びは観察の順番です。",
    color: "blue",
    stops: [
      {
        id: "saga",
        title: "サーガの人物資料を開く",
        to: "/riders/saga",
        hash: "dossier-profile",
        lookFor: "人物の戦い方と、資料内に並ぶ形態の項目を見比べてください。",
        excerpt: "変身後の能力を活かした遠距離戦。",
        sourceLabel: "サーガ / 人物資料",
      },
      {
        id: "extreme-saga",
        title: "エクスプリームの個別資料を開く",
        to: "/extreme-saga",
        lookFor: "性能の数値と構成の説明を、同じページの別々の項目として読んでみてください。",
        excerpt: "肉弾戦に最適化したエクスプリーム。",
        sourceLabel: "エクスプリームサーガ / 個別資料",
      },
      {
        id: "form-archive",
        title: "フォームアーカイブで比べる",
        to: "/form-archive",
        lookFor: "アーカイブから形態を選び、表示されたスペックや能力を二形態で見比べてください。",
        excerpt: "任意の2形態を並列比較できるスタンドアロン・アーカイブ。",
        sourceLabel: "フォームアーカイブ / 紹介文",
      },
    ],
  },
];

export function getInquiryGuide(value: unknown): InquiryGuide | undefined {
  if (typeof value !== "string") return undefined;
  return INQUIRY_GUIDES.find((guide) => guide.id === value);
}

/** TanStack search validation: unsupported IDs and non-string values are ignored. */
export function validateInquirySearch(search: Record<string, unknown>): {
  guide?: InquiryGuideId;
} {
  const guide = getInquiryGuide(search.guide);
  return guide ? { guide: guide.id } : {};
}

/** Path only: a document's own anchor and search changes do not end the guide. */
export function getInquiryStop(
  guide: InquiryGuide | undefined,
  pathname: string,
): InquiryStop | undefined {
  if (!guide || typeof pathname !== "string") return undefined;
  return guide.stops.find((stop) => stop.to === pathname);
}

export function inquiryHref(guideId: InquiryGuideId, stop: InquiryStop): string {
  const guide = getInquiryGuide(guideId);
  if (!guide || !guide.stops.includes(stop)) throw new Error("Unknown inquiry stop");
  return `${stop.to}?guide=${encodeURIComponent(guideId)}${stop.hash ? `#${stop.hash}` : ""}`;
}
