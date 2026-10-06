// Shared source for React titles and independently rendered archive documents.
// Name labels use these seams; Japanese prose keeps its normal kinsoku.
const SEAM = "\u200b";
const LEADING_WORD = /^(仮面ライダー|ロード(?=[\u30a0-\u30ff]{3}))(?=.)/u;
const SAGA_WORD = /([\u30a0-\u30ff]{3,})(サーガ)(?=$|[・／/\s（(])/gu;

/** @param {string} name */
export function withWordBreaks(name) {
  return name
    .replace(LEADING_WORD, `$1${SEAM}`)
    .replace(SAGA_WORD, `$1${SEAM}$2`)
    .replace(/([・／/])(?=.)/gu, `$1${SEAM}`)
    .replace(/(サーガ)(\s+)(?=\S)/gu, `$1$2${SEAM}`);
}

/** @param {string} name @returns {{ text: string, protected: boolean }[]} */
export function nameWords(name) {
  return withWordBreaks(name)
    .split(SEAM)
    .filter(Boolean)
    .map((text) => ({
      text,
      // Short words stay whole. Long unseamed names retain a narrow-column
      // fallback without smaller type or a wider page.
      protected: [...text.trim()].length <= 4,
    }));
}
