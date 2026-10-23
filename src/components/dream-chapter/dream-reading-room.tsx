import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import {
  DREAM_READER_DEFAULTS,
  DREAM_READER_STORAGE_KEY,
  validateDreamReaderState,
} from "@/lib/dream-reader-state.js";
import { DREAM_CASES } from "./dream-chapter-data";

type Props = { trigger: HTMLButtonElement | null; onClose: () => void };

function visibleParagraph(scroller: HTMLDivElement | null) {
  if (!scroller) return 1;
  const paragraphs = scroller.querySelectorAll<HTMLElement>("[data-room-paragraph]");
  // Scrolled to the foot of the sheet, the reader has reached the last
  // paragraph even when its first line never crossed the reading line (a
  // short closing paragraph on a tall screen read "2 / 3" at the end).
  const atEnd =
    scroller.scrollTop > 0 &&
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  if (atEnd && paragraphs.length)
    return Number(paragraphs[paragraphs.length - 1].dataset.roomParagraph);
  const line = scroller.getBoundingClientRect().top + Math.min(120, scroller.clientHeight * 0.3);
  let current = 1;
  for (const node of paragraphs) {
    if (node.getBoundingClientRect().top <= line) current = Number(node.dataset.roomParagraph);
  }
  return current;
}

type Pin = { no: number; top: number } | null;
type ReadingAnchor = { text: Text; offset: number; top: number } | { end: true } | null;

// Keep the actual line being read when type size or leading changes. A raw
// scrollTop (or even a paragraph number) loses the reader inside long paragraphs.
function captureReadingAnchor(scroller: HTMLDivElement | null): ReadingAnchor {
  if (!scroller || scroller.scrollTop < 1) return null;
  if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
    return { end: true };
  }
  const top = scroller.getBoundingClientRect().top;
  const line = top + Math.min(80, scroller.clientHeight * 0.2);
  const paragraph = [...scroller.querySelectorAll<HTMLElement>("[data-room-paragraph]")].find(
    (node) => node.getBoundingClientRect().bottom > line,
  );
  const text =
    paragraph &&
    [...paragraph.childNodes].find(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
    );
  if (!text) return null;
  const range = document.createRange();
  let low = 0;
  let high = text.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    range.setStart(text, middle);
    range.setEnd(text, middle + 1);
    if (range.getBoundingClientRect().bottom <= line) low = middle + 1;
    else high = middle;
  }
  range.setStart(text, low);
  range.setEnd(text, low + 1);
  return { text, offset: low, top: range.getBoundingClientRect().top - top };
}

function restoreReadingAnchor(scroller: HTMLDivElement, anchor: ReadingAnchor) {
  if (!anchor) return;
  if ("end" in anchor) scroller.scrollTop = scroller.scrollHeight;
  else {
    if (!anchor.text.isConnected) return;
    const range = document.createRange();
    range.setStart(anchor.text, anchor.offset);
    range.setEnd(anchor.text, anchor.offset + 1);
    scroller.scrollTop +=
      range.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.top;
  }
}

// ResizeObserver runs after reflow, when reading the old line is already too
// late. Remember it after ordinary scrolling, and restore that text offset
// before refreshing the paragraph count for the new viewport dimensions.
function watchReadingViewport(
  scroller: HTMLDivElement,
  pin: { current: Pin },
  onParagraph: (no: number) => void,
) {
  let frame = 0;
  let disposed = false;
  let width = scroller.clientWidth;
  let height = scroller.clientHeight;
  let anchor = captureReadingAnchor(scroller);
  const remember = () => {
    width = scroller.clientWidth;
    height = scroller.clientHeight;
    anchor = captureReadingAnchor(scroller);
  };
  const sync = () => {
    frame = 0;
    if (disposed) return;
    if (width !== scroller.clientWidth || height !== scroller.clientHeight) {
      restoreReadingAnchor(scroller, anchor);
      if (pin.current) pin.current.top = scroller.scrollTop;
    }
    onParagraph(readParagraph(scroller, pin));
    remember();
  };
  const queue = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(sync);
  };
  scroller.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue, { passive: true });
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queue);
  observer?.observe(scroller);
  queue();
  return {
    remember,
    dispose() {
      disposed = true;
      scroller.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

/** An explicit landing (a paragraph pill, the saved bookmark) holds until the
    reader scrolls on: a sheet clamped at its foot could not bring the chosen
    paragraph up to the reading line, and the count fell back a paragraph. */
function readParagraph(scroller: HTMLDivElement | null, pin: { current: Pin }) {
  if (scroller && pin.current && Math.abs(scroller.scrollTop - pin.current.top) < 2) {
    return pin.current.no;
  }
  pin.current = null;
  return visibleParagraph(scroller);
}

export function DreamReadingRoom({ trigger, onClose }: Props) {
  const router = useRouter();
  const [initial] = useState(() => {
    try {
      return validateDreamReaderState(
        JSON.parse(localStorage.getItem(DREAM_READER_STORAGE_KEY) || "null"),
        DREAM_CASES,
      );
    } catch {
      return { ...DREAM_READER_DEFAULTS };
    }
  });
  const [chapter, setChapter] = useState(initial.bookmark?.caseNo ?? "0");
  const [paragraph, setParagraph] = useState(initial.bookmark?.paragraph ?? 1);
  const [size, setSize] = useState(initial.size);
  const [spacing, setSpacing] = useState(initial.spacing);
  const [paper, setPaper] = useState(false);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const firstLanding = useRef(initial.bookmark?.paragraph ?? 1);
  const pinned = useRef<Pin>(null);
  const readingAnchor = useRef<ReadingAnchor>(null);
  const readingViewport = useRef<ReturnType<typeof watchReadingViewport> | null>(null);
  const closing = useRef(false);
  onCloseRef.current = onClose;
  const episode = DREAM_CASES.find((item) => item.no === chapter) ?? DREAM_CASES[0];
  const index = DREAM_CASES.indexOf(episode);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onCloseRef.current();
  }, []);

  useLayoutEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const html = document.documentElement;
    const previousFlag = html.dataset.dreamDialogOpen;
    const releaseScroll = acquireViewportScrollLock({ freezeBody: true });
    html.dataset.dreamDialogOpen = "true";
    modal.showModal();
    closeButton.current?.focus({ preventScroll: true });
    let released = false;
    let historyDismissed = false;
    const release = () => {
      if (released) return;
      released = true;
      if (modal.open) modal.close();
      releaseScroll();
      if (previousFlag === undefined) delete html.dataset.dreamDialogOpen;
      else html.dataset.dreamDialogOpen = previousFlag;
    };
    const stopHistory = router.history.subscribe(({ action }) => {
      if (!["BACK", "FORWARD", "GO"].includes(action.type)) return;
      historyDismissed = true;
      release();
      close();
    });
    return () => {
      stopHistory();
      release();
      if (!historyDismissed && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [close, router, trigger]);

  useLayoutEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    const landing = firstLanding.current;
    firstLanding.current = 1;
    const target = scroller.querySelector<HTMLElement>(`[data-room-paragraph="${landing}"]`);
    if (landing > 1 && target) {
      scroller.scrollTop +=
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
    } else scroller.scrollTop = 0;
    pinned.current = landing > 1 && target ? { no: landing, top: scroller.scrollTop } : null;
    setParagraph(landing);
  }, [chapter]);

  useLayoutEffect(() => {
    const scroller = viewport.current;
    const anchor = readingAnchor.current;
    readingAnchor.current = null;
    if (!scroller || !anchor) return;
    restoreReadingAnchor(scroller, anchor);
    if (pinned.current) pinned.current.top = scroller.scrollTop;
  }, [size, spacing]);

  useEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    const controller = watchReadingViewport(scroller, pinned, setParagraph);
    readingViewport.current = controller;
    return () => {
      controller.dispose();
      if (readingViewport.current === controller) readingViewport.current = null;
    };
  }, [chapter, size, spacing]);

  const select = (no: string) => {
    setStatus("");
    setChapter(no);
  };
  const jumpToParagraph = (targetNo: number) => {
    const scroller = viewport.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-room-paragraph="${targetNo}"]`);
    if (scroller && target) {
      scroller.scrollTop +=
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
      pinned.current = { no: targetNo, top: scroller.scrollTop };
      readingViewport.current?.remember();
    }
    setParagraph(targetNo);
  };
  const save = () => {
    const paragraph = readParagraph(viewport.current, pinned);
    setParagraph(paragraph);
    try {
      localStorage.setItem(
        DREAM_READER_STORAGE_KEY,
        JSON.stringify({ version: 1, size, spacing, bookmark: { caseNo: chapter, paragraph } }),
      );
      window.dispatchEvent(new Event("dream-reader-state-change"));
      setStatus(`CASE ${chapter}・${paragraph}段落目にしおりを保存しました。`);
    } catch {
      setStatus("このブラウザーでは保存できません。読書室はこのまま利用できます。");
    }
  };
  const totalChars = episode.paragraphs.join("").length;

  return (
    <dialog
      ref={dialog}
      className="dream-reading-room"
      data-paper={paper}
      data-size={size}
      data-spacing={spacing}
      aria-label="ドリームチャプター 読書室"
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.ctrlKey || event.metaKey) return;
        const stops = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]',
          ),
        ].filter(
          (node) =>
            node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden",
        );
        if (!stops.length) return;
        // WebKit's system keyboard preference can skip buttons after the
        // focusable reading pane. Keep the complete visible control order.
        const current = stops.indexOf(document.activeElement as HTMLElement);
        const next =
          current < 0 ? 0 : (current + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
        event.preventDefault();
        stops[next].focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dream-reading-shell">
        <header className="dream-reading-topbar">
          <div>
            <small lang="en">DREAM CHAPTER</small>
            <h2>読書室</h2>
          </div>
          <button ref={closeButton} type="button" onClick={close} aria-label="読書室を閉じる">
            閉じる ×
          </button>
        </header>
        <div className="dream-reading-workspace">
          <aside className="dream-reading-sidebar" aria-label="読書室の章と設定">
            <p className="dream-reading-kicker">六章のあらすじ</p>
            <label className="dream-reading-chapter-select">
              章を選ぶ
              <select value={chapter} onChange={(event) => select(event.target.value)}>
                {DREAM_CASES.map((item) => (
                  <option key={item.no} value={item.no}>
                    CASE {item.no}「{item.title}」
                  </option>
                ))}
              </select>
            </label>
            <nav className="dream-reading-chapters" aria-label="読書室の六章">
              {DREAM_CASES.map((item) => (
                <button
                  key={item.no}
                  type="button"
                  aria-current={chapter === item.no ? "step" : undefined}
                  onClick={() => select(item.no)}
                >
                  <span>0{item.no}</span>
                  {item.title}
                  <small>{item.reading}</small>
                </button>
              ))}
            </nav>
            <div className="dream-reading-paragraph-jump" role="group" aria-label="段落へ移動">
              <small className="dream-reading-kicker">段落へ移動</small>
              <div className="dream-reading-paragraph-pills">
                {episode.paragraphs.map((_, i) => {
                  const no = i + 1;
                  return (
                    <button
                      key={no}
                      type="button"
                      aria-current={paragraph === no ? "location" : undefined}
                      aria-label={`${no}段落目へ移動`}
                      onClick={() => jumpToParagraph(no)}
                    >
                      {String(no).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
            <details className="dream-reading-options">
              <summary>表示を整える</summary>
              <div>
                <button
                  type="button"
                  aria-pressed={paper}
                  onClick={() => setPaper((value) => !value)}
                >
                  {paper ? "紙色" : "夜色"}
                </button>
                <button
                  type="button"
                  aria-pressed={size === "large"}
                  onClick={() => {
                    readingAnchor.current = captureReadingAnchor(viewport.current);
                    setSize(size === "large" ? "standard" : "large");
                  }}
                >
                  文字を大きく
                </button>
                <button
                  type="button"
                  aria-pressed={spacing === "comfortable"}
                  onClick={() => {
                    readingAnchor.current = captureReadingAnchor(viewport.current);
                    setSpacing(spacing === "comfortable" ? "standard" : "comfortable");
                  }}
                >
                  行間を広く
                </button>
              </div>
            </details>
            <p className="dream-reading-disclaimer">
              展開・ネタバレを含みます。CASE 5は公開中の範囲までを収録。
            </p>
          </aside>
          <div
            ref={viewport}
            className="dream-reading-scroll"
            tabIndex={0}
            aria-label={`CASE ${chapter}「${episode.title}」の本文`}
          >
            <article className="dream-reading-paper" key={chapter}>
              <header>
                <p lang="en">
                  CASE 0{chapter} / {episode.reading}
                </p>
                <small className="dream-reading-char-count">
                  全{episode.paragraphs.length}段落 · {totalChars}字
                </small>
                <h3>{episode.title}</h3>
                <span>{episode.lead}</span>
              </header>
              {episode.paragraphs.map((text, i) => (
                <p key={text} data-room-paragraph={i + 1}>
                  <span className="dream-reading-paragraph-number" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {text}
                </p>
              ))}
              <footer>
                <span aria-hidden="true">◇</span>
                <p>
                  {index === DREAM_CASES.length - 1
                    ? "公開されているあらすじはここまでです。"
                    : "次の章へ、物語を辿る。"}
                </p>
                <div>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => select(DREAM_CASES[index - 1].no)}
                  >
                    ← 前の章
                  </button>
                  <button
                    type="button"
                    disabled={index === DREAM_CASES.length - 1}
                    onClick={() => select(DREAM_CASES[index + 1].no)}
                  >
                    次の章 →
                  </button>
                </div>
              </footer>
            </article>
          </div>
        </div>
        <footer className="dream-reading-bottom">
          <div>
            <span className="dream-reading-position-text">
              CASE {chapter} · {paragraph} / {episode.paragraphs.length} 段落
            </span>
            <label className="dream-reading-position-select">
              <span>CASE {chapter}</span>
              <select
                aria-label="今読んでいる段落・段落へ移動"
                value={paragraph}
                onChange={(event) => jumpToParagraph(Number(event.target.value))}
              >
                {episode.paragraphs.map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} / {episode.paragraphs.length} 段落
                  </option>
                ))}
              </select>
            </label>
            <progress
              max={episode.paragraphs.length}
              value={paragraph}
              aria-label="今読んでいる段落"
            />
          </div>
          <button type="button" onClick={save}>
            しおりを保存
          </button>
          <p role="status">
            {status || "保存したしおりは、通常表示の「続きから読む」にも反映されます。"}
          </p>
        </footer>
      </div>
    </dialog>
  );
}
