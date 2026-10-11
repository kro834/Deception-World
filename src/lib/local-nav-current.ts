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
  const sync = () => {
    // The last chapter, in the bar's order, that spans the line.
    let next: HTMLAnchorElement | null = null;
    for (const [section, link] of sections) if (crossing.has(section)) next = link;
    if (next === current) return;
    current?.removeAttribute("aria-current");
    current = next;
    current?.setAttribute("aria-current", "location");
  };
  // A thin band across the middle of the screen: the line a chapter crosses.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) crossing.add(entry.target);
        else crossing.delete(entry.target);
      }
      sync();
    },
    { rootMargin: "-50% 0px -49% 0px", threshold: 0 },
  );
  sections.forEach((_, section) => observer.observe(section));
  return () => {
    observer.disconnect();
    current?.removeAttribute("aria-current");
    current = null;
  };
}
