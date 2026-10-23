import { forwardRef, memo, useCallback, useRef, useState } from "react";
import { RISING_CALM_CHAR, RISING_CALM_EDGES } from "./rising-art";
import { RE_DIVE_CLASSIFIED_REPORT } from "./re-dive-classified-report";
import { ReDiveFileDialog } from "./re-dive-file-dialog";

/* Reached only after RISING THE WORLD / RE DIVE. The ordinary character
   pages remain elsewhere; this archive contains the owner's distinct report. */
export const RE_DIVE_SECTION_ID = "re-dive";

type ReDiveSectionProps = {
  /** Preserve this archive as the return point when opening its record. */
  onLeave: () => void;
};

export const ReDiveSection = memo(
  forwardRef<HTMLElement, ReDiveSectionProps>(function ReDiveSection({ onLeave }, ref) {
    const [fileOpen, setFileOpen] = useState(false);
    const coverRef = useRef<HTMLButtonElement>(null);
    const closeFile = useCallback(() => setFileOpen(false), []);

    return (
      <section
        ref={ref}
        id={RE_DIVE_SECTION_ID}
        className="re-dive-section"
        aria-labelledby="re-dive-title"
        tabIndex={-1}
      >
        <div className="re-dive-ground" aria-hidden="true">
          <span className="re-dive-char" style={{ backgroundImage: `url(${RISING_CALM_CHAR})` }} />
          <span
            className="re-dive-edge"
            style={{ backgroundImage: `url(${RISING_CALM_EDGES[0]})` }}
          />
          <span className="re-dive-embers" />
        </div>
        <div className="threat-panel re-dive-archive">
          <div className="threat-copy">
            <h3 id="re-dive-title">機密ファイル</h3>
          </div>
          <p className="re-dive-tab">
            <b>未提出原稿</b>
          </p>
          <div className="manager-slot-grid signal-array re-dive-file-grid">
            <button
              ref={coverRef}
              type="button"
              className="re-dive-file-cover"
              aria-haspopup="dialog"
              aria-controls="re-dive-file-dialog"
              aria-label={RE_DIVE_CLASSIFIED_REPORT.title + "の機密ファイルを開く"}
              onClick={() => {
                onLeave();
                setFileOpen(true);
              }}
            >
              <span className="rd-file-mark" aria-hidden="true">
                <span>CLASSIFIED</span>
                <i />
              </span>
              <span className="rd-file-cover-copy">
                <small>{RE_DIVE_CLASSIFIED_REPORT.edition}</small>
                <strong>{RE_DIVE_CLASSIFIED_REPORT.title}</strong>
                <span>記録者：{RE_DIVE_CLASSIFIED_REPORT.author}</span>
              </span>
              <span className="rd-file-cover-action">
                ファイルを開く <span aria-hidden="true">↗</span>
              </span>
            </button>
          </div>
        </div>
        {fileOpen ? <ReDiveFileDialog onClose={closeFile} returnFocusRef={coverRef} /> : null}
      </section>
    );
  }),
);
