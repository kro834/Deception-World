import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { WORLD_ENTER_ASSETS, preloadAssets } from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { RIDER_NAV } from "./dossier-nav";

export function SiteUpdateButton() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  return (
    <aside className="site-update-control" aria-label="サイト更新">
      <button
        className="site-update-button ios26-glass"
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
        <span className="site-update-glow" aria-hidden="true" />
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

export function SideMenuTrigger() {
  return (
    <button className="side-panel-trigger ios26-glass" type="button" aria-expanded="false" aria-label="メニューを開く">
      <span className="side-panel-trigger-ring" aria-hidden="true" />
      <span className="side-panel-trigger-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

export function SideMenuLayer() {
  return (
    <>
      <div className="side-panel-scrim" data-open="false" aria-hidden="true" />
      <aside className="side-panel" data-open="false" aria-label="サイトメニュー">
        <div className="side-panel-head">
          <div>
            <p>NAVIGATION</p>
            <b>DECEPTION WORLD</b>
          </div>
          <button className="side-panel-close" type="button" aria-label="メニューを閉じる">
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
            <a href="#top">
              <span>トップ</span>
              <i>TOP</i>
            </a>
            <a href="#story">
              <span>ストーリー</span>
              <i>STORY</i>
            </a>
            <a href="#riders">
              <span>七人のライダー</span>
              <i>RIDERS</i>
            </a>
            <a href="#records">
              <span>レコード</span>
              <i>RECORDS</i>
            </a>
            <a href="#manager-archive">
              <span>六詠</span>
              <i>ARCHIVE</i>
            </a>
          </div>
        </div>
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
        <div className="side-panel-group">
          <p>SYSTEM</p>
          <div className="side-panel-links">
            <Link to="/">
              <span>オープニング</span>
              <i>OPENING</i>
            </Link>
            <a href="/Deception-World.zip" download="Deception-World.zip">
              <span>サイトZIP</span>
              <i>EXPORT</i>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
