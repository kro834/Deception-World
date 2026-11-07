import { Suspense, use, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { importWithRetry } from "@/lib/chunk-retry.js";

const serverAnnex = import.meta.env.SSR ? await import("./world-annex") : undefined;

const ANNEX_CONTENTS: readonly { href: string; code: string; label: string }[] = [
  { href: "#cast-roster", code: "04", label: "人物一覧" },
  { href: "#world-brief", code: "05", label: "世界と組織" },
  { href: "#episode-notes", code: "06.1", label: "エピソードの記録" },
  { href: "#glossary", code: "06.2", label: "用語集" },
  { href: "#quotes", code: "06.3", label: "名台詞" },
];

export function WorldAnnexRiders() {
  return null;
}

type AnnexModule = typeof import("./world-annex");
type Chapter = keyof AnnexModule;
let cached: AnnexModule | undefined;

function createReader() {
  let resolve!: (module: AnnexModule) => void;
  const promise = new Promise<AnnexModule>((ready) => {
    resolve = ready;
  });
  return { promise, resolve };
}

function ChapterBody({ name, reader }: { name: Chapter; reader: ReturnType<typeof createReader> }) {
  // SSR renders the entire document synchronously, including native details and links.
  // During hydration React retains those exact DOM nodes while waiting for the reader.
  const module = serverAnnex ?? cached ?? use(reader.promise);
  const Content = module[name];
  return <Content />;
}

function annexHash(hash: string) {
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    return /^(?:wa-|re-dive(?:$|-)|world-(?:transcript|quotes)-|(?:cast-roster|world-brief|episode-notes|glossary|quotes)(?:$|-))/.test(
      id,
    )
      ? id
      : null;
  } catch {
    return null;
  }
}

export function WorldAnnexRecords() {
  const router = useRouter();
  const [reader] = useState(createReader);
  const [failed, setFailed] = useState(false);
  const pendingAnchor = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (cached) return;
    let active = true;
    let started = false;
    const load = () => {
      if (!active || started) return;
      started = true;
      observer?.disconnect();
      void importWithRetry(() => import("./world-annex"), { isCancelled: () => !active }).then(
        (module) => {
          if (!active) return;
          cached = module;
          reader.resolve(module);
          setReady(true);
        },
        () => {
          if (active) setFailed(true);
        },
      );
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) load();
            },
            { rootMargin: "900px 0px" },
          )
        : null;
    const followHash = (raw: string) => {
      const id = annexHash(raw);
      if (!id) return;
      // A fresh SPA entry initially has only the section headings. Reapply a deep
      // anchor once the whole document exists. SSR and cached returns already have it.
      if (!document.querySelector("#cast-roster .wa-roster")) pendingAnchor.current = id;
      load();
    };
    const routeIntent = () => followHash(location.hash);
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      if (toLocation.pathname === "/world") followHash(toLocation.hash);
    });
    const cancelAnchor = () => {
      pendingAnchor.current = null;
    };
    if (!observer) load();
    else
      document
        .querySelectorAll(".wa-contents, section.world-annex")
        .forEach((section) => observer.observe(section));
    routeIntent();
    window.addEventListener("hashchange", routeIntent);
    window.addEventListener("popstate", routeIntent);
    window.addEventListener("wheel", cancelAnchor, { passive: true });
    window.addEventListener("touchmove", cancelAnchor, { passive: true });
    return () => {
      active = false;
      observer?.disconnect();
      unsubscribe();
      window.removeEventListener("hashchange", routeIntent);
      window.removeEventListener("popstate", routeIntent);
      window.removeEventListener("wheel", cancelAnchor);
      window.removeEventListener("touchmove", cancelAnchor);
    };
  }, [reader, router]);
  useLayoutEffect(() => {
    if (!ready) return;
    const hash = pendingAnchor.current;
    pendingAnchor.current = null;
    if (hash && annexHash(location.hash) === hash) {
      document.getElementById(hash)?.scrollIntoView({ behavior: "instant" });
    }
  }, [ready]);
  const body = (name: Chapter, id: string, title: string) => (
    <Suspense
      fallback={
        <div className="wa-inner">
          <header className="wa-heading">
            <h2 id={id}>{title}</h2>
          </header>
        </div>
      }
    >
      <ChapterBody name={name} reader={reader} />
    </Suspense>
  );
  return (
    <>
      <nav className="wa-contents" aria-labelledby="wa-contents-title">
        <div className="wa-contents-inner">
          <h2 id="wa-contents-title" className="visually-hidden">
            資料目次
          </h2>
          <ol>
            {ANNEX_CONTENTS.map(({ href, code, label }) => (
              <li key={href}>
                <a href={href}>
                  <small aria-hidden="true">{code}</small>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>
      {failed && (
        <p role="alert">
          資料の読み込みに失敗しました。{" "}
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </p>
      )}
      <section
        id="cast-roster"
        className="world-annex is-chapter"
        aria-labelledby="cast-roster-title"
      >
        {body("CastFiles", "cast-roster-title", "人物一覧")}
      </section>
      <section
        id="world-brief"
        className="world-annex is-chapter"
        aria-labelledby="world-brief-title"
      >
        {body("WorldFiles", "world-brief-title", "世界と組織")}
      </section>
      <section
        id="episode-notes"
        className="world-annex is-chapter"
        aria-labelledby="episode-notes-title"
      >
        {body("EpisodeNotes", "episode-notes-title", "エピソードの記録")}
      </section>
      <section id="glossary" className="world-annex" aria-labelledby="glossary-title">
        {body("Glossary", "glossary-title", "用語集")}
      </section>
      <section id="quotes" className="world-annex wa-quotes" aria-labelledby="quotes-title">
        {body("Quotes", "quotes-title", "名台詞")}
      </section>
    </>
  );
}
