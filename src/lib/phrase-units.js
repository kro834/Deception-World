// Protected phrase units: the words a line must never split (2026-11-26,
// owner 「途中改行を根こそぎ直して」). One shared source for the React text
// pass (phrase-jsx-runtime.js), the archive documents
// (archive-name-words.js) and the line-break tests.
//
// A unit is a proper noun or term from the site's own data (the generated
// dictionary), a katakana run (仮面ライダー… included), a 『』《》【】 span, a
// Latin or number token that the browser could otherwise break inside
// (SA-GA, 0.00021s／100m, 50000〜YOPS, ＳＡＧＡ) or a number with its
// counter (2026年, 第2話). Everything between units keeps ordinary
// Japanese breaking (strict kinsoku), so long prose stays flush.
//
// The unit is kept whole by `white-space: nowrap` on an inline <dw-u>
// (styles-name-words.css): CSS 2 behaviour that WebKit, Blink and Gecko
// implement alike, unlike word-break: auto-phrase (Chromium only). A unit
// wider than `cap` em is split at its own seams (仮面ライダー｜…, …｜サーガ,
// ・｜, イリュージョン｜クルム), a device compound at its words (ファーフロム｜コア)
// and a seamless one is left to the ordinary rules, so a 320px column is not
// pushed wider and a flush paragraph is not left with a wide gap.
import { PHRASE_STEMS, PHRASE_TERMS } from "./phrase-terms.generated.js";
import { withWordBreaks } from "./name-break-rules.js";

const KANA = "\u30a1-\u30fa\u30fd\u30fe\u31f0-\u31ff";
const KANA_RUN = `(?:仮面)?[${KANA}](?:[${KANA}\u30fc]|\u30fb(?=[${KANA}]))+`;
const ALNUM = "A-Za-z0-9\uff10-\uff19\uff21-\uff3a\uff41-\uff5a";
const NUMBER_TAIL = "(?:[.,][0-9\uff10-\uff19]+)*";
const WORD = `[${ALNUM}]+(?:[.,'][${ALNUM}]+)*`;
// Joiners after which a browser may break inside a Latin or number token.
const JOIN = "\\-\u2010\u2011\u2013/\uff0f\u301c\uff5e~:\uff1a+\uff0b\u00d7\u30fb";
const LATIN = `${WORD}(?:[${JOIN}]${WORD})+[%\uff05]?`;
const WIDE_LATIN = "[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]{2,}";
const COUNTER = `第?[0-9\uff10-\uff19]+${NUMBER_TAIL}[年月日時分秒人体話章部作回種名機基台枚倍件個本冊巻号位歳代度]`;
const BRACKETS = "『[^』\\n]{1,24}』|《[^》\\n]{1,24}》|【[^】\\n]{1,24}】";
const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERMS = [...PHRASE_TERMS].sort((a, b) => b.length - a.length).map(escape).join("|");

/** Every unit source, for the audit and the tests. */
export const PHRASE_UNIT_SOURCE = [BRACKETS, TERMS, KANA_RUN, LATIN, WIDE_LATIN, COUNTER]
  .filter(Boolean)
  .join("|");
const UNIT = new RegExp(PHRASE_UNIT_SOURCE, "gu");
// A cheap gate: text with none of these characters has no unit at all.
const MAYBE = new RegExp(`[${KANA}『《【${ALNUM}\u4e00-\u9fff]`, "u");

/** Approximate advance in em: wide (CJK, kana, fullwidth) 1, Latin 0.6. */
export function emWidth(text) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code < 0x2e80 ? (char === " " ? 0.3 : 0.6) : code >= 0xff61 && code <= 0xff9f ? 0.5 : 1;
  }
  return width;
}

/** Prose blocks have a full measure (about 17em at 320px); headings hold
    about 8em at their size in a phone card; labels and tiles ~7em. */
export const PROSE_CAP = 12;
export const HEADING_CAP = 8;
export const LABEL_CAP = 7;

// The name seams (src/lib/name-break-rules.js), the joint after a name the
// site's data spells (レクソナンス｜パーク…) and the suffixes a long katakana
// compound ends in (ハイブリッド｜フォーム, ゼッツ｜ドライバー).
const STEM = new RegExp(`(${PHRASE_STEMS.map(escape).join("|")})(?=[${KANA}])`, "gu");
const SUFFIX = /([^\u200b])(フォーム|モード|ドライバー|システム|アーキテクチャ|ユニット)/gu;
const seams = (unit) =>
  withWordBreaks(unit).replace(STEM, "$1\u200b").replace(SUFFIX, "$1\u200b$2");

// A device or system compound wider than a label (ファーフロムコア,
// エクスサーガドライバー) is held as its words, not as one block: a line may end
// between ファーフロム and コア, a word boundary, so a flush paragraph is not
// left with a gap the width of the whole compound. Names stay whole up to the
// cap (レクソナンスサーガ, イリュージョンクルム); so does a bracketed title up to
// 10em (『KHAOS DeuX』, 『SA-GA OS 5.5』) unless it is one such compound.
const COMPOUND = 7;
const BRACKET = 10;
const SOFT = /([^\u200b])(コア|ドライバー|システム|モード|ユニット|アーキテクチャ|エンジン|プロセス|ブースター|アーマー)/gu;
const KANA_ONLY = new RegExp(`^[${KANA}ー・]+$`, "u");
/** @param {string} unit */
const compoundWords = (unit) => {
  if (!KANA_ONLY.test(unit) || emWidth(unit) <= COMPOUND) return null;
  const words = unit.replace(SOFT, "$1\u200b$2").split("\u200b");
  return words.length > 1 ? words : null;
};

const primarySeams = (unit) =>
  unit.replace(/^(仮面ライダー)(?=.)/u, "$1\u200b").replace(/(\u30fb)(?=.)/gu, "$1\u200b");

/** Seam pieces joined again from the left while they fit, so a long name
 * breaks at as few of its seams as it must (イリュージョンクルム｜サーガ). */
function joinWhileFits(pieces, cap) {
  const out = [];
  for (const piece of pieces) {
    const last = out.length - 1;
    if (last >= 0 && emWidth(out[last] + piece) <= cap) out[last] += piece;
    else out.push(piece);
  }
  return out;
}

const cache = new Map();

/**
 * Split text into alternating plain runs and protected units: even indices are
 * plain text (possibly empty), odd indices are units. Returns null when the
 * text holds no unit, so callers keep the original string untouched. Joining
 * the result always gives back the input exactly.
 * @param {string} text
 * @param {number} [cap]
 * @returns {string[] | null}
 */
export function splitPhraseUnits(text, cap = LABEL_CAP) {
  if (text.length < 2 || !MAYBE.test(text)) return null;
  const key = `${cap}\u0000${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const parts = [];
  let plain = "";
  let cursor = 0;
  const pushUnit = (unit) => {
    parts.push(plain, unit);
    plain = "";
  };
  // A unit wider than the cap keeps its narrow seam pieces whole and leaves
  // the rest to the ordinary rules; a long title keeps the words inside it.
  const wide = (unit) => {
    if ("『《【".includes(unit[0])) {
      plain += unit[0];
      const inner = splitPhraseUnits(unit.slice(1, -1), cap);
      if (inner) {
        plain += inner[0];
        for (let index = 1; index < inner.length; index += 2) {
          pushUnit(inner[index]);
          plain += inner[index + 1];
        }
      } else plain += unit.slice(1, -1);
      plain += unit.at(-1);
      return;
    }
    // 仮面ライダー｜レクソナンスサーガ before レクソナンス｜サーガ: the name's
    // own seams are tried only on a piece that still does not fit.
    for (const piece of primarySeams(unit).split("\u200b")) {
      const pieces = emWidth(piece) <= cap ? [piece] : joinWhileFits(seams(piece).split("\u200b"), cap);
      for (const word of pieces) {
        if (word.length > 1 && emWidth(word) <= cap) pushUnit(word);
        else plain += word;
      }
    }
  };
  const take = (unit) => {
    const bracket = "『《【".includes(unit[0]);
    const words = compoundWords(bracket ? unit.slice(1, -1) : unit);
    if (words && bracket) wide(unit);
    else if (words) for (const word of words) take(word);
    else if (unit.length < 2) plain += unit;
    else if (emWidth(unit) <= (bracket ? Math.min(cap, BRACKET) : cap)) pushUnit(unit);
    else wide(unit);
  };
  for (const match of text.matchAll(UNIT)) {
    const unit = match[0];
    const at = match.index ?? 0;
    plain += text.slice(cursor, at);
    cursor = at + unit.length;
    take(unit);
  }
  plain += text.slice(cursor);
  parts.push(plain);
  const result = parts.length > 1 ? parts : null;
  if (cache.size > 4000) cache.clear();
  cache.set(key, result);
  return result;
}
