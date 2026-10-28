import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { DogViewer } from "@/components/dogs-archive/dog-viewer";
import {
  DOG_ARCHIVE_ENTRIES,
  type DogArchiveId,
  parseDogArchiveSearch,
} from "@/lib/dogs-archive/entries";
import { guardDogsArchiveNavigation } from "@/lib/dogs-archive/touch-guard";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import archiveCss from "@/styles-dogs-archive.css?url";
import viewerCss from "@/styles-dogs-viewer.css?url";

export const Route = createFileRoute("/dogs-archive")({
  validateSearch: parseDogArchiveSearch,
  component: DogsArchive,
  head: () =>
    createWorldHead({
      title: "DOGS ARCHIVE｜Deception World",
      description: "終の来訪者“犬”の個体記録。第五の“犬”を、あらゆる方向から見つめる。",
      image: "/dogs-archive-20261028/reference/guardian-rest.jpg",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: viewerCss },
        { rel: "stylesheet", href: archiveCss },
      ],
    }),
});

function DogsArchive() {
  const { dog } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const referenceButton = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const entry = DOG_ARCHIVE_ENTRIES[dog - 1];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dogsArchive = "true";
    const release = guardDogsArchiveNavigation(document);
    return () => {
      release();
      delete root.dataset.dogsArchive;
    };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (referenceOpen && !dialog.open) dialog.showModal();
    else if (!referenceOpen && dialog.open) {
      dialog.close();
      referenceButton.current?.focus({ preventScroll: true });
    }
  }, [referenceOpen]);

  const choose = (next: DogArchiveId) => {
    if (next !== dog) void navigate({ search: { dog: next }, replace: true, resetScroll: false });
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, id: DogArchiveId) => {
    const next =
      event.key === "Home"
        ? 1
        : event.key === "End"
          ? 5
          : event.key === "ArrowRight"
            ? (id % 5) + 1
            : event.key === "ArrowLeft"
              ? ((id + 3) % 5) + 1
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(next as DogArchiveId);
    tabs.current
      ?.querySelector<HTMLButtonElement>(`[data-dog="${next}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <main className="dogs-archive" id="main">
      <SideMenuLayer context="archive" open={menuOpen} onOpenChange={setMenuOpen} />
      <header className="dogs-archive-header">
        <h1>DOGS ARCHIVE</h1>
        <div className="dogs-archive-header-actions">
          <GuardedLink
            to="/world"
            assets={[]}
            aria-label="Deception Worldへ戻る"
            className="dogs-archive-exit"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m14 5-7 7 7 7M7 12h14"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>世界へ戻る</span>
          </GuardedLink>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <div
        id="dogs-selector"
        className="dogs-archive-selector"
        role="tablist"
        aria-label="犬の個体を選ぶ"
        ref={tabs}
      >
        {DOG_ARCHIVE_ENTRIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-dog={item.id}
            id={`dog-tab-${item.id}`}
            aria-label={item.title}
            aria-selected={dog === item.id}
            aria-controls="dogs-archive-panel"
            tabIndex={dog === item.id ? 0 : -1}
            onClick={() => choose(item.id)}
            onKeyDown={(event) => onTabKey(event, item.id)}
          >
            <b aria-hidden="true">{item.numeral}</b>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
      <section
        className="dogs-archive-stage"
        id="dogs-archive-panel"
        role="tabpanel"
        aria-labelledby={`dog-tab-${dog}`}
        tabIndex={-1}
      >
        <div className="dogs-archive-record">
          <h2>{entry.title}</h2>
          {entry.name ? <p>{entry.name}</p> : null}
        </div>
        {dog === 5 ? (
          <>
            <DogViewer active />
            <button
              className="dogs-archive-reference"
              ref={referenceButton}
              type="button"
              onClick={() => setReferenceOpen(true)}
              aria-haspopup="dialog"
            >
              原画
            </button>
          </>
        ) : dog === 2 ? (
          <div className="dogs-archive-varg">
            <img
              src="/character-varg-20261021.webp"
              alt="第二の犬・ヴァルグの本来形態"
              width={1088}
              height={1445}
            />
            <Link to="/characters/dante" hash="character-section-04">
              人物資料へ <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : (
          <div className="dogs-archive-unreleased">
            <span aria-hidden="true">{entry.numeral}</span>
            <p>個体資料は未公開です。</p>
          </div>
        )}
      </section>
      <dialog
        className="dogs-archive-reference-dialog"
        ref={dialogRef}
        aria-labelledby="dogs-reference-title"
        onCancel={(event) => {
          event.preventDefault();
          setReferenceOpen(false);
        }}
        onClose={() => setReferenceOpen(false)}
      >
        <header>
          <h2 id="dogs-reference-title">第五の“犬” — 原画</h2>
          <button type="button" onClick={() => setReferenceOpen(false)} aria-label="原画を閉じる">
            ×
          </button>
        </header>
        {referenceOpen ? (
          <div className="dogs-reference-pair">
            <figure>
              <img
                src="/dogs-archive-20261028/reference/guardian-rest.jpg"
                alt="巻き触手と渦状の胴体を持つ第五の犬の静止姿勢"
                width={920}
                height={1280}
              />
              <figcaption>静止姿勢</figcaption>
            </figure>
            <figure>
              <img
                src="/dogs-archive-20261028/reference/guardian-exhale.jpg"
                alt="頭を上げ、口から緑の炎を噴く第五の犬"
                width={1254}
                height={1254}
              />
              <figcaption>吐炎姿勢</figcaption>
            </figure>
          </div>
        ) : null}
      </dialog>
    </main>
  );
}
