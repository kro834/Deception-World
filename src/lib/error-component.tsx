import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import notFoundCss from "@/styles-not-found.css?url";
import loadErrorCss from "@/styles-load-error.css?url";

export function AppErrorComponent() {
  return (
    <main
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
    <main className="app-not-found">
      {/* Hoisted by React into <head>, and only where a 404 renders. */}
      <link rel="stylesheet" href={notFoundCss} precedence="default" />
      <i className="app-not-found-plate" aria-hidden="true" />
      <span aria-hidden="true">404 / LOST RECORD</span>
      <p>DECEPTION WORLD</p>
      <h1>記録が見つかりません。</h1>
      <p>指定された資料は存在しないか、まだ公開されていません。</p>
      <Link to="/world">WORLD ARCHIVEへ戻る</Link>
    </main>
  );
}
