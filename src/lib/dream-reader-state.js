export const DREAM_READER_STORAGE_KEY = "deception-world:dream-reader:v1";
export const DREAM_READER_DEFAULTS = { size: "standard", spacing: "standard", bookmark: null };

export function parseDreamReaderHash(hash) {
  const match = /^#dream-case-([0-5])-paragraph-([1-9]\d{0,2})$/.exec(hash || "");
  return match ? { caseNo: match[1], paragraph: Number(match[2]) } : null;
}

export function validateDreamReaderState(value, cases) {
  if (!value || value.version !== 1) return { ...DREAM_READER_DEFAULTS };
  const chapter = cases.find((episode) => episode.no === value.bookmark?.caseNo);
  const paragraph = value.bookmark?.paragraph;
  return {
    size: value.size === "large" ? "large" : "standard",
    spacing: value.spacing === "comfortable" ? "comfortable" : "standard",
    bookmark:
      chapter &&
      Number.isInteger(paragraph) &&
      paragraph > 0 &&
      paragraph <= chapter.paragraphs.length
        ? { caseNo: chapter.no, paragraph }
        : null,
  };
}

/** Only a reader's deliberate scroll/open action may update the bookmark.
 * Fragment arrivals and resume jumps never write a position or alter history. */
export function mountDreamReader(root, cases, onChange, environment = window) {
  let state = { ...DREAM_READER_DEFAULTS };
  let available = true;
  let disposed = false;
  let reading = false;
  let timer = 0;
  let storage;
  const publish = () => onChange({ ...state, available });
  try {
    storage = environment.localStorage;
    state = validateDreamReaderState(JSON.parse(storage.getItem(DREAM_READER_STORAGE_KEY)), cases);
  } catch {
    // Malformed data can be replaced on the next deliberate action. A denied
    // storage getter/read keeps the controls usable for this visit.
    try {
      storage = environment.localStorage;
      storage.getItem(DREAM_READER_STORAGE_KEY);
    } catch {
      storage = null;
      available = false;
    }
  }
  const oldSize = root?.getAttribute("data-dream-reader-size");
  const oldSpacing = root?.getAttribute("data-dream-reader-spacing");
  const apply = () => {
    root?.setAttribute("data-dream-reader-size", state.size);
    root?.setAttribute("data-dream-reader-spacing", state.spacing);
  };
  const persist = () => {
    try {
      storage?.setItem(DREAM_READER_STORAGE_KEY, JSON.stringify({ version: 1, ...state }));
    } catch {
      available = false;
    }
    publish();
  };
  const pause = () => {
    reading = false;
    environment.clearTimeout(timer);
    timer = 0;
  };
  const capture = () => {
    timer = 0;
    if (!reading || disposed || !root || root.ownerDocument.hidden) return;
    const nav = root.ownerDocument.querySelector(".dream-chapter-nav");
    const top = Math.max(0, nav?.getBoundingClientRect().bottom || 0) + 20;
    const bottom = environment.innerHeight;
    if (bottom <= top + 44) return;
    const line = top + (bottom - top) * 0.35;
    let candidate = null;
    let distance = Infinity;
    for (const paragraph of root.querySelectorAll("[data-dream-reading-paragraph]")) {
      const fold = paragraph.closest(".dream-story-case");
      if (!fold?.open) continue;
      const rect = paragraph.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= bottom) continue;
      const position = parseDreamReaderHash(`#${paragraph.id}`);
      if (!position || fold.dataset.caseNo !== position.caseNo) continue;
      const checked = validateDreamReaderState({ version: 1, bookmark: position }, cases).bookmark;
      if (!checked) continue;
      const gap = rect.top <= line && rect.bottom >= line ? 0 : Math.abs(rect.top - line);
      if (gap < distance) {
        candidate = checked;
        distance = gap;
      }
    }
    if (!candidate) return;
    if (
      state.bookmark?.caseNo === candidate.caseNo &&
      state.bookmark?.paragraph === candidate.paragraph
    )
      return;
    state = { ...state, bookmark: candidate };
    persist();
  };
  const queueCapture = () => {
    environment.clearTimeout(timer);
    if (reading && !disposed) timer = environment.setTimeout(capture, 800);
  };
  const onIntent = (event) => {
    if (event.isTrusted === false) return;
    if (event.type === "keydown") {
      if (!/^(ArrowDown|ArrowUp|PageDown|PageUp|Home|End| )$/.test(event.key)) return;
      if (event.target?.closest?.("button,input,textarea,select,[contenteditable]")) return;
    }
    reading = true;
    queueCapture();
  };
  const onClick = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const link = event.target.closest?.('a[href^="#"]');
    if (link && (!link.target || link.target === "_self") && !link.hasAttribute("download")) {
      pause();
      return;
    }
    if (event.target.closest?.(".dream-story-case > summary") && event.isTrusted !== false) {
      reading = true;
      queueCapture();
    }
  };
  const onVisibility = () => {
    if (root?.ownerDocument.hidden) pause();
  };
  apply();
  publish();
  const eventTarget = root?.ownerDocument;
  if (root) {
    eventTarget.addEventListener("click", onClick, true);
    eventTarget.addEventListener("keydown", onIntent, true);
    environment.addEventListener("wheel", onIntent, { passive: true });
    environment.addEventListener("touchmove", onIntent, { passive: true });
    environment.addEventListener("scroll", queueCapture, { passive: true });
    environment.addEventListener("hashchange", pause);
    environment.addEventListener("popstate", pause);
    environment.addEventListener("pagehide", pause);
    eventTarget.addEventListener("visibilitychange", onVisibility);
  }
  return {
    setSize(size) {
      if (disposed || !["standard", "large"].includes(size)) return;
      pause();
      state = { ...state, size };
      apply();
      persist();
    },
    setSpacing(spacing) {
      if (disposed || !["standard", "comfortable"].includes(spacing)) return;
      pause();
      state = { ...state, spacing };
      apply();
      persist();
    },
    clearBookmark() {
      if (disposed) return;
      pause();
      state = { ...state, bookmark: null };
      persist();
    },
    dispose() {
      disposed = true;
      pause();
      if (!root) return;
      eventTarget.removeEventListener("click", onClick, true);
      eventTarget.removeEventListener("keydown", onIntent, true);
      environment.removeEventListener("wheel", onIntent);
      environment.removeEventListener("touchmove", onIntent);
      environment.removeEventListener("scroll", queueCapture);
      environment.removeEventListener("hashchange", pause);
      environment.removeEventListener("popstate", pause);
      environment.removeEventListener("pagehide", pause);
      eventTarget.removeEventListener("visibilitychange", onVisibility);
      for (const [name, value] of [
        ["data-dream-reader-size", oldSize],
        ["data-dream-reader-spacing", oldSpacing],
      ]) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    },
  };
}
