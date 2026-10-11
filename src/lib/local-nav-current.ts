/** The chapter in view in a page's own bar (rx14). The link whose section
 * crosses the middle of the screen carries aria-current="location", the
 * value the World header gives its chapter, so assistive tech hears where the
 * reader is and the bar can light it without a scroll timeline. Pages with a
 * scroll-linked light keep it; this mark is the fallback and the semantics.
 * Only same-page links whose target exists are followed. */
export function mountLocalNavCurrent(nav: Element | null | undefined): () => void {
  if (!nav || typeof IntersectionObserver === "undefined") return () => {};
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const sections = new Map<Element, HTMLAnchorElement>();
  for (const link of links) {
    let id = "";
    try {
      id = decodeURIComponent(link.getAttribute("href")!.slice(1));
    } catch {
      continue;
    }
    const section = id ? document.getElementById(id) : null;
    if (section) sections.set(section, link);
  }
  if (!sections.size) return () => {};
  const crossing = new Set<Element>();
  let current: HTMLAnchorElement | null = null;
  let observer: IntersectionObserver | null = null;
  let active = true;
  let generation = 0;
  let observedHeight = 0;
  let frame = 0;
  const sync = () => {
    // The last chapter, in the bar's order, that spans the line.
    let next: HTMLAnchorElement | null = null;
    for (const [section, link] of sections) if (crossing.has(section)) next = link;
    if (next === current) return;
    current?.removeAttribute("aria-current");
    current = next;
    current?.setAttribute("aria-current", "location");
  };
  const observe = () => {
    if (!active) return;
    const height = Math.max(1, document.documentElement.clientHeight || window.innerHeight);
    if (height === observedHeight) return;
    observedHeight = height;
    observer?.disconnect();
    crossing.clear();
    sync();
    const version = ++generation;
    // IntersectionObserver resolves even vertical percentages against width.
    // Pixel margins keep the rx14 middle band inside a landscape viewport too.
    observer = new IntersectionObserver(
      (entries) => {
        if (!active || version !== generation) return;
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target);
          else crossing.delete(entry.target);
        }
        sync();
      },
      {
        rootMargin: `-${Math.floor(height * 0.5)}px 0px -${Math.floor(height * 0.49)}px 0px`,
        threshold: 0,
      },
    );
    for (const section of sections.keys()) observer.observe(section);
  };
  const resize = () => {
    if (!active || frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      observe();
    });
  };
  observe();
  window.addEventListener("resize", resize, { passive: true });
  return () => {
    active = false;
    window.removeEventListener("resize", resize);
    if (frame) window.cancelAnimationFrame(frame);
    observer?.disconnect();
    observer = null;
    current?.removeAttribute("aria-current");
    current = null;
    crossing.clear();
    sections.clear();
  };
}
