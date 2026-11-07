import { useEffect, useState, type ComponentProps } from "react";
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
  if (Exhibit) return <Exhibit {...props} />;
  return (
    <div className="fst-gallery fst-royal-selected-visual">
      <figure>{props.children}</figure>
      {failed ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((previous) => previous + 1);
          }}
        >
          部位展示の読み込みを再試行
        </button>
      ) : (
        <p role="status">部位展示を読み込み中…</p>
      )}
    </div>
  );
}
