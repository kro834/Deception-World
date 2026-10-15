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
  const line = scroller.getBoundingClientRect().top + Math.min(120, scroller.clientHeight * 0.3);
  let current = 1;
  for (const node of scroller.querySelectorAll<HTMLElement>("[data-room-paragraph]")) {
    if (node.getBoundingClientRect().top <= line) current = Number(node.dataset.roomParagraph);
  }
  return current;
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
    setParagraph(landing);
  }, [chapter]);

  useEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      setParagraph(visibleParagraph(scroller));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    scroller.addEventListener("scroll", queue, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queue);
    observer?.observe(scroller);
    queue();
    return () => {
      scroller.removeEventListener("scroll", queue);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chapter, size, spacing]);

  const select = (no: string) => {
    setStatus("");
    setChapter(no);
  };
  const save = () => {
    const paragraph = visibleParagraph(viewport.current);
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
                  onClick={() => setSize(size === "large" ? "standard" : "large")}
                >
                  文字を大きく
                </button>
                <button
                  type="button"
                  aria-pressed={spacing === "comfortable"}
                  onClick={() => setSpacing(spacing === "comfortable" ? "standard" : "comfortable")}
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
            <span>
              CASE {chapter} · {paragraph} / {episode.paragraphs.length} 段落
            </span>
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
