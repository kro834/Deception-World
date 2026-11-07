export const DREAM_RESEARCH_KEY = "dream-research-notes-v1";
export const emptyResearch = () => ({ version: 1, quotes: [], notes: [] });

export function validateResearch(value, _cases = []) {
  if (!value || value.version !== 1 || !Array.isArray(value.quotes) || !Array.isArray(value.notes))
    return emptyResearch();
  const ids = new Set();
  const quotes = value.quotes
    .slice(0, 100)
    .filter((q) => {
      if (
        !q ||
        typeof q.id !== "string" ||
        !q.id ||
        ids.has(q.id) ||
        typeof q.text !== "string" ||
        !q.text.trim() ||
        q.text.length > 4000
      )
        return false;
      // Saved text is a historical snapshot. Current content only controls navigation,
      // never whether a quote or its associated thoughts survive a reload.
      const legacy = typeof q.caseNo === "string" && q.caseNo.length > 0;
      if (!Number.isInteger(q.paragraph) || q.paragraph < 1 || (!legacy && !validSource(q.source)))
        return false;
      if (q.source !== undefined && !validSource(q.source)) return false;
      if (
        q.anchor !== undefined &&
        (!q.anchor ||
          q.anchor.exact !== q.text ||
          typeof q.anchor.prefix !== "string" ||
          typeof q.anchor.suffix !== "string" ||
          q.anchor.prefix.length > 128 ||
          q.anchor.suffix.length > 128)
      )
        return false;
      ids.add(q.id);
      return true;
    })
    .map(({ id, caseNo, paragraph, text, source, anchor }) => ({
      id,
      ...(typeof caseNo === "string" ? { caseNo } : {}),
      paragraph,
      text,
      ...(source
        ? {
            source: {
              kind: source.kind,
              id: source.id,
              title: source.title ?? "",
              paragraphId: source.paragraphId,
            },
          }
        : {}),
      ...(anchor
        ? { anchor: { exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix } }
        : {}),
    }));
  const noteIds = new Set();
  const notes = value.notes
    .slice(0, 100)
    .filter((n) => {
      if (
        !n ||
        typeof n.id !== "string" ||
        !n.id ||
        noteIds.has(n.id) ||
        typeof n.thought !== "string" ||
        !n.thought.trim() ||
        n.thought.length > 8000 ||
        !Array.isArray(n.quoteIds) ||
        n.quoteIds.length !== 2 ||
        n.quoteIds[0] === n.quoteIds[1] ||
        !n.quoteIds.every((id) => ids.has(id))
      )
        return false;
      noteIds.add(n.id);
      return true;
    })
    .map(({ id, thought, quoteIds }) => ({ id, thought, quoteIds }));
  return { version: 1, quotes, notes };
}

export function readResearch(storage, cases) {
  try {
    const raw = storage.getItem(DREAM_RESEARCH_KEY);
    if (raw === null) return { data: emptyResearch(), error: "" };
    const value = JSON.parse(raw);
    const data = validateResearch(value, cases);
    const clean =
      value?.version === 1 &&
      Array.isArray(value.quotes) &&
      Array.isArray(value.notes) &&
      data.quotes.length === value.quotes.length &&
      data.notes.length === value.notes.length;
    return {
      data,
      error: clean
        ? ""
        : "保存内容の一部を読み込めませんでした。確認できる記録だけを表示しています。",
    };
  } catch {
    return {
      data: emptyResearch(),
      error: "記録を読み込めませんでした。ブラウザーの保存設定をご確認ください。",
    };
  }
}

export function writeResearch(storage, data) {
  try {
    storage.setItem(DREAM_RESEARCH_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function removeResearchQuote(data, id) {
  return {
    ...data,
    quotes: data.quotes.filter((q) => q.id !== id),
    notes: data.notes.filter((n) => !n.quoteIds.includes(id)),
  };
}

function validSource(source) {
  return (
    source &&
    ["case", "person"].includes(source.kind) &&
    typeof source.id === "string" &&
    source.id.length > 0 &&
    source.id.length <= 200 &&
    (source.title === undefined ||
      (typeof source.title === "string" && source.title.length <= 500)) &&
    typeof source.paragraphId === "string" &&
    source.paragraphId.length > 0 &&
    source.paragraphId.length <= 300
  );
}

/** Offsets come from the actual DOM Range, never text.indexOf(selectedText). */
export function createResearchAnchor(text, start, end) {
  if (
    typeof text !== "string" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length
  )
    return null;
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 64), start),
    suffix: text.slice(end, end + 64),
  };
}

/** Resolve conservatively against the current source; do not rewrite snapshots. */
export function resolveResearchQuote(quote, sources) {
  const descriptor = quote.source ?? {
    kind: "case",
    id: quote.caseNo,
    paragraphId: `dream-case-${quote.caseNo}-paragraph-${quote.paragraph}`,
  };
  const matchingSources = sources.filter(
    (source) => source.kind === descriptor.kind && source.id === descriptor.id,
  );
  if (matchingSources.length > 1) return { status: "ambiguous" };
  const source = matchingSources[0];
  if (!source) return { status: "missing" };
  const anchor = quote.anchor ?? { exact: quote.text, prefix: "", suffix: "" };
  if (!anchor.exact || anchor.exact !== quote.text) return { status: "missing" };
  const candidates = [];
  for (const paragraph of source.paragraphs) {
    let from = 0;
    while (from <= paragraph.text.length - anchor.exact.length) {
      const start = paragraph.text.indexOf(anchor.exact, from);
      if (start < 0) break;
      const end = start + anchor.exact.length;
      if (
        paragraph.text.slice(0, start).endsWith(anchor.prefix) &&
        paragraph.text.slice(end).startsWith(anchor.suffix)
      ) {
        candidates.push({ status: "resolved", source, paragraph, start, end });
      }
      from = start + 1;
    }
  }
  // Numeric paragraph identities can be reused after a revision. Never use
  // their old position to break a tie between identical contextual matches.
  if (candidates.length !== 1) return { status: candidates.length ? "ambiguous" : "missing" };
  // Legacy v1 saved no surrounding context. A moved exact string alone cannot
  // establish that a different paragraph is the one the reader originally used.
  if (!quote.anchor && candidates[0].paragraph.id !== descriptor.paragraphId)
    return { status: "missing" };
  return candidates[0];
}
