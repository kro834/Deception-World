import { useEffect, useRef, useState } from "react";

const ART = [
  "/episode-01-hide-and-seek-delivery-900.webp",
  "/episode-02-legends-delivery-900.webp",
  "/episode-03-deception-world-delivery-900.webp",
];

/** A decorative stage alongside the unchanged World files. No new lore. */
export function WorldBriefArt() {
  const ref = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  const [art, setArt] = useState<{ current: number; previous: number | null }>({
    current: 0,
    previous: null,
  });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1101px)");
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!wide || typeof IntersectionObserver === "undefined") return;
    const root = ref.current?.closest("#world-brief");
    if (!root) return;
    const rows = Array.from(root.querySelectorAll(".wa-brief, .wa-locations li"));
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target),
        );
        const row = rows.find((candidate) => visible.has(candidate));
        if (!row) return;
        const next = rows.indexOf(row) % ART.length;
        setArt((value) =>
          value.current === next ? value : { current: next, previous: value.current },
        );
      },
      { rootMargin: "-20% 0px -55%", threshold: 0 },
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [wide]);
  return (
    <aside ref={ref} className="wa-brief-art" aria-hidden="true">
      {wide ? (
        <>
          {art.previous !== null ? (
            <img
              key={`previous-${art.previous}`}
              src={ART[art.previous]}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <img
            key={`current-${art.current}`}
            className="is-current"
            src={ART[art.current]}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </>
      ) : null}
    </aside>
  );
}
