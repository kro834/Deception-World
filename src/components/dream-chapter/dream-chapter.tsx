import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { GuardedLink } from "@/components/load-gate";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";
import { LiquidPointerGlow } from "@/components/world/liquid-rail";
import { settlePickupScroll } from "@/components/world/pickup-scroll-reset";
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
  openedByKeyboard,
  trigger,
  onClose,
}: {
  character: DreamCharacter | null;
  openedByKeyboard: boolean;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !character) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    const stopSettling = settlePickupScroll(
      dialog,
      [
        ".dream-dossier-shell",
        ".dream-dossier-layout",
        ".dream-dossier-visuals",
        ".dream-dossier-copy",
      ],
      () => document.dispatchEvent(new CustomEvent("liquidrelayout")),
    );
    if (openedByKeyboard) closeRef.current?.focus({ preventScroll: true });
    else {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      dialog.focus({ preventScroll: true });
    }
    return () => {
      stopSettling();
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (openedByKeyboard) {
        window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
      } else {
        trigger?.blur();
        window.requestAnimationFrame(() => trigger?.blur());
      }
    };
  }, [character, openedByKeyboard, trigger]);

  if (!character) return null;

  return (
    <dialog
      ref={dialogRef}
      className="dream-dossier-dialog"
      tabIndex={-1}
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
          data-liquid-pointer="true"
          onClick={(event) => {
            onClose();
            if (event.detail !== 0) event.currentTarget.blur();
          }}
        >
          <LiquidPointerGlow />
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
  openedByKeyboard,
  trigger,
  onClose,
}: {
  record: DreamDolminence | null;
  openedByKeyboard: boolean;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !record) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    const stopSettling = settlePickupScroll(
      dialog,
      [
        ".dream-dossier-shell",
        ".dream-dossier-layout",
        ".dream-dossier-visuals",
        ".dream-dossier-copy",
      ],
      () => document.dispatchEvent(new CustomEvent("liquidrelayout")),
    );
    if (openedByKeyboard) closeRef.current?.focus({ preventScroll: true });
    else {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      dialog.focus({ preventScroll: true });
    }
    return () => {
      stopSettling();
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (openedByKeyboard) {
        window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
      } else {
        trigger?.blur();
        window.requestAnimationFrame(() => trigger?.blur());
      }
    };
  }, [openedByKeyboard, record, trigger]);

  if (!record) return null;

  return (
    <dialog
      ref={dialogRef}
      className="dream-dossier-dialog dream-dolminence-dialog"
      tabIndex={-1}
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
          data-liquid-pointer="true"
          onClick={(event) => {
            onClose();
            if (event.detail !== 0) event.currentTarget.blur();
          }}
        >
          <LiquidPointerGlow />
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
  const [previousPosterIndex, setPreviousPosterIndex] = useState<number | null>(null);
  const [posterLocked, setPosterLocked] = useState(false);
  const [posterShuffling, setPosterShuffling] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);
  const [posterMotionEnabled, setPosterMotionEnabled] = useState(true);
  const [character, setCharacter] = useState<DreamCharacter | null>(null);
  const [dolminenceRecord, setDolminenceRecord] = useState<DreamDolminence | null>(null);
  const [characterOpenedByKeyboard, setCharacterOpenedByKeyboard] = useState(false);
  const [dolminenceOpenedByKeyboard, setDolminenceOpenedByKeyboard] = useState(false);
  const characterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dolminenceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const posterSectionRef = useRef<HTMLElement | null>(null);
  const shuffleTimers = useRef<number[]>([]);
  const shuffleActive = useRef(false);
  const shuffleRunId = useRef(0);
  const activePoster = DREAM_POSTERS[posterIndex];
  const previousPoster =
    previousPosterIndex == null ? null : DREAM_POSTERS[previousPosterIndex];

  const cancelShuffle = useCallback(() => {
    shuffleRunId.current += 1;
    shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
    shuffleTimers.current = [];
    shuffleActive.current = false;
    setPosterShuffling(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.dreamChapter = "true";
    let disposeGlass: (() => void) | undefined;
    const frame = window.requestAnimationFrame(() => {
      disposeGlass = bootLiquidGlass(document);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      disposeGlass?.();
      delete document.documentElement.dataset.dreamChapter;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const sync = () => {
      const constrained =
        connection?.saveData ||
        connection?.effectiveType === "slow-2g" ||
        connection?.effectiveType === "2g";
      setPosterMotionEnabled(!document.hidden && !media.matches && !constrained);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    media.addEventListener?.("change", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      media.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    const section = posterSectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPosterVisible(entry.isIntersecting),
      { rootMargin: "240px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousPosterIndex == null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => setPreviousPosterIndex(null),
      reduced ? 0 : 720,
    );
    return () => window.clearTimeout(timer);
  }, [previousPosterIndex]);

  const selectPoster = useCallback((next: number) => {
    setPosterIndex((current) => {
      const wrapped = ((next % DREAM_POSTERS.length) + DREAM_POSTERS.length) % DREAM_POSTERS.length;
      if (wrapped !== current) setPreviousPosterIndex(current);
      return wrapped;
    });
  }, []);

  useEffect(() => {
    if (
      posterLocked ||
      posterShuffling ||
      !posterVisible ||
      !posterMotionEnabled ||
      menuOpen ||
      character != null ||
      dolminenceRecord != null
    ) return;
    const timer = window.setTimeout(() => {
      setPosterIndex((current) => {
        const next = (current + 1) % DREAM_POSTERS.length;
        setPreviousPosterIndex(current);
        return next;
      });
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [
    character,
    dolminenceRecord,
    menuOpen,
    posterIndex,
    posterLocked,
    posterMotionEnabled,
    posterShuffling,
    posterVisible,
  ]);

  useEffect(() => {
    if (!posterMotionEnabled || !posterVisible || menuOpen || character || dolminenceRecord) return;
    const timer = window.setTimeout(() => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = DREAM_POSTERS[(posterIndex + 1) % DREAM_POSTERS.length].src;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [character, dolminenceRecord, menuOpen, posterIndex, posterMotionEnabled, posterVisible]);

  useEffect(() => {
    if (
      !posterVisible ||
      !posterMotionEnabled ||
      menuOpen ||
      character != null ||
      dolminenceRecord != null
    ) {
      cancelShuffle();
    }
  }, [
    cancelShuffle,
    character,
    dolminenceRecord,
    menuOpen,
    posterMotionEnabled,
    posterVisible,
  ]);

  useEffect(
    () => () => {
      shuffleRunId.current += 1;
      shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
      shuffleTimers.current = [];
      shuffleActive.current = false;
    },
    [],
  );

  const shufflePosters = useCallback(() => {
    if (shuffleActive.current) return;

    const randomBelow = (upperBound: number) => {
      if (typeof window.crypto?.getRandomValues !== "function") {
        return Math.floor(Math.random() * upperBound);
      }
      const values = new Uint32Array(1);
      const rejectionLimit = Math.floor(0x1_0000_0000 / upperBound) * upperBound;
      do {
        window.crypto.getRandomValues(values);
      } while (values[0] >= rejectionLimit);
      return values[0] % upperBound;
    };

    const sequence = DREAM_POSTERS.map((_, index) => index).filter(
      (index) => index !== posterIndex,
    );
    for (let index = sequence.length - 1; index > 0; index -= 1) {
      const swapIndex = randomBelow(index + 1);
      let currentValue = sequence[index];
      let swapValue = sequence[swapIndex];
      [currentValue, swapValue] = [swapValue, currentValue];
      sequence[index] = currentValue;
      sequence[swapIndex] = swapValue;
    }
    const finalPoster = sequence.pop() ?? (posterIndex + 1) % DREAM_POSTERS.length;
    const previewPool = [
      posterIndex,
      previousPosterIndex ?? posterIndex,
      (posterIndex + 1) % DREAM_POSTERS.length,
      (posterIndex + 2) % DREAM_POSTERS.length,
    ].filter((value, index, values) => values.indexOf(value) === index);
    for (let index = previewPool.length - 1; index > 0; index -= 1) {
      const swapIndex = randomBelow(index + 1);
      [previewPool[index], previewPool[swapIndex]] = [previewPool[swapIndex], previewPool[index]];
    }
    const previews = Array.from(
      { length: 9 },
      (_, index) => previewPool[index % previewPool.length],
    );

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      selectPoster(finalPoster);
      return;
    }

    cancelShuffle();
    shuffleActive.current = true;
    const runId = shuffleRunId.current;
    setPosterShuffling(true);
    const finalImage = new Image();
    finalImage.decoding = "async";
    finalImage.fetchPriority = "high";
    finalImage.src = DREAM_POSTERS[finalPoster].src;
    const finalReady = finalImage.decode?.().catch(() => undefined) ?? Promise.resolve();
    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach(
      (delay, index, steps) => {
        const timer = window.setTimeout(async () => {
          if (index === steps.length - 1) {
            await Promise.race([
              finalReady,
              new Promise<void>((resolve) => window.setTimeout(resolve, 240)),
            ]);
          }
          if (!shuffleActive.current || shuffleRunId.current !== runId) return;
          const next =
            index === steps.length - 1
              ? finalPoster
              : previews[index % Math.max(previews.length, 1)] ?? finalPoster;
          selectPoster(next);
          if (index === steps.length - 1) {
            const settleTimer = window.setTimeout(() => {
              if (shuffleRunId.current !== runId) return;
              setPosterShuffling(false);
              shuffleActive.current = false;
              shuffleTimers.current = [];
            }, 300);
            shuffleTimers.current.push(settleTimer);
          }
        }, delay);
        shuffleTimers.current.push(timer);
      },
    );
  }, [cancelShuffle, posterIndex, previousPosterIndex, selectPoster]);

  return (
    <main id="top" className="dream-page">
      <header className="dream-site-header">
        <GuardedLink
          className="dream-back-link"
          to="/world"
          hash="top"
          assets={WORLD_ENTER_ASSETS}
          transition="dream"
        >
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
        <div className="dream-hero-field" aria-hidden="true">
          <span className="dream-aurora dream-aurora-blue" />
          <span className="dream-aurora dream-aurora-gold" />
          <span className="dream-light-gate" />
          <span className="dream-dream-grid" />
          <span className="dream-star-field dream-star-field-near" />
          <span className="dream-star-field dream-star-field-far" />
        </div>
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
            fetchPriority="high"
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
        ref={posterSectionRef}
        className="dream-section dream-poster-section"
        aria-labelledby="poster-title"
      >
        <header className="dream-section-heading">
          <p>KEY VISUAL ARCHIVE</p>
          <h2 id="poster-title">POSTERS</h2>
          <span>01 — 08</span>
        </header>

        <div className={`dream-poster-stage${posterShuffling ? " is-shuffling" : ""}`}>
          {previousPoster ? (
            <figure className="dream-poster-previous" aria-hidden="true">
              <img
                src={previousPoster.src}
                alt=""
                width={previousPoster.width}
                height={previousPoster.height}
                style={{
                  objectFit: previousPoster.fit,
                  objectPosition: previousPoster.position,
                }}
                decoding="async"
              />
            </figure>
          ) : null}
          <figure
            className="dream-poster-current"
            onAnimationEnd={() => setPreviousPosterIndex(null)}
          >
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
                className={`ios26-glass${posterIndex === index ? " is-active" : ""}`}
                data-liquid-pointer="true"
                onClick={(event) => {
                  cancelShuffle();
                  selectPoster(index);
                  if (event.detail !== 0) event.currentTarget.blur();
                }}
              >
                <LiquidPointerGlow />
                <img
                  src={`/dream-chapter-poster-thumb-${String(index + 1).padStart(2, "0")}.jpeg`}
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
          <div className="dream-poster-controls" aria-label="ポスター操作">
            <button
              type="button"
              className="dream-poster-shuffle ios26-glass"
              data-liquid-pointer="true"
              aria-label="ポスターをシャッフル"
              disabled={posterShuffling}
              onClick={(event) => {
                shufflePosters();
                if (event.detail !== 0) event.currentTarget.blur();
              }}
            >
              <LiquidPointerGlow />
              <span>SHUFFLE</span>
              <b aria-hidden="true">↝</b>
            </button>
            <button
              type="button"
              className="dream-poster-reset ios26-glass"
              data-liquid-pointer="true"
              aria-label="最初のポスターへ戻す"
              onClick={(event) => {
                cancelShuffle();
                selectPoster(0);
                if (event.detail !== 0) event.currentTarget.blur();
              }}
            >
              <LiquidPointerGlow />
              <span>RESET</span>
              <b aria-hidden="true">01</b>
            </button>
            <button
              type="button"
              className="dream-poster-lock ios26-glass"
              data-liquid-pointer="true"
              aria-label={
                posterLocked
                  ? "ポスターを固定解除して自動切替を再開"
                  : "ポスターを固定して自動切替を停止"
              }
              aria-pressed={posterLocked}
              onClick={(event) => {
                cancelShuffle();
                setPosterLocked((locked) => !locked);
                if (event.detail !== 0) event.currentTarget.blur();
              }}
            >
              <LiquidPointerGlow />
              <span>{posterLocked ? "UNLOCK" : "LOCK"}</span>
              <b aria-hidden="true">{posterLocked ? "◇" : "◆"}</b>
            </button>
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
                className="ios26-glass"
                data-liquid-pointer="true"
                onClick={(event) => {
                  characterTriggerRef.current = event.currentTarget;
                  setCharacterOpenedByKeyboard(event.detail === 0);
                  setDolminenceRecord(null);
                  setCharacter(item);
                  if (event.detail !== 0) event.currentTarget.blur();
                }}
                aria-label={`${item.name}の詳細を開く`}
              >
                <LiquidPointerGlow />
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
                className="ios26-glass"
                data-liquid-pointer="true"
                onClick={(event) => {
                  dolminenceTriggerRef.current = event.currentTarget;
                  setDolminenceOpenedByKeyboard(event.detail === 0);
                  setCharacter(null);
                  setDolminenceRecord(record);
                  if (event.detail !== 0) event.currentTarget.blur();
                }}
                aria-label={`${record.name}の機密資料を開く`}
              >
                <LiquidPointerGlow />
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
        <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS} transition="dream">
          DECEPTION WORLDへ戻る
        </GuardedLink>
      </footer>

      <CharacterDialog
        character={character}
        openedByKeyboard={characterOpenedByKeyboard}
        trigger={characterTriggerRef.current}
        onClose={() => setCharacter(null)}
      />
      <DolminenceDialog
        record={dolminenceRecord}
        openedByKeyboard={dolminenceOpenedByKeyboard}
        trigger={dolminenceTriggerRef.current}
        onClose={() => setDolminenceRecord(null)}
      />
    </main>
  );
}
