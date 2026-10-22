import { TriangleAlert } from "lucide-react";
import notFoundCss from "@/styles-not-found.css?url";
import loadErrorCss from "@/styles-load-error.css?url";
import { RecoveryTiles } from "@/components/library/recovery-tiles";

/* The error page can land after the route's last scroll or toggle: the Zeus
   button would rest where it was placed for the page that failed (on its
   ways out, on short phones). The page's ref tells it to look again once attached; the
   name is ZEUS_SURFACE_EVENT (src/lib/zeus-surface.ts), written out here so
   these pages keep their imports. */
// A module-level ref callback: it runs once when the page is attached.
const cueZeus = (node: HTMLElement | null) => {
  if (node) document.dispatchEvent(new Event("deception-world:zeus-surface"));
};

export function AppErrorComponent() {
  return (
    <main
      ref={cueZeus}
      className="app-load-error flex min-h-dvh items-center justify-center bg-void px-6 text-center text-fg"
      aria-labelledby="load-error-heading"
    >
      <link rel="stylesheet" href={loadErrorCss} precedence="default" />
      <div className="app-load-error-panel">
        <span className="text-gold" aria-hidden="true">
          <TriangleAlert className="size-10" strokeWidth={2} />
        </span>
        <h1 id="load-error-heading" className="font-display text-lg tracking-wide">
          ページを読み込めませんでした。
        </h1>
        <p className="text-sm text-muted">
          通信状態を確認して、もう一度読み込んでください。アーカイブへ戻ることもできます。
        </p>
        <div className="app-load-error-actions">
          {/* A failed dynamic import stays cached for this document. Resetting
              only the error boundary can immediately fail again; a fresh
              document retries the module once the connection has recovered. */}
          <button type="button" onClick={() => window.location.reload()}>
            ページを再読み込み
          </button>
          <a href="/world">WORLD ARCHIVEへ戻る</a>
        </div>
      </div>
    </main>
  );
}

export function NotFoundComponent() {
  return (
    <main ref={cueZeus} className="app-not-found">
      {/* Hoisted by React into <head>, and only where a 404 renders. */}
      <link rel="stylesheet" href={notFoundCss} precedence="default" />
      <i className="app-not-found-plate" aria-hidden="true" />
      <span className="app-not-found-sigil" aria-hidden="true">
        <i>DW</i>
      </span>
      <span aria-hidden="true">404 / LOST RECORD</span>
      <p>DECEPTION WORLD</p>
      <h1>記録が見つかりません。</h1>
      <p>指定された資料は存在しないか、まだ公開されていません。</p>
      <RecoveryTiles />
    </main>
  );
}
