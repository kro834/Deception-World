import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import {
  DREAM_READER_DEFAULTS,
  DREAM_READER_STORAGE_KEY,
  validateDreamReaderState,
} from "@/lib/dream-reader-state.js";
import { DREAM_CASES, DREAM_CHARACTERS } from "./dream-chapter-data";

export type DreamPersonTarget = { id: string; paragraphId: string; start?: number; end?: number };
type Props = {
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  personTarget?: DreamPersonTarget | null;
};

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
type ReadingOrigin = { top: number; width: number; height: number; pathname: string } | null;

// Releasing the body lock restores its old scrollY. If the page reflowed
// behind the room, return its opener to the saved screen position instead.
function restoreReadingOrigin(trigger: HTMLButtonElement | null, origin: ReadingOrigin) {
  if (!trigger?.isConnected || !origin || window.location.pathname !== origin.pathname) return;
  if (window.innerWidth === origin.width && window.innerHeight === origin.height) return;
  const rect = trigger.getBoundingClientRect();
  const top = Math.max(16, Math.min(origin.top, window.innerHeight - rect.height - 16));
  const delta = rect.top - top;
  if (Math.abs(delta) > 1) {
    window.scrollTo({
      top: Math.max(0, window.scrollY + delta),
      left: window.scrollX,
      behavior: "instant",
    });
  }
}

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
  const range = document.createRange();
  // A linked name splits the paragraph into several text nodes. Keep the
  // node on the reading line rather than pinning the opening sentence.
  const candidates = paragraph
    ? [...paragraph.childNodes]
        .flatMap((node) =>
          node.nodeType === Node.TEXT_NODE
            ? [node]
            : (node as Element).matches?.("button.dream-scene-word")
              ? [...node.childNodes]
              : [],
        )
        .filter(
          (node): node is Text =>
            node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
        )
    : [];
  const text =
    candidates.find((node) => {
      range.setStart(node, node.length - 1);
      range.setEnd(node, node.length);
      return range.getBoundingClientRect().bottom > line;
    }) ?? candidates.at(-1);
  if (!text) return null;
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
  let resizingAnchor: ReadingAnchor = null;
  let settling = 0;
  const remember = () => {
    settling = 0;
    resizingAnchor = null;
    width = scroller.clientWidth;
    height = scroller.clientHeight;
    anchor = captureReadingAnchor(scroller);
  };
  const sync = () => {
    frame = 0;
    if (disposed) return;
    if (width !== scroller.clientWidth || height !== scroller.clientHeight) {
      if (!settling) resizingAnchor = anchor;
      settling = 3;
      width = scroller.clientWidth;
      height = scroller.clientHeight;
    }
    if (settling) {
      // WebKit can finish wrapping the paper after its scrollport has
      // reached the new size. Keep the old glyph through those layouts;
      // capturing the intermediate line would silently replace it.
      restoreReadingAnchor(scroller, resizingAnchor);
      if (pin.current) pin.current.top = scroller.scrollTop;
      settling -= 1;
    }
    onParagraph(readParagraph(scroller, pin));
    if (settling) queue();
    else remember();
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

export function DreamReadingRoom({ trigger, onClose, personTarget }: Props) {
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
  const [referenceOpen, setReferenceOpen] = useState(false);
  const referenceTrigger = useRef<HTMLButtonElement>(null);
  const referenceClose = useRef<HTMLButtonElement>(null);
  const referenceOrigin = useRef(0);
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
  const ciel = DREAM_CHARACTERS.find((character) => character.id === "ciel")!;
  const cielIntroduction = ciel.sections.find((section) => section.title === "概要")!
    .paragraphs![0];
  const closeReference = () => {
    setReferenceOpen(false);
    requestAnimationFrame(() => {
      const scroller = viewport.current;
      const target = referenceTrigger.current;
      if (!scroller || !target) return;
      target.focus({ preventScroll: true });
      scroller.scrollTop += target.getBoundingClientRect().top - referenceOrigin.current;
      readingViewport.current?.remember();
    });
  };
  useLayoutEffect(() => {
    if (referenceOpen) referenceClose.current?.focus({ preventScroll: true });
  }, [referenceOpen]);

  useEffect(() => {
    if (
      personTarget?.id !== "ciel" ||
      personTarget.paragraphId !== "dream-person-ciel-section-2-paragraph-1"
    )
      return;
    firstLanding.current = 1;
    setChapter("0");
    setReferenceOpen(true);
  }, [personTarget]);

  // Wait for the chapter and its material to commit before looking up the
  // destination. A frame queued with setReferenceOpen can run before React
  // has mounted that paragraph, especially during a fresh modal entry.
  useLayoutEffect(() => {
    if (!personTarget || chapter !== "0" || !referenceOpen) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const paragraph = dialog.current?.querySelector<HTMLElement>("#dream-room-ciel-overview-1");
        const scroller = viewport.current;
        if (!paragraph || !scroller) return;
        scroller.scrollTop +=
          paragraph.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
        paragraph.focus({ preventScroll: true });
        readingViewport.current?.remember();
        referenceOrigin.current = scroller.getBoundingClientRect().top + 24;
        const text = paragraph.firstChild;
        const { start, end } = personTarget;
        if (
          text?.nodeType === Node.TEXT_NODE &&
          start !== undefined &&
          end !== undefined &&
          start >= 0 &&
          end > start &&
          end <= (text.textContent?.length ?? 0)
        ) {
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, end);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [personTarget, chapter, referenceOpen]);
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
    const origin: ReadingOrigin = trigger?.isConnected
      ? {
          top: trigger.getBoundingClientRect().top,
          width: window.innerWidth,
          height: window.innerHeight,
          pathname: window.location.pathname,
        }
      : null;
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
      if (closing.current && !historyDismissed) restoreReadingOrigin(trigger, origin);
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
      if (window.location.pathname === origin?.pathname) {
        if (!historyDismissed && trigger?.isConnected) trigger.focus({ preventScroll: true });
      }
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
    setReferenceOpen(false);
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
                <p lang="en">CASE 0{chapter}</p>
                <h3>{episode.title}</h3>
                <span>{episode.lead}</span>
              </header>
              {episode.paragraphs.map((text, i) => (
                <Fragment key={text}>
                  <p key={text} data-room-paragraph={i + 1}>
                    <span className="dream-reading-paragraph-number" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {chapter === "0" && i === 0 ? (
                      <>
                        {text.slice(0, text.indexOf("シエル"))}
                        <button
                          ref={referenceTrigger}
                          className="dream-scene-word"
                          type="button"
                          aria-expanded={referenceOpen}
                          aria-controls="dream-scene-ciel"
                          aria-label={
                            referenceOpen ? "シエルの人物原画を閉じる" : "シエルの人物原画を開く"
                          }
                          onClick={() => {
                            if (referenceOpen) closeReference();
                            else {
                              referenceOrigin.current =
                                referenceTrigger.current?.getBoundingClientRect().top ?? 0;
                              setReferenceOpen(true);
                            }
                          }}
                        >
                          シエル
                        </button>
                        {text.slice(text.indexOf("シエル") + "シエル".length)}
                      </>
                    ) : (
                      text
                    )}
                  </p>
                  {chapter === "0" && i === 0 && referenceOpen ? (
                    <aside
                      id="dream-scene-ciel"
                      className="dream-scene-reference"
                      aria-label="シエルの人物原画"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          closeReference();
                        }
                      }}
                    >
                      <figure>
                        <img src={ciel.portrait} alt={ciel.portraitAlt} width="768" height="1024" />
                        <figcaption>{ciel.name} · 人物原画</figcaption>
                      </figure>
                      <h4>シエル · 概要</h4>
                      <p
                        id="dream-room-ciel-overview-1"
                        tabIndex={-1}
                        data-dream-reading-paragraph
                        data-source-kind="person"
                        data-dream-source-kind="person"
                        data-source-id="ciel"
                        data-dream-source-id="ciel"
                        data-paragraph-id="dream-person-ciel-section-2-paragraph-1"
                      >
                        {cielIntroduction}
                      </p>
                      <button ref={referenceClose} type="button" onClick={closeReference}>
                        原画を閉じて本文に戻る
                      </button>
                    </aside>
                  ) : null}
                </Fragment>
              ))}
              <footer>
                <span aria-hidden="true">◇</span>
                {index === DREAM_CASES.length - 1 ? (
                  <p>公開されているあらすじはここまでです。</p>
                ) : null}
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
          <p role="status">{status}</p>
        </footer>
      </div>
    </dialog>
  );
}
