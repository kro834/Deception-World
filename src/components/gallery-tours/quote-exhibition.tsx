import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { QuoteAmbience } from "./quote-ambience";
import type { QuoteSceneId } from "./tour-route-search";
import { QUOTE_SCENES } from "./quote-exhibition-data";

const route = getRouteApi("/gallery-tours");

// This is a one-use return ticket for this tab's exact history entry. The
// quote above the source link is a steadier landmark than the page scrollY
// when the course catalogue or the viewport changes while reading a source.
let returnToLine: { entry: string; id: QuoteSceneId; top: number; keyboard: boolean } | undefined;


export function QuoteExhibition() {
  const { quote } = route.useSearch();
  const navigate = route.useNavigate();
  const activeLine = useRef<HTMLButtonElement>(null);
  const anchor = useRef<{ button: HTMLButtonElement; top: number; next?: QuoteSceneId } | null>(
    null,
  );

  // Opening a lower quote can close a tall portrait above it. Keep the line
  // the reader actually pressed in place, including on a narrow iPad pane.
  useLayoutEffect(() => {
    const previous = anchor.current;
    if (!previous || previous.next !== quote) return;
    anchor.current = null;
    const delta = previous.button.getBoundingClientRect().top - previous.top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
  }, [quote]);

  useLayoutEffect(() => {
    const ticket = returnToLine;
    const button = activeLine.current;
    if (!button || !ticket || ticket.id !== quote || ticket.entry !== history.state?.__TSR_key)
      return;
    // The router restores its document offset after rendering the route.
    // Resolve the line against that layout on the following paint.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const top = Math.min(innerHeight - 44, Math.max(-button.offsetHeight, ticket.top));
        window.scrollBy({ top: button.getBoundingClientRect().top - top, behavior: "instant" });
        if (ticket.keyboard) {
          button
            .closest("article")
            ?.querySelector<HTMLAnchorElement>(".quote-source")
            ?.focus({ preventScroll: true });
        }
        returnToLine = undefined;
      });
    });
    const stop = () => {
      cancelAnimationFrame(frame);
      returnToLine = undefined;
    };
    const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const type of inputs)
      window.addEventListener(type, stop, { once: true, capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      for (const type of inputs) window.removeEventListener(type, stop, true);
    };
  }, [quote]);

  function choose(id: QuoteSceneId, button: HTMLButtonElement) {
    const next = quote === id ? undefined : id;
    anchor.current = { button, top: button.getBoundingClientRect().top, next };
    void navigate({
      search: next ? { quote: next } : {},
      replace: true,
      resetScroll: false,
      hash: true,
      hashScrollIntoView: false,
    });
  }

  return (
    <section
      id="quote-exhibition"
      className="quote-exhibition"
      aria-labelledby="quote-exhibition-title"
    >
      <h2 id="quote-exhibition-title">台詞から見る</h2>
      {QUOTE_SCENES.map((scene) => {
        const open = quote === scene.id;
        const panel = `quote-scene-${scene.id}`;
        return (
          <article
            key={scene.id}
            className="quote-scene"
            data-open={open}
            style={{ "--quote-ink": scene.color } as CSSProperties}
          >
            <h3>
              <button
                type="button"
                ref={open ? activeLine : undefined}
                onClick={(event) => choose(scene.id, event.currentTarget)}
                aria-expanded={open}
                aria-controls={panel}
              >
                <span className="quote-line">「{scene.line}」</span>
                <span className="quote-fold" aria-hidden="true">
                  {open ? "−" : "＋"}
                </span>
              </button>
            </h3>
            <div id={panel} className="quote-leaf" hidden={!open}>
              {open && (
                <>
                  <figure>
                    <img
                      src={scene.image}
                      alt={`${scene.by}の人物原画`}
                      width={scene.width}
                      height={scene.height}
                      decoding="async"
                    />
                  </figure>
                  <div className="quote-leaf-copy">
                    <h4>{scene.by}</h4>
                    <p>{scene.caption}</p>
                    <Link
                      to={scene.to}
                      hash={scene.hash}
                      className="quote-source"
                      onClick={(event) => {
                        if (
                          event.button ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.altKey ||
                          event.shiftKey
                        )
                          return;
                        const entry = history.state?.__TSR_key;
                        if (typeof entry === "string" && activeLine.current) {
                          returnToLine = {
                            entry,
                            id: scene.id,
                            top: activeLine.current.getBoundingClientRect().top,
                            keyboard: event.detail === 0,
                          };
                        }
                      }}
                    >
                      {scene.source}を読む <span aria-hidden="true">↗</span>
                    </Link>
                    <QuoteAmbience />
                  </div>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
