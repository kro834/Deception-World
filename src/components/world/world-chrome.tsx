import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { RIDER_NAV } from "./dossier-nav";
import { LiquidPointerGlow } from "./liquid-rail";

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
      onClick={onOpenChange ? () => onOpenChange(true) : undefined}
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
  context?: "world" | "archive";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const panelRef = useRef<HTMLElement>(null);
  const announcementRef = useRef<HTMLDialogElement>(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const controlled = typeof open === "boolean" && Boolean(onOpenChange);
  const isOpen = controlled ? open : false;
  const close = () => onOpenChange?.(false);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      panel.querySelector<HTMLElement>(".side-panel-close")?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [controlled, isOpen]);

  useEffect(() => {
    const dialog = announcementRef.current;
    if (!dialog || !announcementOpen) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        setAnnouncementOpen(false);
        return;
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      dialog
        .querySelector<HTMLButtonElement>(".site-announcement-close")
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      document
        .querySelector<HTMLButtonElement>(".side-panel-trigger")
        ?.focus({ preventScroll: true });
    };
  }, [announcementOpen]);

  const openAnnouncement = () => {
    if (controlled) close();
    else panelRef.current?.querySelector<HTMLButtonElement>(".side-panel-close")?.click();
    setAnnouncementOpen(true);
  };

  const closeAnnouncement = () => setAnnouncementOpen(false);

  const onAnnouncementBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeAnnouncement();
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!controlled || !isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
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
        onKeyDown={controlled ? onPanelKeyDown : undefined}
      >
        <div className="side-panel-head">
          <div>
            <p>NAVIGATION</p>
            <b>{context === "archive" ? "FORM ARCHIVE" : "DECEPTION WORLD"}</b>
          </div>
          <button
            className="side-panel-close ios26-glass"
            type="button"
            data-liquid-pointer="true"
            aria-label="メニューを閉じる"
            onClick={controlled ? close : undefined}
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
                  ["riders", "七人のライダー", "RIDERS"],
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
                  <span>七人のライダー</span>
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
              className="side-panel-announcement-trigger ios26-glass"
              type="button"
              data-liquid-pointer="true"
              aria-haspopup="dialog"
              aria-controls="site-announcement-dialog"
              onClick={openAnnouncement}
            >
              <LiquidPointerGlow />
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
        aria-labelledby="site-announcement-title"
        onClick={onAnnouncementBackdrop}
        onCancel={(event) => {
          event.preventDefault();
          closeAnnouncement();
        }}
        onClose={() => setAnnouncementOpen(false)}
      >
        <article className="site-announcement-card">
          <span className="site-announcement-aura" aria-hidden="true" />
          <button
            className="site-announcement-close ios26-glass"
            type="button"
            data-liquid-pointer="true"
            aria-label="お知らせを閉じる"
            onClick={closeAnnouncement}
          >
            <LiquidPointerGlow />
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
          <figure className="site-announcement-visual">
            {announcementOpen ? (
              <img
                src="/announcement-who-supreme.jpeg"
                alt="青白く発光する仮面とEX. Beyond imagination.の文字"
                width="960"
                height="1441"
                decoding="async"
              />
            ) : null}
          </figure>
          <div className="site-announcement-copy">
            <p>NOTICE / TRANSMISSION 01</p>
            <h2 id="site-announcement-title">Who Supreme?</h2>
          </div>
        </article>
      </dialog>
    </>
  );
}
