export type SearchDocument = {
  id: string;
  title: string;
  category: string;
  description: string;
  body?: string;
  keywords?: readonly string[];
  to: string;
  hash?: string;
};

export type SearchResult = {
  document: SearchDocument;
  snippet: string;
};

const MAX_QUERY_LENGTH = 120;
const MAX_SNIPPET_LENGTH = 180;

function normalizeSearchText(value: string): string {
  return Array.from(value.normalize("NFKC").toLowerCase(), (character) => {
    const codePoint = character.codePointAt(0)!;
    // Hiragana and katakana share the same search form. NFKC above also
    // converts half-width katakana before this mapping.
    return codePoint >= 0x30a1 && codePoint <= 0x30f6
      ? String.fromCodePoint(codePoint - 0x60)
      : character;
  }).join("");
}

function normalizeWithSourceOffsets(value: string): { text: string; offsets: number[] } {
  const clusters: Array<{ source: string; offset: number }> = [];
  let sourceOffset = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const isCombiningMark = /\p{M}/u.test(character);
    const isHalfWidthKanaMark = codePoint === 0xff9e || codePoint === 0xff9f;
    const previous = clusters.at(-1);
    if (previous && (isCombiningMark || isHalfWidthKanaMark)) previous.source += character;
    else clusters.push({ source: character, offset: sourceOffset });
    sourceOffset += character.length;
  }

  let text = "";
  const offsets: number[] = [];
  for (const cluster of clusters) {
    const normalized = normalizeSearchText(cluster.source);
    text += normalized;
    for (let index = 0; index < normalized.length; index += 1) offsets.push(cluster.offset);
  }

  return { text, offsets };
}

function searchableFields(document: SearchDocument) {
  return {
    title: normalizeSearchText(document.title),
    category: normalizeSearchText(document.category),
    description: normalizeSearchText(document.description),
    body: normalizeSearchText(document.body ?? ""),
    keywords: (document.keywords ?? []).map(normalizeSearchText),
  };
}

function scoreDocument(
  document: SearchDocument,
  terms: readonly string[],
  query: string,
): number | null {
  const fields = searchableFields(document);
  const allFields = [
    fields.title,
    fields.category,
    fields.description,
    fields.body,
    ...fields.keywords,
  ];
  if (!terms.every((term) => allFields.some((field) => field.includes(term)))) return null;

  let score = 0;
  if (query && fields.title === query) score += 100_000;
  else if (query && fields.title.startsWith(query)) score += 50_000;
  else if (query && fields.title.includes(query)) score += 25_000;

  for (const term of terms) {
    if (fields.title === term) score += 10_000;
    else if (fields.title.startsWith(term)) score += 7_000;
    else if (fields.title.includes(term)) score += 5_000;

    if (fields.keywords.some((keyword) => keyword === term)) score += 4_000;
    else if (fields.keywords.some((keyword) => keyword.startsWith(term))) score += 3_500;
    else if (fields.keywords.some((keyword) => keyword.includes(term))) score += 3_000;

    if (fields.description.includes(term)) score += 2_000;
    if (fields.body.includes(term)) score += 1_000;
    if (fields.category.includes(term)) score += 500;
  }

  return score;
}

function snippetFrom(source: string, terms: readonly string[]): string {
  const cleaned = source.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const { text, offsets } = normalizeWithSourceOffsets(cleaned);
  const matches = terms
    .map((term) => text.indexOf(term))
    .filter((index) => index >= 0)
    .sort((first, second) => first - second);
  const normalizedStart = matches[0] ?? 0;
  const normalizedEnd = matches.length
    ? normalizedStart + (terms.find((term) => text.indexOf(term) === normalizedStart)?.length ?? 0)
    : 0;
  const matchStart = offsets[normalizedStart] ?? 0;
  const matchEnd = offsets[Math.max(normalizedStart, normalizedEnd - 1)] ?? matchStart;

  let start = Math.max(0, matchStart - 72);
  let end = Math.min(cleaned.length, Math.max(matchEnd + 1, start + MAX_SNIPPET_LENGTH));
  if (end - start > MAX_SNIPPET_LENGTH) end = start + MAX_SNIPPET_LENGTH;
  if (end === cleaned.length && end - start < MAX_SNIPPET_LENGTH) {
    start = Math.max(0, end - MAX_SNIPPET_LENGTH);
  }

  const excerpt = cleaned.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < cleaned.length ? "…" : ""}`;
}

function makeSnippet(document: SearchDocument, terms: readonly string[]): string {
  const sources = [document.description, document.body ?? ""];
  const matchingSource = sources.find((source) => {
    const normalized = normalizeSearchText(source);
    return terms.some((term) => normalized.includes(term));
  });
  return snippetFrom(matchingSource ?? (document.description || document.body || ""), terms);
}

export function searchDocuments(
  documents: readonly SearchDocument[],
  query: string,
  category = "all",
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query.slice(0, MAX_QUERY_LENGTH).trim());
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const matching = documents
    .map((document, index) => ({
      document,
      index,
      score:
        category !== "all" && document.category !== category
          ? null
          : terms.length
            ? scoreDocument(document, terms, normalizedQuery)
            : 0,
    }))
    .filter(
      (entry): entry is { document: SearchDocument; index: number; score: number } =>
        entry.score !== null,
    );

  if (terms.length)
    matching.sort((first, second) => second.score - first.score || first.index - second.index);

  return matching.map(({ document }) => ({ document, snippet: makeSnippet(document, terms) }));
}
