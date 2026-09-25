import { useEffect, useState } from "react";

type Chapter = { no: string; title: string; kicker: string };
type ReaderDestination = { id: string; label: string };

/** Native anchors keep the archive navigable before hydration, too. */
export function DossierContents({ sections }: { sections: readonly Chapter[] }) {
  return (
    <nav className="dossier-contents" aria-label="人物資料の章">
      {sections.map((section) => (
        <a key={section.no} href={`#character-section-${section.no}`}>
          <span className="dossier-contents-number">{section.no}</span>
          <span className="dossier-contents-copy">
            <small>{section.kicker}</small>
            <b>{section.title}</b>
          </span>
          <span className="dossier-contents-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      ))}
    </nav>
  );
}

export function DossierReader({
  name,
  identity = false,
  forms = false,
}: {
  name: string;
  identity?: boolean;
  forms?: boolean;
}) {
  const [active, setActive] = useState("dossier-profile");
  const destinations: ReaderDestination[] = [
    { id: "dossier-profile", label: "人物紹介" },
    ...(identity ? [{ id: "identity-records", label: "関連記録" }] : []),
    { id: "dossier-index", label: "人物資料" },
    ...(forms ? [{ id: "form-records", label: "変身記録" }] : []),
  ];
  const ids = destinations.map((item) => item.id).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length) return;
    let observer: IntersectionObserver | undefined;
    let resizeFrame = 0;
    let scrollTimer = 0;
    let syncNow: (() => void) | null = null;

    const observePosition = () => {
      observer?.disconnect();
      // Match native anchor placement, including the fixed header and reader.
      // A percentage-based band can remain above the section after an iPad jump.
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const margin = parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;
      const height = Math.max(1, window.innerHeight);
      const line = Math.min(height - 1, Math.max(0, padding + margin + 2));
      const intersecting = new Set<Element>();
      const syncActive = (entries: IntersectionObserverEntry[] = []) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target);
          else intersecting.delete(entry.target);
        }
        // Entries contain only changed intersections, not the current full set.
        // Resolve from document order so upward scrolling and gaps stay stable.
        // Keep the observer's visibility result: fractional layout/animation
        // coordinates can differ slightly from a fresh bounding-rect read.
        // A short final section can never reach the line on a tall screen, so
        // at the end of the page the last section in view is the current one.
        const doc = document.documentElement;
        const atEnd =
          window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
        const current = (
          atEnd
            ? sections.filter(
                (section) => section.getBoundingClientRect().top < window.innerHeight - 1,
              )
            : sections.filter(
                (section) =>
                  intersecting.has(section) || section.getBoundingClientRect().top <= line + 1,
              )
        ).at(-1);
        setActive((current ?? sections[0]).id);
      };
      syncNow = syncActive;
      observer = new IntersectionObserver(syncActive, {
        rootMargin: `-${line}px 0px -${Math.max(0, height - line - 1)}px 0px`,
        threshold: 0,
      });
      sections.forEach((section) => observer?.observe(section));
      syncActive();
    };
    // Reaching the page end crosses no observer line, so settle once the
    // scroll stops. Chrome can drop scrollend when a late layout change clamps
    // a wheel scroll, and Safari may lack it, so a trailing debounce on scroll
    // always backs it up; scrollend only settles sooner where it does fire.
    const onScrollEnd = () => syncNow?.();
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0;
        syncNow?.();
      }, 120);
    };
    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        observePosition();
      });
    };
    // Parent route effects install data-mode and its scroll-padding after child
    // effects; measure on the next frame, once that shared chrome is applied.
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", onScrollEnd, { passive: true });
    }
    return () => {
      observer?.disconnect();
      syncNow = null;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, [ids]);

  return (
    <nav className="dossier-reader" aria-label={`${name}の資料内を移動`}>
      <span className="dossier-reader-name">{name}</span>
      <div className="dossier-reader-links">
        {destinations.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? "location" : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
