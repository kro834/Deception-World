// AppGuards gives native fragment entries the same stable keys as routed entries.
// Keep this data for the lifetime of the document so a reload starts fresh.
type LocalReturn = { value: string };
const sources = new Map<string, LocalReturn & { href: string }>();
type ChapterReturn = {
  sourceKey: string;
  destination: string;
  controlIndex: number;
  linkTop: number;
  scrollTop: number;
};
const chapterReturns = new Map<string, ChapterReturn>();

export function rememberLocalHistoryReturn(entry: LocalReturn, environment = window) {
  const key = environment.history.state?.__TSR_key;
  if (typeof key === "string") sources.set(key, { href: environment.location.href, ...entry });
}

export function readLocalHistoryReturn(environment: Window | undefined = globalThis.window) {
  if (!environment) return null;
  const entry = sources.get(environment.history.state?.__TSR_key);
  return entry?.href === environment.location.href ? entry : null;
}

export function mountChapterHistoryReturn(
  index: HTMLElement | null,
  bar: HTMLElement | null,
  environment = window,
) {
  if (!index) return;
  const indexLinks = [...index.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const barLinks = [...(bar?.querySelectorAll<HTMLAnchorElement>('a[href^="#"]') ?? [])];
  const links = [...indexLinks, ...barLinks];
  const currentKey = (): string | undefined => environment.history.state?.__TSR_key;
  let previousKey = currentKey();
  let previousHref = environment.location.href;
  let pendingChapter: ChapterReturn | null = null;
  let frame = 0;
  const cancelFocus = () => {
    environment.cancelAnimationFrame(frame);
    frame = 0;
  };

  const remember = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = (event.target as Element | null)?.closest?.("a");
    const controlIndex = links.findIndex((entry) => entry === target);
    const link = links[controlIndex];
    if (!link) return;
    const hash = link.getAttribute("href");
    const sourceKey = currentKey();
    if (sourceKey && hash && hash !== environment.location.hash) {
      previousKey = sourceKey;
      previousHref = environment.location.href;
      pendingChapter = {
        sourceKey,
        destination: link.href,
        controlIndex,
        linkTop: link.getBoundingClientRect().top,
        scrollTop: environment.scrollY,
      };
    }
  };

  const restore = () => {
    const { hash, href: location } = environment.location;
    const key = currentKey();
    if (key === previousKey && location === previousHref) return;
    const source = previousKey ? chapterReturns.get(previousKey) : undefined;
    previousKey = key;
    previousHref = location;
    cancelFocus();
    if (pendingChapter && location === pendingChapter.destination) {
      // A native fragment acquires a router key on arrival. Also observe
      // hashchange in case the key was still missing at popstate.
      if (key) {
        chapterReturns.set(key, pendingChapter);
        pendingChapter = null;
      }
    } else pendingChapter = null;
    const link = source && source.sourceKey === key ? links[source.controlIndex] : undefined;
    if (!link && !links.some((entry) => entry.getAttribute("href") === hash)) return;
    // Let the browser finish traversal before resetting the sequential Tab position.
    frame = environment.requestAnimationFrame(() => {
      frame = 0;
      if (environment.location.href !== location || currentKey() !== key) return;
      if (link && source) {
        const rect = link.getBoundingClientRect();
        if (barLinks.includes(link)) {
          // The fixed bar stays visible even when WebKit leaves the reader
          // in the chapter they just left.
          if (Math.abs(environment.scrollY - source.scrollTop) > 4) {
            environment.scrollTo({ top: source.scrollTop, behavior: "instant" });
          }
        } else if (rect.bottom <= 0 || rect.top >= environment.innerHeight) {
          const top = Math.max(0, Math.min(source.linkTop, environment.innerHeight - rect.height));
          environment.scrollBy({ top: rect.top - top, behavior: "instant" });
        }
        link.focus({ preventScroll: true });
      } else if (indexLinks.some((entry) => entry === index.ownerDocument.activeElement)) {
        // Chrome can carry the focused index link forward into a distant chapter.
        index.ownerDocument.getElementById(hash.slice(1))?.focus({ preventScroll: true });
      }
    });
  };

  const inputEvents = ["keydown", "pointerdown", "wheel", "focusin"] as const;
  index.addEventListener("click", remember);
  bar?.addEventListener("click", remember);
  environment.addEventListener("popstate", restore);
  environment.addEventListener("hashchange", restore);
  for (const input of inputEvents) environment.addEventListener(input, cancelFocus, true);
  return () => {
    index.removeEventListener("click", remember);
    bar?.removeEventListener("click", remember);
    environment.removeEventListener("popstate", restore);
    environment.removeEventListener("hashchange", restore);
    for (const input of inputEvents) environment.removeEventListener(input, cancelFocus, true);
    cancelFocus();
  };
}
