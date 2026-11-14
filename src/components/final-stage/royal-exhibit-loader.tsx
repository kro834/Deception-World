import { Suspense, useEffect, useState, type ComponentProps } from "react";
import { importWithRetry } from "@/lib/chunk-retry.js";

type Exhibit = typeof import("./royal-exhibit").default;
let loaded: Exhibit | undefined;

/** The source plate and the rest of the dossier remain readable if the
 * optional inspection tools don't arrive. A retry leaves the dialog open. */
export function RoyalExhibitLoader(props: ComponentProps<Exhibit>) {
  const [Exhibit, setExhibit] = useState<Exhibit | undefined>(() => loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (Exhibit) return;
    let active = true;
    void importWithRetry(() => import("./royal-exhibit"), { isCancelled: () => !active }).then(
      (module) => {
        loaded = module.default;
        if (active) setExhibit(() => module.default);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [Exhibit, attempt]);
  const plate = (
    <div className="fst-gallery fst-royal-selected-visual fst-royal-exhibit-pedestal">
      <div className="fst-royal-exhibit-pedestal-stage">
        <figure>{props.children}</figure>
      </div>
      <div className="fst-royal-exhibit-pedestal-foot">
        <svg
          className="fst-royal-exhibit-pedestal-crest"
          viewBox="-20 -20 40 40"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="none"
            stroke="currentColor"
            strokeOpacity=".55"
            strokeWidth="1"
            d="M0 -15 L2 -5 L10.6 -10.6 L5 -2 L15 0 L5 2 L10.6 10.6 L2 5 L0 15 L-2 5 L-10.6 10.6 L-5 2 L-15 0 L-5 -2 L-10.6 -10.6 L-2 -5Z"
          />
          <path
            fill="rgba(255, 243, 210, 0.14)"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
            d="M-9 5.5 L-11.4 -3.2 L-5.2 0.3 L0 -8 L5.2 0.3 L11.4 -3.2 L9 5.5Z M-7.8 8.2 H7.8"
          />
        </svg>
        {failed ? (
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((previous) => previous + 1);
            }}
          >
            装甲部位展示の読み込みを再試行
          </button>
        ) : (
          <p role="status">装甲部位展示を読み込み中…</p>
        )}
      </div>
    </div>
  );
  // The first stylesheet request can suspend a commit. Keep the page and
  // native dialog laid out while only this optional exhibit is loading.
  return Exhibit ? (
    <Suspense fallback={plate}>
      <Exhibit {...props} />
    </Suspense>
  ) : plate;
}
