import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { guardTapThrough } from "@/lib/tap-through-guard";
import { restoreArchivePosition } from "@/lib/restore-archive-position";
import { useDialogHistoryDismiss } from "./use-dialog-history-dismiss";
import { RE_DIVE_CLASSIFIED_REPORT } from "./re-dive-classified-report";
import { DOG_DOSSIER_COLUMN } from "./world-dog-dossier-data";
import { DogDossierProse } from "./dog-dossier-prose";

const paragraphs = RE_DIVE_CLASSIFIED_REPORT.text.split("\n\n");

/** A fictional classified record, not a real access-control boundary. */
export function ReDiveFileDialog({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const dismissedRef = useRef(false);
  const viewportRef = useRef({ width: 0, height: 0 });

  const dismiss = useCallback(
    (restoreFocus = true) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      dialogRef.current?.close();
      releaseRef.current?.();
      releaseRef.current = null;
      const opener = returnFocusRef.current;
      if (restoreFocus && opener?.isConnected) {
        // Rotation changes the archive's position; an old absolute Y would land elsewhere.
        if (
          viewportRef.current.width !== window.innerWidth ||
          viewportRef.current.height !== window.innerHeight
        ) {
          const archive = opener.closest<HTMLElement>(".re-dive-section");
          if (archive) restoreArchivePosition(archive);
        }
        opener.focus({ preventScroll: true });
      }
      onClose();
    },
    [onClose, returnFocusRef],
  );
  const dismissForNavigation = useCallback(() => dismiss(false), [dismiss]);

  useDialogHistoryDismiss(dialogRef, dismissForNavigation);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dismissedRef.current = false;
    viewportRef.current = { width: window.innerWidth, height: window.innerHeight };
    dialog.showModal();
    releaseRef.current = acquireViewportScrollLock({ freezeBody: true });
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dismissedRef.current = true;
      dialog.close();
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", dismissForNavigation);
    return () => window.removeEventListener("pagehide", dismissForNavigation);
  }, [dismissForNavigation]);

  return (
    <dialog
      ref={dialogRef}
      className="rd-file-dialog"
      id="re-dive-file-dialog"
      aria-labelledby="rd-file-title"
      aria-describedby="rd-file-caption"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (!dialogRef.current?.open) dismiss();
      }}
      onKeyDown={(event) => {
        if (
          event.repeat &&
          event.target instanceof HTMLButtonElement &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
        }
        if (event.key !== "Tab") return;
        if (event.shiftKey && event.target === closeRef.current) {
          event.preventDefault();
          returnRef.current?.focus();
        } else if (!event.shiftKey && event.target === returnRef.current) {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <header className="rd-file-header">
        <div>
          <p className="rd-file-label">CLASSIFIED FILE</p>
          <h2 id="rd-file-title">機密ファイル</h2>
          <p id="rd-file-caption">{RE_DIVE_CLASSIFIED_REPORT.title}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="rd-file-close"
          onClick={(event) => {
            if (event.detail > 0) guardTapThrough();
            dismiss();
          }}
        >
          閉じる
        </button>
      </header>
      <article className="rd-file-reader" aria-label={RE_DIVE_CLASSIFIED_REPORT.title} tabIndex={0}>
        {paragraphs.map((paragraph, index) =>
          index === 1 ? (
            <h3 key={index} data-report-paragraph="">
              {paragraph}
            </h3>
          ) : (
            <p key={index} data-report-paragraph="">
              {paragraph}
            </p>
          ),
        )}
        <section className="rd-file-appendix" aria-labelledby="rd-file-appendix-title">
          <p className="rd-file-label">別添資料</p>
          <h3 id="rd-file-appendix-title">{DOG_DOSSIER_COLUMN.title}</h3>
          <p>{DOG_DOSSIER_COLUMN.body}</p>
          <button
            type="button"
            className="rd-file-close"
            aria-expanded={dossierOpen}
            aria-controls="rd-file-dog-dossier"
            onClick={() => setDossierOpen((open) => !open)}
          >
            {dossierOpen ? "資料を閉じる" : "ネタバレを開く"}
          </button>
          <div id="rd-file-dog-dossier">
            {dossierOpen ? <DogDossierProse /> : null}
          </div>
        </section>
      </article>
      <footer className="rd-file-footer">
        <span>{RE_DIVE_CLASSIFIED_REPORT.edition}</span>
        <button
          ref={returnRef}
          type="button"
          className="rd-file-close"
          onClick={(event) => {
            if (event.detail > 0) guardTapThrough();
            dismiss();
          }}
        >
          ファイル一覧へ戻る
        </button>
      </footer>
    </dialog>
  );
}
