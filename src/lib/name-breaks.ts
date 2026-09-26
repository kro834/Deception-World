/* Where a long display name may break: between its words, never inside one.
   レクソナンスサーガ reads レクソナンス／サーガ on two lines, not
   レクソナ／ンスサーガ. A zero-width space marks each seam:
   - after a leading 仮面ライダー (仮面ライダー／ドレッド);
   - after a leading ロード before a name of its own (ロード／ケイオス);
   - after a middle dot or a full-width slash in a list (サイファー・／ブラックサイト,
     ロイヤル／ラース／…);
   - before a closing サーガ (ファーフロム／サーガ).
   The name's style keeps katakana whole (word-break: keep-all or auto-phrase),
   so these seams are its only breaks, and overflow-wrap still breaks a word
   too long for its column. The stored names are unchanged; screen readers
   and find-in-page pass over U+200B. */
const SEAM = "​";
const KATAKANA = "\\u30a0-\\u30ff";

const LEADING_WORD = new RegExp(`^(仮面ライダー|ロード(?=[${KATAKANA}]{3}))(?=.)`, "u");
const LIST_MARK = /([・／])(?=.)/gu;
const CLOSING_SAGA = new RegExp(`([${KATAKANA}]{3,})(サーガ)$`, "u");

export function withWordBreaks(name: string) {
  return name
    .replace(LEADING_WORD, `$1${SEAM}`)
    .replace(LIST_MARK, `$1${SEAM}`)
    .replace(CLOSING_SAGA, `$1${SEAM}$2`);
}
