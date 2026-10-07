import { useRef } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { getInquiryGuide, getInquiryStop } from "@/lib/inquiry-guides";

/** Only explicit guide links activate this; ordinary reading remains unchanged. */
export function InquiryNavigation() {
  const location = useRouterState({ select: (state) => state.location });
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const guide = getInquiryGuide((location.search as Record<string, unknown>).guide);
  const stop = getInquiryStop(guide, location.pathname);
  if (!guide || !stop) return null;
  const index = guide.stops.indexOf(stop);
  const previous = guide.stops[index - 1];
  const next = guide.stops[index + 1];

  return (
    <details
      className="inquiry-navigation"
      key={`${guide.id}:${stop.id}`}
      ref={detailsRef}
      // Native disclosure can be opened before hydration or restored by Back.
      suppressHydrationWarning
      data-tone={guide.color}
      onKeyDown={(event) => {
        if (event.key === "Escape" && detailsRef.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          detailsRef.current.open = false;
          detailsRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        <span aria-hidden="true">◇</span>
        <span>探索案内</span>
        <small>
          {index + 1} / {guide.stops.length}
        </small>
      </summary>
      <div className="inquiry-navigation-panel">
        <p className="inquiry-navigation-label">問いから辿る · {index + 1}番目の資料</p>
        <h2>{guide.question}</h2>
        <p>{stop.lookFor}</p>
        <nav aria-label="探索する資料を移動">
          {previous ? (
            <Link to={previous.to} search={{ guide: guide.id }} hash={previous.hash}>
              <span>前の資料</span>
              <strong>{previous.sourceLabel}</strong>
            </Link>
          ) : null}
          {next ? (
            <Link to={next.to} search={{ guide: guide.id }} hash={next.hash}>
              <span>次の資料</span>
              <strong>{next.sourceLabel}</strong>
            </Link>
          ) : null}
          <Link
            to="/library"
            search={{ guide: guide.id }}
            hash="inquiry"
            className="inquiry-navigation-return"
          >
            問いの案内へ戻る <span aria-hidden="true">↗</span>
          </Link>
        </nav>
        <p className="inquiry-navigation-note">数字は案内の順番です。読了の記録ではありません。</p>
        <button
          type="button"
          onClick={() => {
            void router.navigate({
              to: location.pathname,
              search: (current: Record<string, unknown>) => ({ ...current, guide: undefined }),
              hash: location.hash,
              replace: true,
              resetScroll: false,
            });
          }}
        >
          探索案内を終了
        </button>
      </div>
    </details>
  );
}
