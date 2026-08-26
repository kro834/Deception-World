import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { RIDER_NAV } from "./dossier-nav";
import { LiquidPointerGlow } from "./liquid-rail";

const SITE_ANNOUNCEMENTS = [
  {
    id: "who-supreme",
    sequence: "TRANSMISSION 01",
    date: "2026.08.23",
    title: "Who Supreme?",
    image: "/announcement-who-supreme.jpeg",
    imageAlt: "青白く発光する仮面とEX. Beyond imagination.の文字",
    width: 960,
    height: 1441,
  },
] as const;

type AnnouncementId = (typeof SITE_ANNOUNCEMENTS)[number]["id"];

const SIDE_MENU_OPEN_INPUT_EVENT = "deception-world:side-menu-open-input";

export function SideMenuTrigger({
  open,
  onOpenChange,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
} = {}) {
  return (
    <button
      className={`side-panel-trigger ios26-glass${className ? ` ${className}` : ""}`}
      data-liquid-pointer="true"
      type="button"
      aria-expanded={open ?? false}
      aria-controls="site-side-panel"
      aria-haspopup="dialog"
      aria-label="メニューを開く"
      onClick={
        onOpenChange
          ? (event) => {
              const openedByKeyboard = event.detail === 0;
              window.dispatchEvent(
                new CustomEvent(SIDE_MENU_OPEN_INPUT_EVENT, {
                  detail: { keyboard: openedByKeyboard },
                }),
              );
              if (!openedByKeyboard) event.currentTarget.blur();
              onOpenChange(true);
            }
          : undefined
      }
    >
      <LiquidPointerGlow />
      <span className="side-panel-trigger-ring" aria-hidden="true" />
      <span className="side-panel-trigger-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

export function SideMenuLayer({
  context = "world",
  open,
  onOpenChange,
}: {
  context?: "world" | "archive" | "movie";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const panelRef = useRef<HTMLElement>(null);
  const announcementRef = useRef<HTMLDialogElement>(null);
  const announcementTriggerRef = useRef<HTMLButtonElement>(null);
  const announcementStageRef = useRef<HTMLDivElement>(null);
  const announcementHeadingRef = useRef<HTMLHeadingElement>(null);
  const announcementOpenedByKeyboardRef = useRef(false);
  const sideMenuRestoreFocusRef = useRef(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<AnnouncementId | null>(null);
  const controlled = typeof open === "boolean" && Boolean(onOpenChange);
  const isOpen = controlled ? open : false;
  const close = () => onOpenChange?.(false);
  const selectedAnnouncement =
    SITE_ANNOUNCEMENTS.find((notice) => notice.id === selectedAnnouncementId) ?? null;

  useEffect(() => {
    const rememberInput = (event: Event) => {
      const detail = (event as CustomEvent<{ keyboard?: boolean }>).detail;
      sideMenuRestoreFocusRef.current = detail?.keyboard === true;
    };
    window.addEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
    return () => window.removeEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
  }, []);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const focusTarget = sideMenuRestoreFocusRef.current
        ? panel.querySelector<HTMLElement>(".side-panel-close")
        : panel;
      focusTarget?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (sideMenuRestoreFocusRef.current) {
        previousFocus?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      sideMenuRestoreFocusRef.current = false;
    };
  }, [controlled, isOpen]);

  useEffect(() => {
    const dialog = announcementRef.current;
    if (!dialog || !announcementOpen) return;
    const sidePanel = panelRef.current;
    const announcementTrigger = announcementTriggerRef.current;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        setAnnouncementOpen(false);
        return;
      }
    }
    const previousOverflow = document.body.style.overflow;
    const ownsBodyScrollLock = previousOverflow !== "hidden";
    if (ownsBodyScrollLock) document.body.style.overflow = "hidden";
    dialog.scrollTop = 0;
    // Focusing the dialog itself prevents WebKit from auto-focusing (and
    // visually latching) the first close control when showModal() runs.
    dialog.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      if (ownsBodyScrollLock) document.body.style.overflow = previousOverflow;
      if (announcementOpenedByKeyboardRef.current) {
        const returnTarget =
          sidePanel?.dataset.open === "true" && announcementTrigger?.isConnected
            ? announcementTrigger
            : document.querySelector<HTMLButtonElement>(".side-panel-trigger");
        returnTarget?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        dialog.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      announcementOpenedByKeyboardRef.current = false;
    };
  }, [announcementOpen]);

  useEffect(() => {
    if (!announcementOpen || !selectedAnnouncement) return;
    const frame = window.requestAnimationFrame(() => {
      if (announcementStageRef.current) announcementStageRef.current.scrollTop = 0;
      announcementHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [announcementOpen, selectedAnnouncement]);

  const openAnnouncements = (event: MouseEvent<HTMLButtonElement>) => {
    const openedByKeyboard = event.detail === 0;
    announcementOpenedByKeyboardRef.current = openedByKeyboard;
    if (!openedByKeyboard) event.currentTarget.blur();
    setSelectedAnnouncementId(null);
    setAnnouncementOpen(true);
  };

  const closeAnnouncement = (restoreFocus = announcementOpenedByKeyboardRef.current) => {
    announcementOpenedByKeyboardRef.current = restoreFocus;
    setAnnouncementOpen(false);
    setSelectedAnnouncementId(null);
  };

  const onAnnouncementBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeAnnouncement(false);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!controlled || !isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sideMenuRestoreFocusRef.current = true;
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((item) => item.tabIndex >= 0 && item.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div
        className="side-panel-scrim"
        data-open={String(isOpen)}
        aria-hidden="true"
        onPointerDown={() => {
          sideMenuRestoreFocusRef.current = false;
        }}
        onClick={controlled ? close : undefined}
      />
      <aside
        ref={panelRef}
        id="site-side-panel"
        className="side-panel"
        data-react-controlled={controlled ? "true" : undefined}
        data-open={String(isOpen)}
        role="dialog"
        aria-modal={true}
        aria-hidden={!isOpen}
        aria-label="サイトメニュー"
        tabIndex={-1}
        inert={controlled ? !isOpen : undefined}
        onPointerDown={() => {
          sideMenuRestoreFocusRef.current = false;
        }}
        onKeyDown={controlled ? onPanelKeyDown : undefined}
      >
        <div className="side-panel-head">
          <div>
            <p>NAVIGATION</p>
            <b>
              {context === "archive"
                ? "FORM ARCHIVE"
                : context === "movie"
                  ? "DREAM CHAPTER"
                  : "DECEPTION WORLD"}
            </b>
          </div>
          <button
            className="side-panel-close ios26-glass"
            type="button"
            data-liquid-pointer="true"
            aria-label="メニューを閉じる"
            onClick={
              controlled
                ? (event) => {
                    if (event.detail !== 0) event.currentTarget.blur();
                    close();
                  }
                : undefined
            }
          >
            <LiquidPointerGlow />
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="side-panel-group">
          <p>SECTIONS</p>
          <div className="side-panel-links">
            {context === "archive" ? (
              <>
                {[
                  ["top", "トップ", "TOP"],
                  ["story", "ストーリー", "STORY"],
                  ["riders", "八人のライダー", "RIDERS"],
                  ["records", "レコード", "RECORDS"],
                  ["manager-archive", "六詠", "RIKUEI"],
                ].map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to="/world"
                    hash={hash}
                    assets={WORLD_ENTER_ASSETS}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "movie" ? (
              <>
                <a href="#top" onClick={controlled ? close : undefined}>
                  <span>トップ</span>
                  <i>TOP</i>
                </a>
                <a href="#posters" onClick={controlled ? close : undefined}>
                  <span>ポスター</span>
                  <i>POSTERS</i>
                </a>
                <a href="#characters" onClick={controlled ? close : undefined}>
                  <span>キャラクター</span>
                  <i>CAST</i>
                </a>
                <a href="#dolminence" onClick={controlled ? close : undefined}>
                  <span>ドルミネンス</span>
                  <i>DOLMINENCE</i>
                </a>
                <a href="#cases" onClick={controlled ? close : undefined}>
                  <span>エピソード</span>
                  <i>CASES</i>
                </a>
              </>
            ) : (
              <>
                <a href="#top" onClick={controlled ? close : undefined}>
                  <span>トップ</span>
                  <i>TOP</i>
                </a>
                <a href="#story" onClick={controlled ? close : undefined}>
                  <span>ストーリー</span>
                  <i>STORY</i>
                </a>
                <a href="#riders" onClick={controlled ? close : undefined}>
                  <span>八人のライダー</span>
                  <i>RIDERS</i>
                </a>
                <a href="#records" onClick={controlled ? close : undefined}>
                  <span>レコード</span>
                  <i>RECORDS</i>
                </a>
                <a href="#manager-archive" onClick={controlled ? close : undefined}>
                  <span>六詠</span>
                  <i>ARCHIVE</i>
                </a>
              </>
            )}
          </div>
        </div>
        <div className="side-panel-group">
          <p>STORIES</p>
          <div className="side-panel-links">
            {context === "movie" ? (
              <>
                <a href="#top" aria-current="page" onClick={controlled ? close : undefined}>
                  <span>映画第一作「ドリームチャプター」</span>
                  <i>MOVIE 01</i>
                </a>
                <GuardedLink
                  to="/world"
                  hash="top"
                  assets={WORLD_ENTER_ASSETS}
                  beforeNavigate={close}
                >
                  <span>ディセプションワールド</span>
                  <i>MAIN SITE</i>
                </GuardedLink>
              </>
            ) : (
              <GuardedLink to="/dream-chapter" assets={[]} beforeNavigate={close}>
                <span>映画第一作「ドリームチャプター」</span>
                <i>MOVIE 01</i>
              </GuardedLink>
            )}
          </div>
        </div>
        {context === "world" ? (
          <div className="side-panel-group">
            <p>RIDERS</p>
            <div className="side-panel-links">
              {RIDER_NAV.map((r, i) =>
                r.href ? (
                  <GuardedLink key={r.id} to={r.href} assets={r.assets}>
                    <span>{r.name}</span>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                  </GuardedLink>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
        <div className="side-panel-group">
          <p>INFORMATION</p>
          <div className="side-panel-links">
            <button
              ref={announcementTriggerRef}
              className="side-panel-link-button side-panel-announcement-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-controls="site-announcement-dialog"
              onClick={openAnnouncements}
            >
              <span>お知らせ</span>
              <i>NOTICE</i>
            </button>
          </div>
        </div>
        <div className="side-panel-group">
          <p>SYSTEM</p>
          <div className="side-panel-links">
            {context === "archive" ? (
              <a href="#archive-switcher" aria-current="page" onClick={close}>
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </a>
            ) : (
              <GuardedLink to="/form-archive" assets={[]} beforeNavigate={close}>
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </GuardedLink>
            )}
            <ZeusButtonToggle />
            <Link to="/" onClick={controlled ? close : undefined}>
              <span>オープニング</span>
              <i>OPENING</i>
            </Link>
          </div>
        </div>
      </aside>
      <dialog
        ref={announcementRef}
        id="site-announcement-dialog"
        className="site-announcement-dialog"
        aria-labelledby="site-announcement-hub-title"
        tabIndex={-1}
        onClick={onAnnouncementBackdrop}
        onCancel={(event) => {
          event.preventDefault();
          closeAnnouncement(true);
        }}
        onClose={() => setAnnouncementOpen(false)}
      >
        <section
          className="site-announcement-hub"
          data-view={selectedAnnouncement ? "detail" : "index"}
        >
          <span className="site-announcement-aura" aria-hidden="true" />
          <header className="site-announcement-header">
            <div>
              <p>INFORMATION / ARCHIVE</p>
              <h2 id="site-announcement-hub-title">お知らせ</h2>
            </div>
            <span className="site-announcement-count" aria-label="お知らせ1件">
              {String(SITE_ANNOUNCEMENTS.length).padStart(2, "0")} ACTIVE
            </span>
            <button
              className="site-announcement-close ios26-glass"
              type="button"
              aria-label="お知らせを閉じる"
              onClick={(event) => {
                event.stopPropagation();
                const restoreFocus = event.detail === 0;
                if (!restoreFocus) event.currentTarget.blur();
                closeAnnouncement(restoreFocus);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
          <div ref={announcementStageRef} className="site-announcement-stage">
            {selectedAnnouncement ? (
              <article className="site-announcement-detail">
                <button
                  className="site-announcement-back"
                  type="button"
                  onClick={() => setSelectedAnnouncementId(null)}
                >
                  <span aria-hidden="true">←</span>
                  一覧へ戻る
                </button>
                <figure className="site-announcement-visual">
                  {announcementOpen ? (
                    <img
                      src={selectedAnnouncement.image}
                      alt={selectedAnnouncement.imageAlt}
                      width={selectedAnnouncement.width}
                      height={selectedAnnouncement.height}
                      decoding="async"
                    />
                  ) : null}
                </figure>
                <div className="site-announcement-copy">
                  <p>
                    NOTICE / {selectedAnnouncement.sequence}
                    <time dateTime={selectedAnnouncement.date.replaceAll(".", "-")}>
                      {selectedAnnouncement.date}
                    </time>
                  </p>
                  <h3 ref={announcementHeadingRef} tabIndex={-1}>
                    {selectedAnnouncement.title}
                  </h3>
                </div>
              </article>
            ) : (
              <div className="site-announcement-index">
                <div className="site-announcement-index-copy">
                  <p>新着情報と記録された通信を選択してください。</p>
                  <span>SELECT TRANSMISSION</span>
                </div>
                <ul className="site-announcement-list">
                  {SITE_ANNOUNCEMENTS.map((notice) => (
                    <li key={notice.id}>
                      <button
                        className="site-announcement-list-item"
                        type="button"
                        onClick={() => setSelectedAnnouncementId(notice.id)}
                        aria-label={`${notice.title}を開く`}
                      >
                        <span className="site-announcement-list-visual" aria-hidden="true">
                          {announcementOpen ? (
                            <img
                              src={notice.image}
                              alt=""
                              width={notice.width}
                              height={notice.height}
                              decoding="async"
                            />
                          ) : null}
                        </span>
                        <span className="site-announcement-list-copy">
                          <span>
                            <small>{notice.sequence}</small>
                            <time dateTime={notice.date.replaceAll(".", "-")}>{notice.date}</time>
                          </span>
                          <b>{notice.title}</b>
                          <i>OPEN RECORD</i>
                        </span>
                        <span className="site-announcement-list-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </dialog>
    </>
  );
}
