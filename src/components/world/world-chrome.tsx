import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { WORLD_ENTER_ASSETS, preloadAssets } from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { RIDER_NAV } from "./dossier-nav";
import { LiquidPointerGlow } from "./liquid-rail";

export function SiteUpdateButton() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  return (
    <aside className="site-update-control" aria-label="サイト更新">
      <button
        className="site-update-button ios26-glass"
        data-liquid-pointer="true"
        type="button"
        aria-busy={busy}
        disabled={busy}
        aria-label="サイトの最新版を確認"
        onClick={() => {
          if (busy) return;
          setBusy(true);
          setStatus("確認中");
          const started = performance.now();
          void preloadAssets(WORLD_ENTER_ASSETS, () => undefined)
            .catch(() => undefined)
            .then(async () => {
              const wait = Math.max(0, 720 - (performance.now() - started));
              await new Promise((r) => window.setTimeout(r, wait));
              setBusy(false);
              setStatus("最新です");
              window.setTimeout(() => setStatus(""), 3200);
            });
        }}
      >
        <LiquidPointerGlow />
        <i aria-hidden="true">
          <span />
        </i>
        <b>{busy ? "CHECKING" : "UPDATE"}</b>
      </button>
      <span className={status ? "site-update-status is-on" : "site-update-status"} role="status" aria-live="polite">
        {status}
      </span>
    </aside>
  );
}

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
  const controlled = typeof open === "boolean" && Boolean(onOpenChange);
  const isOpen = controlled ? open : false;
  const close = () => onOpenChange?.(false);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((item) => item.tabIndex >= 0 && item.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
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
                <a href="#top"><span>トップ</span><i>TOP</i></a>
                <a href="#story"><span>ストーリー</span><i>STORY</i></a>
                <a href="#riders"><span>七人のライダー</span><i>RIDERS</i></a>
                <a href="#records"><span>レコード</span><i>RECORDS</i></a>
                <a href="#manager-archive"><span>六詠</span><i>ARCHIVE</i></a>
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
    </>
  );
}
