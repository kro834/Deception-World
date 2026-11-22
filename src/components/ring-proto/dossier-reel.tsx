// PROTOTYPE d3 「滑車リール」: the dossier still scrolls, on a pulley reel.
// An amber thread loop runs over two pulleys beside the text; the chapters are
// tags tied to it, so scrolling winds the reel and the reel shows where you
// are (and takes you there). The figure hangs on the same thread as the
// counterweight: it sinks as the file is drawn up. Each block is hoisted into
// place in turn (the owner's karakuri chain; the real build would use the
// shared ring-motion chain instead of this local one).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { dossierImage } from "@/lib/dossier-images";
import { protoRider } from "./rider";
import {
  ProtoChapter,
  ProtoFacts,
  ProtoForms,
  ProtoIdentity,
  ProtoQuotes,
  ProtoTopbar,
} from "./dossier-parts";

export function DossierReel({ riderId }: { riderId: string }) {
  const rider = protoRider(riderId);
  const chapters: { id: string; label: string; body: ReactNode }[] = [
    {
      id: "profile",
      label: "人物紹介",
      body: (
        <>
          <ProtoQuotes rider={rider} />
          <ProtoFacts rider={rider} />
        </>
      ),
    },
    { id: "identity", label: "関連記録", body: <ProtoIdentity rider={rider} /> },
    ...rider.sections.map((section) => ({
      id: `section-${section.no}`,
      label: section.kicker,
      body: <ProtoChapter section={section} />,
    })),
    ...(rider.forms.length
      ? [{ id: "forms", label: "変身記録", body: <ProtoForms rider={rider} /> }]
      : []),
  ];
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(root.querySelectorAll<HTMLElement>(".rp-d3-chapter"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.scrollY + window.innerHeight * 0.4;
      let index = 0;
      for (let i = 0; i < sections.length; i += 1) {
        if (sections[i].offsetTop <= line) index = i;
      }
      const top = sections[index].offsetTop;
      const end = sections[index + 1]?.offsetTop ?? top + sections[index].offsetHeight;
      const within = Math.min(1, Math.max(0, (line - top) / Math.max(1, end - top)));
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      // Reduced motion: the reel only steps between chapters.
      root.style.setProperty("--q", String(calm ? index : index + within));
      root.style.setProperty("--p", String(calm ? 0 : Math.min(1, window.scrollY / max)));
      setActive(index);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Hoist: each block is released when it comes into view.
    root.dataset.armed = "true";
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = "true";
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const part of root.querySelectorAll(".rp-d3-chapter > *")) seen.observe(part);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, []);

  return (
    <main className="rp-doc rp-d3" ref={rootRef} style={{ ["--tone" as string]: rider.tone }}>
      <ProtoTopbar />
      <aside className="rp-d3-stage">
        <i className="rp-d3-pulley" aria-hidden="true" />
        <div className="rp-d3-weight">
          <i className="rp-d3-rope" aria-hidden="true" />
          <span className="rp-d3-figure">
            <img
              src={rider.civilianImg}
              {...dossierImage(rider.civilianImg)}
              alt={`${rider.civilian.name}の変身前ビジュアル`}
            />
          </span>
        </div>
      </aside>
      <nav className="rp-d3-reel" aria-label={`${rider.civilian.name}の資料`}>
        <i className="rp-d3-reel-thread" aria-hidden="true" />
        <i className="rp-d3-pulley rp-d3-pulley-a" aria-hidden="true" />
        <i className="rp-d3-pulley rp-d3-pulley-b" aria-hidden="true" />
        {chapters.map((chapter, index) => (
          <a
            key={chapter.id}
            href={`#rp-d3-${chapter.id}`}
            aria-current={index === active ? "true" : undefined}
            style={{ ["--i" as string]: index }}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`rp-d3-${chapter.id}`)?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
                block: "start",
              });
            }}
          >
            <i aria-hidden="true" />
            <span>{chapter.label}</span>
          </a>
        ))}
      </nav>
      <div className="rp-d3-file">
        <header className="rp-d3-identity">
          <h1>{rider.civilian.name}</h1>
          <p># {rider.epithet}</p>
        </header>
        {chapters.map((chapter) => (
          <section className="rp-d3-chapter" id={`rp-d3-${chapter.id}`} key={chapter.id}>
            {chapter.body}
          </section>
        ))}
      </div>
    </main>
  );
}
