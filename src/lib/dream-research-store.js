export const DREAM_RESEARCH_KEY = "dream-research-notes-v1";
export const emptyResearch = () => ({ version: 1, quotes: [], notes: [] });

export function validateResearch(value, cases) {
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
      const chapter = cases.find((c) => c.no === q.caseNo);
      if (!Number.isInteger(q.paragraph) || !chapter?.paragraphs[q.paragraph - 1]?.includes(q.text))
        return false;
      ids.add(q.id);
      return true;
    })
    .map(({ id, caseNo, paragraph, text }) => ({ id, caseNo, paragraph, text }));
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
