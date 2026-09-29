import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import notFoundCss from "@/styles-not-found.css?url";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-void px-6 text-center text-fg">
      <span className="text-gold" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-lg tracking-wide">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
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
