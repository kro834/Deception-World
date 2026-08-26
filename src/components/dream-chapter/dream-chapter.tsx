import { useEffect, useRef, useState, type MouseEvent } from "react";
import { GuardedLink } from "@/components/load-gate";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import {
  DREAM_CASES,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_POSTERS,
  type DreamCharacter,
  type DreamDolminence,
} from "./dream-chapter-data";

function DossierContent({ character }: { character: DreamCharacter }) {
  return (
    <div
      className="dream-dossier-layout"
      style={{ ["--dream-accent" as string]: character.accent }}
    >
      <div className={`dream-dossier-visuals${character.secondary ? "" : " is-single"}`}>
        <figure>
          <img
            src={character.portrait}
            alt={character.portraitAlt}
            width={character.id === "ciel" ? 1022 : character.id === "keiya" ? 736 : 638}
            height={character.id === "ciel" ? 1539 : character.id === "keiya" ? 976 : 630}
            style={{ objectPosition: character.portraitPosition }}
            decoding="async"
          />
          <figcaption>PERSON / {character.roman}</figcaption>
        </figure>
        {character.secondary ? (
          <figure>
            <img
              src={character.secondary}
              alt={character.secondaryAlt}
              width={character.id === "ciel" ? 846 : 1089}
              height={character.id === "ciel" ? 1219 : 1445}
              style={{ objectPosition: character.secondaryPosition }}
              decoding="async"
            />
            <figcaption>
              {character.id === "ciel" ? "RIDER / DILUCULUM SAGA" : "DIVINITY / YOAKE-MAMORI"}
            </figcaption>
          </figure>
        ) : null}
      </div>

      <div className="dream-dossier-copy">
        <header className="dream-dossier-title">
          <p>CHARACTER FILE / {character.order}</p>
          <span>{character.tagline}</span>
          <h2>{character.name}</h2>
          <b>{character.roman}</b>
          <small>{character.role}</small>
        </header>

        {character.quotes?.map((quote) => (
          <blockquote key={quote}>「{quote}」</blockquote>
        ))}

        <dl className="dream-profile-grid">
          {character.profile.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="dream-dossier-sections">
          {character.sections.map((section, index) => (
            <section key={section.title}>
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{section.title}</h3>
              </header>
              {section.lead ? <p className="dream-section-lead">{section.lead}</p> : null}
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items?.length ? (
                <div className="dream-ability-list">
                  {section.items.map((item) => (
                    <article key={item.name}>
                      <h4>{item.name}</h4>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function CharacterDialog({
  character,
  onClose,
}: {
  character: DreamCharacter | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !character) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() =>
      closeRef.current?.focus({ preventScroll: true }),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [character]);

  if (!character) return null;

  return (
    <dialog
      ref={dialogRef}
      className="dream-dossier-dialog"
      aria-label={`${character.name}の詳細資料`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event: MouseEvent<HTMLDialogElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dream-dossier-shell">
        <button
          ref={closeRef}
          className="dream-dossier-close ios26-glass"
          type="button"
          aria-label="詳細資料を閉じる"
          onClick={onClose}
        >
          <span>CLOSE</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <DossierContent character={character} />
      </div>
    </dialog>
  );
}

function DolminenceContent({ record }: { record: DreamDolminence }) {
  return (
    <div
      className="dream-dossier-layout dream-dolminence-dossier"
      style={{ ["--dream-accent" as string]: record.accent }}
    >
      <div
        className={`dream-dossier-visuals dream-dolminence-visuals${record.secondary ? "" : " is-single"}`}
      >
        <figure>
          <img
            src={record.image}
            alt={record.imageAlt}
            width={record.imageWidth}
            height={record.imageHeight}
            style={{ objectPosition: record.imagePosition }}
            decoding="async"
          />
          <figcaption>DOLMINENCE / {record.roman}</figcaption>
        </figure>
        {record.secondary ? (
          <figure>
            <img
              src={record.secondary}
              alt={record.secondaryAlt}
              width={record.secondaryWidth}
              height={record.secondaryHeight}
              style={{ objectPosition: record.secondaryPosition }}
              decoding="async"
            />
            <figcaption>CLASSIFIED DESIGN RECORD</figcaption>
          </figure>
        ) : null}
      </div>

      <div className="dream-dossier-copy">
        <header className="dream-dossier-title">
          <p>DOLMINENCE FILE / {record.order}</p>
          <span>CLASSIFIED AGENT RECORD</span>
          <h2>{record.name}</h2>
          <b>{record.roman}</b>
          <small>{record.agent}</small>
        </header>

        <dl className="dream-profile-grid">
          {record.profile.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="dream-dossier-sections">
          <section>
            <header>
              <span>01</span>
              <h3>機密記録</h3>
            </header>
            {record.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
          <section>
            <header>
              <span>02</span>
              <h3>装備・機能</h3>
            </header>
            <div className="dream-ability-list">
              {record.items.map((item) => (
                <article key={item.name}>
                  <h4>{item.name}</h4>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DolminenceDialog({
  record,
  onClose,
}: {
  record: DreamDolminence | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !record) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() =>
      closeRef.current?.focus({ preventScroll: true }),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [record]);

  if (!record) return null;

  return (
    <dialog
      ref={dialogRef}
      className="dream-dossier-dialog dream-dolminence-dialog"
      aria-label={`${record.name}の機密資料`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event: MouseEvent<HTMLDialogElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dream-dossier-shell" style={{ ["--dream-accent" as string]: record.accent }}>
        <button
          ref={closeRef}
          className="dream-dossier-close ios26-glass"
          type="button"
          aria-label="機密資料を閉じる"
          onClick={onClose}
        >
          <span>CLOSE</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <DolminenceContent record={record} />
      </div>
    </dialog>
  );
}

export function DreamChapter() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [posterIndex, setPosterIndex] = useState(0);
  const [character, setCharacter] = useState<DreamCharacter | null>(null);
  const [dolminenceRecord, setDolminenceRecord] = useState<DreamDolminence | null>(null);
  const activePoster = DREAM_POSTERS[posterIndex];

  useEffect(() => {
    document.documentElement.dataset.dreamChapter = "true";
    return () => {
      delete document.documentElement.dataset.dreamChapter;
    };
  }, []);

  return (
    <main id="top" className="dream-page">
      <header className="dream-site-header">
        <GuardedLink className="dream-back-link" to="/world" hash="top" assets={WORLD_ENTER_ASSETS}>
          <span aria-hidden="true">←</span>
          <span>
            <small>RETURN TO</small>
            DECEPTION WORLD
          </span>
        </GuardedLink>
        <p>
          KAMEN RIDER SAGA
          <b>THE MOVIE I</b>
        </p>
        <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
      </header>

      <SideMenuLayer context="movie" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="dream-hero" aria-labelledby="dream-title">
        <img
          className="dream-hero-image"
          src="/dream-chapter-poster-03.jpeg"
          alt=""
          width="1448"
          height="1086"
          fetchPriority="high"
          decoding="async"
        />
        <span className="dream-hero-vignette" aria-hidden="true" />
        <span className="dream-orbit dream-orbit-a" aria-hidden="true" />
        <span className="dream-orbit dream-orbit-b" aria-hidden="true" />
        <div className="dream-hero-copy">
          <p>FILM 01 / DREAM OBSERVATION RECORD</p>
          <h1 id="dream-title" className="dream-visually-hidden">
            仮面ライダーサーガ Dream Chapter
          </h1>
          <img
            className="dream-title-logo"
            src="/dream-chapter-logo.jpeg"
            alt="仮面ライダーサーガ Dream Chapter"
            width="1280"
            height="731"
            decoding="async"
          />
          <div>
            <b>ドリームチャプター</b>
            <span>夢と現実の境界が、明ける。</span>
          </div>
        </div>
        <a className="dream-scroll-cue" href="#posters">
          <span>ENTER THE RECORD</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section
        id="posters"
        className="dream-section dream-poster-section"
        aria-labelledby="poster-title"
      >
        <header className="dream-section-heading">
          <p>KEY VISUAL ARCHIVE</p>
          <h2 id="poster-title">POSTERS</h2>
          <span>01 — 08</span>
        </header>

        <div className="dream-poster-stage">
          <figure>
            <img
              key={activePoster.src}
              src={activePoster.src}
              alt={activePoster.alt}
              width={activePoster.width}
              height={activePoster.height}
              style={{
                objectFit: activePoster.fit,
                objectPosition: activePoster.position,
              }}
              loading="lazy"
              decoding="async"
            />
            <figcaption>
              <span>VISUAL / {String(posterIndex + 1).padStart(2, "0")}</span>
              <b>DREAM CHAPTER</b>
            </figcaption>
          </figure>
          <div className="dream-poster-thumbnails" role="tablist" aria-label="ポスターを選択">
            {DREAM_POSTERS.map((poster, index) => (
              <button
                key={poster.src}
                type="button"
                role="tab"
                aria-selected={posterIndex === index}
                className={posterIndex === index ? "is-active" : undefined}
                onClick={(event) => {
                  setPosterIndex(index);
                  if (event.detail !== 0) event.currentTarget.blur();
                }}
              >
                <img
                  src={poster.src}
                  alt=""
                  width={poster.width}
                  height={poster.height}
                  style={{ objectPosition: poster.position }}
                  loading="lazy"
                  decoding="async"
                />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        id="characters"
        className="dream-section dream-character-section"
        aria-labelledby="character-title"
      >
        <header className="dream-section-heading">
          <p>CAST / OBSERVED SUBJECTS</p>
          <h2 id="character-title">CHARACTERS</h2>
          <span>03 FILES</span>
        </header>
        <div className="dream-character-grid">
          {DREAM_CHARACTERS.map((item) => (
            <article key={item.id} style={{ ["--dream-accent" as string]: item.accent }}>
              <button
                type="button"
                onClick={() => setCharacter(item)}
                aria-label={`${item.name}の詳細を開く`}
              >
                <img
                  src={item.portrait}
                  alt={item.portraitAlt}
                  width={item.id === "ciel" ? 1022 : item.id === "keiya" ? 736 : 638}
                  height={item.id === "ciel" ? 1539 : item.id === "keiya" ? 976 : 630}
                  style={{ objectPosition: item.portraitPosition }}
                  loading="lazy"
                  decoding="async"
                />
                <span className="dream-character-shade" aria-hidden="true" />
                <span className="dream-character-number">{item.order}</span>
                <span className="dream-character-copy">
                  <small>{item.tagline}</small>
                  <b>{item.name}</b>
                  <i>{item.roman}</i>
                  <em>OPEN DOSSIER ↗</em>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section
        id="dolminence"
        className="dream-section dream-dolminence-section"
        aria-labelledby="dolminence-title"
      >
        <header className="dream-section-heading">
          <p>CLASSIFIED ORGANIZATION / AGENT DISGUISE RECORD</p>
          <h2 id="dolminence-title">DOLMINENCE</h2>
          <span>04 FILES</span>
        </header>
        <p className="dream-dolminence-intro">
          夢と現実の境界で作戦を遂行する機密組織「ドルミネンス」。擬装システムと既存の変身装置を用いる、四つの記録を開示する。
        </p>
        <div className="dream-dolminence-grid">
          {DREAM_DOLMINENCE.map((record) => (
            <article key={record.id} style={{ ["--dream-accent" as string]: record.accent }}>
              <button
                type="button"
                onClick={() => {
                  setCharacter(null);
                  setDolminenceRecord(record);
                }}
                aria-label={`${record.name}の機密資料を開く`}
              >
                <img
                  src={record.image}
                  alt={record.imageAlt}
                  width={record.imageWidth}
                  height={record.imageHeight}
                  style={{ objectPosition: record.imagePosition }}
                  loading="lazy"
                  decoding="async"
                />
                <span className="dream-character-shade" aria-hidden="true" />
                <span className="dream-dolminence-number">{record.order}</span>
                <span className="dream-dolminence-copy">
                  <small>{record.agent}</small>
                  <b>{record.name}</b>
                  <i>{record.roman}</i>
                  <em>OPEN CLASSIFIED FILE ↗</em>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="cases" className="dream-section dream-case-section" aria-labelledby="case-title">
        <header className="dream-section-heading">
          <p>EPISODE / CASE RECORD</p>
          <h2 id="case-title">CASES</h2>
          <span>NO THUMBNAILS</span>
        </header>
        <ol className="dream-case-list">
          {DREAM_CASES.map((episode) => (
            <li key={episode.no}>
              <span>CASE</span>
              <b>{episode.no}</b>
              <h3>{episode.title}</h3>
              <small>{episode.reading}</small>
              <i aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>

      <footer className="dream-footer">
        <p>KAMEN RIDER SAGA / THE MOVIE I</p>
        <h2>DREAM CHAPTER</h2>
        <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS}>
          DECEPTION WORLDへ戻る
        </GuardedLink>
      </footer>

      <CharacterDialog character={character} onClose={() => setCharacter(null)} />
      <DolminenceDialog record={dolminenceRecord} onClose={() => setDolminenceRecord(null)} />
    </main>
  );
}
