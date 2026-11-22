// PROTOTYPE d2 「回転ファイル」: the dossier as a drum of cards.
// Each part of the file is one card on a wheel. Wheel, swipe, arrow keys, the
// rim index, or a tap on a neighbour turn the drum one detent; the card flips
// to the front on the bounce spring. The neighbours stay in sight, tilted
// away, so you always see what comes next.
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

export function DossierWheel({ riderId, initialPart }: { riderId: string; initialPart?: string }) {
  const rider = protoRider(riderId);
  const cards: { id: string; label: string; body: ReactNode }[] = [
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
  const n = cards.length;
  const [pos, setPos] = useState(
    Math.max(
      0,
      cards.findIndex((card) => card.id === initialPart),
    ),
  );
  const drumRef = useRef<HTMLDivElement>(null);
  const lock = useRef(0);
  const touch = useRef<{ y: number; edgeUp: boolean; edgeDown: boolean } | null>(null);
  const go = (next: number) => setPos(Math.min(n - 1, Math.max(0, next)));

  useEffect(() => {
    const drum = drumRef.current;
    if (!drum) return;
    const front = () => drum.querySelector<HTMLElement>('[data-rel="0"] .rp-d2-scroll');
    const edges = () => {
      const scroll = front();
      if (!scroll) return { up: true, down: true };
      return {
        up: scroll.scrollTop <= 1,
        down: scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1,
      };
    };
    // A long card scrolls first; the drum turns once its edge is reached.
    const onWheel = (event: WheelEvent) => {
      const { up, down } = edges();
      const direction = Math.sign(event.deltaY);
      if ((direction > 0 && !down) || (direction < 0 && !up)) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lock.current || Math.abs(event.deltaY) < 8) return;
      lock.current = now + 420;
      setPos((value) => Math.min(n - 1, Math.max(0, value + direction)));
    };
    const onTouchStart = (event: TouchEvent) => {
      const { up, down } = edges();
      touch.current = { y: event.touches[0].clientY, edgeUp: up, edgeDown: down };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const state = touch.current;
      touch.current = null;
      if (!state) return;
      const delta = event.changedTouches[0].clientY - state.y;
      if (delta < -48 && state.edgeDown) setPos((value) => Math.min(n - 1, value + 1));
      if (delta > 48 && state.edgeUp) setPos((value) => Math.max(0, value - 1));
    };
    drum.addEventListener("wheel", onWheel, { passive: false });
    drum.addEventListener("touchstart", onTouchStart, { passive: true });
    drum.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      drum.removeEventListener("wheel", onWheel);
      drum.removeEventListener("touchstart", onTouchStart);
      drum.removeEventListener("touchend", onTouchEnd);
    };
  }, [n]);

  return (
    <main
      className="rp-root rp-d2"
      style={{
        ["--tone" as string]: rider.tone,
        ["--p" as string]: (pos + 1) / n,
      }}
    >
      <ProtoTopbar />
      <header className="rp-d2-identity">
        <span className="rp-d2-figure">
          <img
            src={rider.civilianImg}
            {...dossierImage(rider.civilianImg)}
            alt={`${rider.civilian.name}の変身前ビジュアル`}
          />
        </span>
        <h1>{rider.civilian.name}</h1>
        <p># {rider.epithet}</p>
      </header>
      <div
        className="rp-d2-drum"
        ref={drumRef}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "PageDown") go(pos + 1);
          else if (event.key === "ArrowUp" || event.key === "PageUp") go(pos - 1);
          else return;
          event.preventDefault();
        }}
      >
        <div className="rp-d2-axle">
          {cards.map((card, index) => {
            const rel = index - pos;
            return (
              <section
                key={card.id}
                id={`rp-d2-card-${card.id}`}
                className="rp-d2-card"
                role="tabpanel"
                aria-labelledby={`rp-d2-tab-${card.id}`}
                data-rel={Math.abs(rel) > 1 ? "far" : rel}
                inert={Math.abs(rel) > 1}
                style={{ ["--d" as string]: rel }}
                onClick={rel ? () => go(index) : undefined}
              >
                <div className="rp-d2-scroll" tabIndex={rel ? -1 : 0}>
                  {card.body}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <nav className="rp-d2-rim" role="tablist" aria-label={`${rider.civilian.name}の資料`}>
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            role="tab"
            id={`rp-d2-tab-${card.id}`}
            aria-selected={index === pos}
            aria-controls={`rp-d2-card-${card.id}`}
            style={{ ["--d" as string]: index - pos }}
            onClick={() => go(index)}
          >
            <i aria-hidden="true" />
            <span>{card.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
