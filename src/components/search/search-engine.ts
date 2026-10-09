/**
 * The site search engine: pure functions over a prepared, normalised index.
 *
 * Ranking is tiered per search term: a title hit outweighs any alias or
 * keyword hit, which outweighs any description or body hit. Kana, width,
 * case, middle dots, long-vowel marks, ヴ spellings and a few kanji variants
 * are folded; Latin input also matches the romaji of kana names and the
 * English aliases each record carries.
 */
export type SearchSection = { no: string; title: string };

export type SearchDocument = {
  id: string;
  title: string;
  category: string;
  description: string;
  body?: string;
  keywords?: readonly string[];
  /** Search-only spellings (English, romaji, readings). Never displayed. */
  aliases?: readonly string[];
  to: string;
  hash?: string;
  /** Router search params for the destination (e.g. the Realm archive). */
  search?: Readonly<Record<string, string>>;
  /** A summary card (e.g. the World roster) that defers to the person's own
   * dossier when both match. */
  secondary?: boolean;
  /** Dossier chapters inside `body`; a body hit opens `#character-section-NN`. */
  sections?: readonly SearchSection[];
};

export type MatchRange = readonly [start: number, end: number];
export type MatchTier = "title" | "alias" | "text";

export type SearchResult = {
  document: SearchDocument;
  snippet: string;
  score: number;
  tier: MatchTier;
  /** The anchor to open: the matching dossier chapter, or the record's own. */
  hash?: string;
  /** "05 · 章題" when the snippet comes from a dossier chapter. */
  section?: string;
  titleRanges: MatchRange[];
  snippetRanges: MatchRange[];
  /** The matching name when the result stands for a record found under it. */
  via?: string;
};

const MAX_QUERY_LENGTH = 120;
const MAX_SNIPPET_LENGTH = 180;
const MAX_TERMS = 8;

const VARIANTS: Record<string, string> = {
  髙: "高",
  﨑: "崎",
  邊: "辺",
  邉: "辺",
  澤: "沢",
  濱: "浜",
  齋: "斎",
  齊: "斉",
  嶋: "島",
  嶌: "島",
  國: "国",
  會: "会",
  與: "与",
  櫻: "桜",
  廣: "広",
  惠: "恵",
  眞: "真",
  曻: "昇",
  冨: "富",
  煕: "熙",
};
const VARIANT_PATTERN = new RegExp(`[${Object.keys(VARIANTS).join("")}]`, "g");

/** NFKC, lower case, katakana as hiragana, kanji variants folded. Length-stable
 * per source cluster except where NFKC itself expands (offsets are tracked). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(VARIANT_PATTERN, (kanji) => VARIANTS[kanji] ?? kanji);
}

const LOOSE_SPELLINGS: [RegExp, string][] = [
  [/ゔぁ/g, "ば"],
  [/ゔぃ/g, "び"],
  [/ゔぇ/g, "べ"],
  [/ゔぉ/g, "ぼ"],
  [/ゔ/g, "ぶ"],
  [/ぢ/g, "じ"],
  [/づ/g, "ず"],
  [/を/g, "お"],
];

/** A forgiving key: no spaces, dots, dashes, brackets or long-vowel marks. */
export function looseSearchKey(normalized: string): string {
  let key = normalized.replace(
    /[\s・･·.\-‐–—_〜~/／|｜()（）「」『』【】［］[\]、。,，!！?？:：;'"“”‘’]+/g,
    "",
  );
  for (const [pattern, replacement] of LOOSE_SPELLINGS) key = key.replace(pattern, replacement);
  return key;
}

const ROMAJI: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  ゐ: "i",
  ゑ: "e",
  を: "o",
  ん: "n",
  ゔ: "vu",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゎ: "wa",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };
const SMALL_VOWEL: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };

/** Hepburn-style romaji for the kana in a normalised string (other characters
 * pass through, spaces and marks are dropped). ゼウス → zeusu. */
export function toRomaji(normalized: string): string {
  const chars = Array.from(normalized);
  let out = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];
    if (char === "っ") {
      const following = next ? (ROMAJI[next] ?? "") : "";
      out += following.startsWith("ch") ? "t" : (following[0] ?? "");
      continue;
    }
    if (char === "ー") continue;
    const base = ROMAJI[char];
    if (base === undefined) {
      if (/[\s・･·\-‐–—_/／]/.test(char)) continue;
      out += char;
      continue;
    }
    if (next && SMALL_Y[next] && base.endsWith("i") && base.length > 1) {
      const stem =
        base === "shi" || base === "chi" || base === "ji"
          ? base.slice(0, -1)
          : base.slice(0, -1) + "y";
      out += stem + SMALL_Y[next];
      index += 1;
      continue;
    }
    if (next && SMALL_VOWEL[next] && base.length > 1) {
      out += base.replace(/[aiueo]$/, "") + SMALL_VOWEL[next];
      index += 1;
      continue;
    }
    out += base;
  }
  return out;
}

/** Normalised text plus, for each normalised UTF-16 unit, the source span it came from. */
function normalizeWithSourceOffsets(value: string): {
  text: string;
  starts: number[];
  ends: number[];
} {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  const characters = Array.from(value);
  for (let index = 0; index < characters.length; index += 1) {
    let cluster = characters[index];
    // Combining marks and half-width voicing marks fold into their base.
    while (
      index + 1 < characters.length &&
      (/\p{M}/u.test(characters[index + 1]) ||
        characters[index + 1] === "ﾞ" ||
        characters[index + 1] === "ﾟ")
    ) {
      index += 1;
      cluster += characters[index];
    }
    const normalized = normalizeSearchText(cluster);
    for (let unit = 0; unit < normalized.length; unit += 1) {
      starts.push(offset);
      ends.push(offset + cluster.length);
    }
    text += normalized;
    offset += cluster.length;
  }
  return { text, starts, ends };
}

/** Every occurrence of every term in `source`, merged, in source offsets. */
export function findMatchRanges(source: string, terms: readonly string[]): MatchRange[] {
  if (!source || !terms.length) return [];
  const { text, starts, ends } = normalizeWithSourceOffsets(source);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) {
      ranges.push([starts[at], ends[at + term.length - 1]]);
      if (ranges.length > 64) break;
    }
  }
  ranges.sort((first, second) => first[0] - second[0] || second[1] - first[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

type PreparedField = { text: string; loose: string; romaji: string };
type PreparedDocument = {
  document: SearchDocument;
  index: number;
  title: PreparedField;
  titleWords: string[];
  names: PreparedField[];
  description: string;
  body: string;
  sectionStarts: { no: string; title: string; at: number }[];
  dedupeKey: string;
};

const prepareField = (value: string): PreparedField => {
  const text = normalizeSearchText(value);
  return { text, loose: looseSearchKey(text), romaji: looseSearchKey(toRomaji(text)) };
};

const preparedCache = new WeakMap<readonly SearchDocument[], PreparedDocument[]>();

function prepare(documents: readonly SearchDocument[]): PreparedDocument[] {
  const cached = preparedCache.get(documents);
  if (cached) return cached;
  const prepared = documents.map((document, index): PreparedDocument => {
    const body = document.body ?? "";
    const sectionStarts: PreparedDocument["sectionStarts"] = [];
    if (document.sections?.length && body) {
      let from = 0;
      for (const section of document.sections) {
        const at = body.startsWith(`${section.title}\n`, from)
          ? from
          : body.indexOf(`\n${section.title}\n`, from);
        if (at < 0) continue;
        sectionStarts.push({ ...section, at });
        from = at + section.title.length;
      }
    }
    const title = prepareField(document.title);
    return {
      document,
      index,
      title,
      titleWords: title.text.split(/[\s・･·/／|｜「」『』()（）]+/).filter(Boolean),
      names: [...(document.keywords ?? []), ...(document.aliases ?? [])]
        .filter((name) => name.length <= 80)
        .map(prepareField),
      description: normalizeSearchText(document.description),
      body: normalizeSearchText(body),
      sectionStarts,
      // One result per dossier: the World roster card and the rider record
      // open the same page.
      dedupeKey:
        document.hash === "dossier-profile" ? `${document.to}#dossier-profile` : document.id,
    };
  });
  preparedCache.set(documents, prepared);
  return prepared;
}

type Term = { text: string; loose: string; latin: boolean };

export function parseSearchTerms(query: string): Term[] {
  const normalized = normalizeSearchText(query.slice(0, MAX_QUERY_LENGTH).trim());
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS)
    .map((text) => ({
      text,
      loose: looseSearchKey(text),
      latin: /^[a-z0-9.\-_'&]+$/.test(text),
    }));
}

const TITLE_TIER = 10_000;
const ALIAS_TIER = 1_000;

function scoreTerm(entry: PreparedDocument, term: Term): number {
  const { title } = entry;
  const loose = term.loose || term.text;
  // Title
  if (title.text === term.text || title.loose === loose) return TITLE_TIER * 1.0;
  if (title.text.startsWith(term.text) || title.loose.startsWith(loose)) return TITLE_TIER * 0.85;
  if (entry.titleWords.some((word) => word.startsWith(term.text))) return TITLE_TIER * 0.75;
  if (title.text.includes(term.text) || (loose.length > 2 && title.loose.includes(loose)))
    return TITLE_TIER * 0.65;
  if (term.latin && loose.length >= 2) {
    if (title.romaji.startsWith(loose)) return TITLE_TIER * 0.6;
    if (loose.length >= 3 && title.romaji.includes(loose)) return TITLE_TIER * 0.55;
  }
  // Aliases and keywords
  let best = 0;
  for (const name of entry.names) {
    let score = 0;
    if (name.text === term.text || name.loose === loose) score = ALIAS_TIER * 4.5;
    else if (name.text.startsWith(term.text) || name.loose.startsWith(loose))
      score = ALIAS_TIER * 4;
    else if (name.text.includes(term.text) || (loose.length > 2 && name.loose.includes(loose)))
      score = ALIAS_TIER * 3.5;
    else if (term.latin && loose.length >= 2 && name.romaji.startsWith(loose))
      score = ALIAS_TIER * 3;
    else if (term.latin && loose.length >= 3 && name.romaji.includes(loose))
      score = ALIAS_TIER * 2.5;
    if (score > best) best = score;
    if (best === ALIAS_TIER * 4.5) break;
  }
  if (best) return best;
  // Description and body
  if (entry.description.includes(term.text)) return 200;
  if (entry.body.includes(term.text)) return 100;
  return 0;
}

const TIER_RANK: Record<MatchTier, number> = { title: 0, alias: 1, text: 2 };

function tierOf(score: number): MatchTier {
  return score >= TITLE_TIER * 0.5 ? "title" : score >= ALIAS_TIER ? "alias" : "text";
}

function snippetAround(source: string, at: number, length: number): string {
  const cleaned = source.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (at < 0) {
    return cleaned.length > MAX_SNIPPET_LENGTH
      ? `${cleaned.slice(0, MAX_SNIPPET_LENGTH).trim()}…`
      : cleaned;
  }
  let start = Math.max(0, at - 72);
  let end = Math.min(cleaned.length, Math.max(at + length, start + MAX_SNIPPET_LENGTH));
  if (end - start > MAX_SNIPPET_LENGTH) end = start + MAX_SNIPPET_LENGTH;
  if (end === cleaned.length && end - start < MAX_SNIPPET_LENGTH)
    start = Math.max(0, end - MAX_SNIPPET_LENGTH);
  const excerpt = cleaned.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < cleaned.length ? "…" : ""}`;
}

/** The first source offset where any term matches, using normalised offsets. */
function firstMatch(source: string, terms: readonly string[]): { at: number; length: number } {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const { text, starts, ends } = normalizeWithSourceOffsets(cleaned);
  let best = -1;
  let bestTerm = "";
  for (const term of terms) {
    const at = text.indexOf(term);
    if (at >= 0 && (best < 0 || at < best)) {
      best = at;
      bestTerm = term;
    }
  }
  if (best < 0) return { at: -1, length: 0 };
  return { at: starts[best], length: ends[best + bestTerm.length - 1] - starts[best] };
}

function describeMatch(
  entry: PreparedDocument,
  terms: readonly Term[],
  tier: MatchTier,
): Pick<SearchResult, "snippet" | "hash" | "section" | "snippetRanges"> {
  const { document } = entry;
  const words = terms.map((term) => term.text);
  // A name or alias hit opens the record itself; only a hit in the text
  // opens the chapter it was found in.
  const inDescription = words.some((word) => entry.description.includes(word));
  const bodyHit =
    tier === "text" && !inDescription && words.length ? firstBodyHit(entry, words) : -1;
  let snippet: string;
  let hash = document.hash;
  let section: string | undefined;
  if (bodyHit >= 0 && document.body) {
    const chapter = entry.sectionStarts.filter((item) => item.at <= bodyHit).at(-1);
    if (chapter) {
      hash = `character-section-${chapter.no}`;
      section = `${chapter.no} · ${chapter.title}`;
    }
    // Body text around the hit, from its own paragraph onwards.
    const paragraphStart = document.body.lastIndexOf("\n", bodyHit) + 1;
    const source = document.body.slice(paragraphStart);
    const { at, length } = firstMatch(source, words);
    snippet = snippetAround(source, at, length);
  } else {
    const source = document.description || document.body || "";
    const { at, length } = firstMatch(source, words);
    snippet = snippetAround(source, at, length);
  }
  return { snippet, hash, section, snippetRanges: findMatchRanges(snippet, words) };
}

/** Body offset (in the raw body) of the earliest term hit, or -1. */
function firstBodyHit(entry: PreparedDocument, words: readonly string[]): number {
  const body = entry.document.body ?? "";
  if (!body) return -1;
  // Most bodies normalise unit for unit, so the prepared text's offsets are
  // the source's; only a body NFKC changed in length needs the offset map.
  const aligned = entry.body.length === body.length;
  const text = aligned ? entry.body : normalizeWithSourceOffsets(body).text;
  let best = -1;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  if (best < 0) return -1;
  return aligned ? best : normalizeWithSourceOffsets(body).starts[best];
}

/** Snippets, chapter links and highlights are worked out only for the
 * results a page actually renders. */
function lazyResult(
  entry: PreparedDocument,
  terms: readonly Term[],
  score: number,
  tier: MatchTier,
): SearchResult {
  let described: ReturnType<typeof describeMatch> | undefined;
  let titleRanges: MatchRange[] | undefined;
  const describe = () => (described ??= describeMatch(entry, terms, tier));
  return {
    document: entry.document,
    score,
    tier,
    get titleRanges() {
      return (titleRanges ??= findMatchRanges(
        entry.document.title,
        terms.map((term) => term.text),
      ));
    },
    get snippet() {
      return describe().snippet;
    },
    get hash() {
      return describe().hash;
    },
    get section() {
      return describe().section;
    },
    get snippetRanges() {
      return describe().snippetRanges;
    },
  };
}

export function searchDocuments(
  documents: readonly SearchDocument[],
  query: string,
  category = "all",
): SearchResult[] {
  const prepared = prepare(documents);
  const terms = parseSearchTerms(query);
  const whole = normalizeSearchText(query.slice(0, MAX_QUERY_LENGTH).trim());
  const wholeLoose = looseSearchKey(whole);
  const scored: { entry: PreparedDocument; score: number; tier: MatchTier }[] = [];

  for (const entry of prepared) {
    if (category !== "all" && entry.document.category !== category) continue;
    if (!terms.length) {
      scored.push({ entry, score: 0, tier: "text" });
      continue;
    }
    let score = 0;
    let weakest = Infinity;
    let matched = true;
    for (const term of terms) {
      const termScore = scoreTerm(entry, term);
      if (!termScore) {
        matched = false;
        break;
      }
      score += termScore;
      weakest = Math.min(weakest, termScore);
    }
    if (!matched) continue;
    // The whole phrase as typed, then shorter titles first among equals.
    if (terms.length > 1) {
      if (entry.title.text === whole || entry.title.loose === wholeLoose) score += TITLE_TIER * 2;
      else if (entry.title.loose.startsWith(wholeLoose)) score += TITLE_TIER;
      else if (entry.title.loose.includes(wholeLoose)) score += TITLE_TIER / 2;
    }
    score += Math.max(0, 40 - entry.title.text.length) / 10;
    scored.push({ entry, score, tier: tierOf(weakest) });
  }

  if (terms.length)
    scored.sort(
      (first, second) => second.score - first.score || first.entry.index - second.entry.index,
    );

  // One result per dossier. A secondary record (the World roster card for a
  // person with their own dossier) stands in only when the dossier itself
  // did not match; the group keeps its best score and tier.
  const groups = new Map<
    string,
    { entry: PreparedDocument; score: number; tier: MatchTier; best: PreparedDocument }
  >();
  const order: string[] = [];
  for (const item of scored) {
    const current = groups.get(item.entry.dedupeKey);
    if (!current) {
      groups.set(item.entry.dedupeKey, { ...item, best: item.entry });
      order.push(item.entry.dedupeKey);
      continue;
    }
    if (current.entry.document.secondary && !item.entry.document.secondary)
      current.entry = item.entry;
    if (TIER_RANK[item.tier] < TIER_RANK[current.tier]) current.tier = item.tier;
  }
  return order.map((key) => {
    const { entry, score, tier, best } = groups.get(key)!;
    const result = lazyResult(entry, terms, score, tier);
    // 月城悠真 found on the roster card opens 仮面ライダーサーガ: say why.
    if (best !== entry && tier === "title") result.via = best.document.title;
    return result;
  });
}

/** Results by category, ordered by each group's best hit (or `order` when browsing). */
export function groupSearchResults(
  results: readonly SearchResult[],
  order: readonly string[],
  ranked: boolean,
): { category: string; results: SearchResult[] }[] {
  const groups = new Map<string, SearchResult[]>();
  if (!ranked) for (const category of order) groups.set(category, []);
  for (const result of results) {
    const list = groups.get(result.document.category) ?? [];
    list.push(result);
    groups.set(result.document.category, list);
  }
  return [...groups]
    .filter(([, list]) => list.length)
    .map(([category, list]) => ({ category, results: list }));
}

function editDistance(first: string, second: string, limit: number): number {
  if (Math.abs(first.length - second.length) > limit) return limit + 1;
  const a = Array.from(first);
  const b = Array.from(second);
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, previousPrevious[j - 2] + 1);
      current.push(value);
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > limit) return limit + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

/** Close spellings among titles, keywords and aliases for a query with no results. */
export function suggestSearchQueries(
  documents: readonly SearchDocument[],
  query: string,
  limit = 4,
): string[] {
  const terms = parseSearchTerms(query);
  if (terms.length !== 1) return [];
  const [term] = terms;
  const key = term.loose || term.text;
  const length = Array.from(key).length;
  if (length < 2) return [];
  const allowed = length <= 3 ? 1 : length <= 7 ? 2 : 3;
  const candidates = new Map<string, { display: string; distance: number }>();
  const consider = (display: string, target: string, windows: boolean) => {
    if (!target || (term.latin && !/^[a-z0-9]+$/.test(target))) return;
    // The whole name, and for titles each window of about the query's length,
    // so ぜうず finds ゼウス and さいふぁ finds 仮面ライダーサイファー.
    let distance = editDistance(key, target, allowed);
    // Windows inside a longer name allow one slip (two for long queries), so
    // short queries do not match random stretches of long titles.
    const windowAllowed = length <= 8 ? 1 : 2;
    const chars = Array.from(target);
    for (let start = 0; windows && distance > 0 && start + length - 1 <= chars.length; start += 1) {
      for (const span of [length - 1, length, length + 1]) {
        if (span < 2 || start + span > chars.length) continue;
        const inside = editDistance(key, chars.slice(start, start + span).join(""), windowAllowed);
        if (inside <= windowAllowed)
          distance = Math.min(distance, inside + (span === length ? 0 : 0.5));
      }
    }
    if (distance === 0 || distance > allowed) return;
    const id = normalizeSearchText(display);
    const previous = candidates.get(id);
    if (!previous || distance < previous.distance) candidates.set(id, { display, distance });
  };
  const keyOf = (field: PreparedField) => (term.latin ? field.romaji : field.loose);
  for (const entry of prepare(documents)) {
    consider(entry.document.title, keyOf(entry.title), true);
    for (const name of [...(entry.document.keywords ?? []), ...(entry.document.aliases ?? [])]) {
      // A reading in brackets suggests the name before it: 在原華火（ありはら はなか）.
      const reading = /^(.+?)[（(]([^）)]+)[）)]$/.exec(name);
      if (reading) consider(reading[1].trim(), keyOf(prepareField(reading[2])), true);
      else if (name.length <= 16) consider(name, keyOf(prepareField(name)), false);
    }
  }
  return [...candidates.values()]
    .sort(
      (first, second) =>
        first.distance - second.distance || first.display.length - second.display.length,
    )
    .slice(0, limit)
    .map(({ display }) => display);
}
