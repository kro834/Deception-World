import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { GuardedLink } from "@/components/load-gate";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";
import { LiquidPointerGlow } from "@/components/world/liquid-rail";
import { settlePickupScroll } from "@/components/world/pickup-scroll-reset";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { mountFilmMotion } from "@/lib/film-motion";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { FilmTextScan } from "@/components/cinematic/film-text-scan";
import {
  DREAM_CASES,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_POSTERS,
  DREAM_STORY_CROSSINGS,
  type DreamCharacter,
  type DreamDolminence,
} from "./dream-chapter-data";

type DreamSectionId = "posters" | "characters" | "dolminence" | "cases";

const DREAM_SECTION_LINKS: readonly { id: DreamSectionId; label: string; act: string }[] = [
  { id: "posters", label: "絵看板", act: "第一幕" },
  { id: "characters", label: "登場人物", act: "第二幕" },
  { id: "dolminence", label: "ドルミネンス", act: "第三幕" },
  { id: "cases", label: "物語", act: "第四幕" },
];

const KANJI_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** 1 → 一, 12 → 十二: Japanese numerals for ornamental captions. */
function toKanjiNumber(value: number) {
  if (value < 10) return KANJI_DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? "" : KANJI_DIGITS[tens]}十${ones ? KANJI_DIGITS[ones] : ""}`;
}

// Shared by the opening prologue; the story section keeps the spoiler note.
const DREAM_STORY_INTRO =
  "人の心に入り込む悪夢を追って、シエル、東風谷慶弥、怪作の道が交わる。幻想郷を巻き込む異変のなかで、三人は霊夢や魔理沙たちと関わり、それぞれの守るべきものと向き合っていく。";

function lockDreamViewport() {
  const root = document.documentElement;
  root.dataset.dreamDialogOpen = "true";
  const releaseViewportScrollLock = acquireViewportScrollLock({ freezeBody: true });

  return () => {
    delete root.dataset.dreamDialogOpen;
    releaseViewportScrollLock();
  };
}

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
    if (!dialog.open) dialog.showModal();
    const unlockViewport = lockDreamViewport();
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
      if (dialog.open) dialog.close();
      unlockViewport();
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
    if (!dialog.open) dialog.showModal();
    const unlockViewport = lockDreamViewport();
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
      if (dialog.open) dialog.close();
      unlockViewport();
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
  const [activeSection, setActiveSection] = useState<DreamSectionId | null>(null);
  const [posterIndex, setPosterIndex] = useState(0);
  const [previousPosterIndex, setPreviousPosterIndex] = useState<number | null>(null);
  const [posterLocked, setPosterLocked] = useState(false);
  const [posterShuffling, setPosterShuffling] = useState(false);
  const [posterControlsFocused, setPosterControlsFocused] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);
  const [heroVisible, setHeroVisible] = useState(true);
  const [posterMotionEnabled, setPosterMotionEnabled] = useState(true);
  const [character, setCharacter] = useState<DreamCharacter | null>(null);
  const [dolminenceRecord, setDolminenceRecord] = useState<DreamDolminence | null>(null);
  const [characterOpenedByKeyboard, setCharacterOpenedByKeyboard] = useState(false);
  const [dolminenceOpenedByKeyboard, setDolminenceOpenedByKeyboard] = useState(false);
  const characterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dolminenceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const posterSectionRef = useRef<HTMLElement | null>(null);
  const shuffleTimers = useRef<number[]>([]);
  const shuffleActive = useRef(false);
  const shuffleRunId = useRef(0);
  const activePoster = DREAM_POSTERS[posterIndex];
  const previousPoster = previousPosterIndex == null ? null : DREAM_POSTERS[previousPosterIndex];

  useEffect(() => mountFilmMotion(pageRef.current), []);

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

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const html = document.documentElement;
    const reveals = Array.from(page.querySelectorAll<HTMLElement>("[data-dream-reveal]"));
    html.dataset.dreamRevealReady = "true";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      reveals.forEach((element) => {
        element.dataset.dreamVisible = "true";
      });
      return () => {
        delete html.dataset.dreamRevealReady;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.dreamVisible = "true";
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12%", threshold: 0.08 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      delete html.dataset.dreamRevealReady;
    };
  }, []);

  useEffect(() => {
    const sections = DREAM_SECTION_LINKS.map(({ id }) => document.getElementById(id)).filter(
      (section): section is HTMLElement => section != null,
    );
    if (!sections.length) return;
    let frame = 0;
    const syncActiveSection = () => {
      frame = 0;
      const marker = Math.max(140, Math.min(320, window.innerHeight * 0.36));
      let current: DreamSectionId | null = null;
      sections.forEach((section) => {
        // A nav jump lands the section at its scroll margin, which can sit below
        // the marker on short landscape screens.
        const landing = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
        if (section.getBoundingClientRect().top <= Math.max(marker, landing + 8)) {
          current = section.id as DreamSectionId;
        }
      });
      setActiveSection(current);
    };
    const requestSectionSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncActiveSection);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestSectionSync);
    sections.forEach((section) => resizeObserver?.observe(section));
    window.addEventListener("scroll", requestSectionSync, { passive: true });
    window.addEventListener("resize", requestSectionSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestSectionSync, { passive: true });
    syncActiveSection();
    return () => {
      window.removeEventListener("scroll", requestSectionSync);
      window.removeEventListener("resize", requestSectionSync);
      window.visualViewport?.removeEventListener("resize", requestSectionSync);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
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
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), {
      rootMargin: "160px 0px",
      threshold: 0,
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = posterSectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPosterVisible(entry.isIntersecting), {
      rootMargin: "240px 0px",
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousPosterIndex == null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPreviousPosterIndex(null), reduced ? 0 : 720);
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
      posterControlsFocused ||
      !posterVisible ||
      !posterMotionEnabled ||
      menuOpen ||
      character != null ||
      dolminenceRecord != null
    )
      return;
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
    posterControlsFocused,
    posterVisible,
  ]);

  useEffect(() => {
    if (
      !posterMotionEnabled ||
      !posterVisible ||
      posterControlsFocused ||
      menuOpen ||
      character ||
      dolminenceRecord
    )
      return;
    const timer = window.setTimeout(() => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = DREAM_POSTERS[(posterIndex + 1) % DREAM_POSTERS.length].src;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    character,
    dolminenceRecord,
    menuOpen,
    posterControlsFocused,
    posterIndex,
    posterMotionEnabled,
    posterVisible,
  ]);

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
  }, [cancelShuffle, character, dolminenceRecord, menuOpen, posterMotionEnabled, posterVisible]);

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
    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach((delay, index, steps) => {
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
            : (previews[index % Math.max(previews.length, 1)] ?? finalPoster);
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
    });
  }, [cancelShuffle, posterIndex, previousPosterIndex, selectPoster]);

  return (
    <main ref={pageRef} id="top" className="dream-page">
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
          <span>KAMEN RIDER SAGA · THE MOVIE I</span>
          <b>ドリームチャプター</b>
        </p>
        <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
      </header>

      <SideMenuLayer context="movie" open={menuOpen} onOpenChange={setMenuOpen} />

      <nav className="dream-chapter-nav" aria-label="DREAM CHAPTER セクション">
        {DREAM_SECTION_LINKS.map(({ id, label, act }) => (
          <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
            <small>{act}</small>
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <section
        ref={heroRef}
        className="dream-hero"
        aria-labelledby="dream-title"
        data-dream-hero-active={heroVisible ? "true" : "false"}
      >
        <div className="dream-hero-field" aria-hidden="true">
          <img
            className="dream-hero-art"
            src="/dream-chapter-poster-05.jpeg"
            alt=""
            width={1448}
            height={1086}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <span className="dream-hero-vignette" aria-hidden="true" />
        <div className="dream-hero-title" aria-hidden="true">
          <span className="dream-hero-title-label">映画第一作</span>
          <span className="dream-hero-title-name">
            <span>ドリーム</span>
            <span>チャプター</span>
          </span>
        </div>
        <p className="dream-hero-catch">
          <span>夢と現実の境界が、</span>
          <span>明ける。</span>
        </p>
        <div className="dream-hero-copy">
          <p>仮面ライダーサーガ × 東方Project</p>
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
          <nav className="dream-hero-actions" aria-label="DREAM CHAPTERを探索">
            <a href="#posters">
              <small>壱</small>
              <span>絵看板を見る</span>
              <b>POSTERS</b>
            </a>
            <a href="#characters">
              <small>弐</small>
              <span>登場人物へ</span>
              <b>CAST</b>
            </a>
          </nav>
        </div>
        <div className="dream-hero-obi">
          <span>仮面ライダーサーガ × 東方Project</span>
          <i aria-hidden="true" />
          <span>映画第一作 THE MOVIE I</span>
          <i aria-hidden="true" />
          <span>劇場版第二作『ディセプションワールド』へ続く</span>
        </div>
      </section>

      <section className="dream-prologue" id="prologue" aria-labelledby="prologue-title">
        <div className="dream-prologue-card" data-dream-reveal>
          <h2 id="prologue-title">口上</h2>
          <p>{DREAM_STORY_INTRO}</p>
          <p className="dream-prologue-sign">
            <span>仮面ライダーサーガ × 東方Project</span>
            <span>映画第一作</span>
          </p>
        </div>
      </section>

      <section
        id="posters"
        ref={posterSectionRef}
        className="dream-section dream-poster-section"
        aria-labelledby="poster-title"
      >
        <header className="dream-section-heading" data-film-reveal>
          <FilmTextScan />
          <b className="dream-act-mark" aria-hidden="true">
            第一幕
          </b>
          <p>ACT I — KEY VISUALS</p>
          <h2 id="poster-title">絵看板</h2>
          <span>01 — {String(DREAM_POSTERS.length).padStart(2, "0")}</span>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>

        <div
          className={`dream-poster-stage${posterShuffling ? " is-shuffling" : ""}`}
          data-dream-reveal
          onFocusCapture={() => setPosterControlsFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setPosterControlsFocused(false);
            }
          }}
        >
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
            id="dream-poster-panel"
            className="dream-poster-current"
            role="tabpanel"
            aria-labelledby={`dream-poster-tab-${posterIndex}`}
            onAnimationEnd={(event) => {
              if (event.animationName === "dream-poster-enter") setPreviousPosterIndex(null);
            }}
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
              <span>其ノ{toKanjiNumber(posterIndex + 1)}</span>
              <b>{activePoster.alt}</b>
            </figcaption>
          </figure>
          <div className="dream-poster-thumbnails" role="tablist" aria-label="ポスターを選択">
            {DREAM_POSTERS.map((poster, index) => (
              <button
                key={poster.src}
                type="button"
                role="tab"
                id={`dream-poster-tab-${index}`}
                aria-controls="dream-poster-panel"
                aria-selected={posterIndex === index}
                tabIndex={posterIndex === index ? 0 : -1}
                className={`ios26-glass${posterIndex === index ? " is-active" : ""}`}
                data-liquid-pointer="true"
                onClick={(event) => {
                  cancelShuffle();
                  selectPoster(index);
                  if (event.detail !== 0) event.currentTarget.blur();
                }}
                onKeyDown={(event) => {
                  const last = DREAM_POSTERS.length - 1;
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? last
                        : event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? (index + 1) % DREAM_POSTERS.length
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? (index + last) % DREAM_POSTERS.length
                            : null;
                  if (next == null) return;
                  event.preventDefault();
                  cancelShuffle();
                  setPosterLocked(true);
                  selectPoster(next);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                    [next]?.focus();
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
              aria-disabled={posterShuffling}
              aria-busy={posterShuffling}
              onClick={(event) => {
                if (posterShuffling) return;
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
        <header className="dream-section-heading" data-film-reveal>
          <FilmTextScan />
          <b className="dream-act-mark" aria-hidden="true">
            第二幕
          </b>
          <p>ACT II — CAST</p>
          <h2 id="character-title">登場人物</h2>
          <span>03 FILES</span>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <div className="dream-character-grid" data-dream-reveal>
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
                aria-label={`${item.name} 人物資料を開く`}
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
                  <b>{item.name}</b>
                  <small>{item.tagline}</small>
                  <i>{item.roman}</i>
                  <em>人物資料を開く</em>
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
        <header className="dream-section-heading" data-film-reveal>
          <FilmTextScan />
          <b className="dream-act-mark" aria-hidden="true">
            第三幕
          </b>
          <p>ACT III — DOLMINENCE</p>
          <h2 id="dolminence-title">ドルミネンス</h2>
          <span>04 FILES</span>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <p className="dream-dolminence-intro" data-dream-reveal>
          夢と現実の境界で作戦を遂行する機密組織「ドルミネンス」。擬装システムと既存の変身装置を用いる、四つの記録を開示する。
        </p>
        <div className="dream-dolminence-grid" data-dream-reveal>
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
                aria-label={`${record.name} 機密記録を開く`}
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
                  <em>機密記録を開く</em>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="cases" className="dream-section dream-case-section" aria-labelledby="case-title">
        <header className="dream-section-heading" data-film-reveal>
          <FilmTextScan />
          <b className="dream-act-mark" aria-hidden="true">
            第四幕
          </b>
          <p>ACT IV — STORY</p>
          <h2 id="case-title">物語の記録</h2>
          <span>CASE 0–5 / DREAM CHAPTER</span>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <div className="dream-story-intro">
          <p>六つの章で、夢と現実の境界に起きた異変をたどる。</p>
          <p className="dream-story-scope" id="dream-story-scope">
            中盤までの内容を含みます。各章を開くとあらすじを読めます。Case 5は記録途中です。
          </p>
        </div>
        <div className="dream-story-layout">
          <aside className="dream-story-crossings" aria-labelledby="dream-crossings-title">
            <p className="dream-story-eyebrow">SAGA × TOUHOU PROJECT</p>
            <h3 id="dream-crossings-title">幻想郷との交差</h3>
            <p className="dream-story-crossings-lead">
              ただ同じ場所に集うのではなく、それぞれの立場から異変に関わっていく。
            </p>
            <dl>
              {DREAM_STORY_CROSSINGS.map((place, index) => (
                <div key={place.name}>
                  <dt>
                    <span aria-hidden="true">0{index + 1}</span>
                    {place.name}
                  </dt>
                  <dd>
                    <strong>{place.role}</strong>
                    <p>{place.body}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
          <ol
            className="dream-story-cases"
            aria-label="章ごとのあらすじ"
            aria-describedby="dream-story-scope"
          >
            {DREAM_CASES.map((episode) => (
              <li key={episode.no}>
                <details className="dream-story-case">
                  <summary>
                    <span className="dream-story-case-number">
                      CASE <b>{episode.no}</b>
                    </span>
                    <span className="dream-story-case-heading">
                      <span>{episode.title}</span>
                      <small>{episode.reading}</small>
                    </span>
                    {episode.no === "5" ? (
                      <span className="dream-story-case-status">記録途中</span>
                    ) : null}
                    <span className="dream-story-case-toggle" aria-hidden="true">
                      ＋
                    </span>
                  </summary>
                  <div className="dream-story-case-body">
                    <h3>{episode.lead}</h3>
                    {episode.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="dream-footer">
        <p>
          <span>仮面ライダーサーガ × 東方Project</span>
          <span>映画第一作</span>
        </p>
        <h2>
          <span>ドリームチャプター</span>
          <small>DREAM CHAPTER</small>
        </h2>
        <dl className="dream-credits" aria-label="登場記録">
          <div>
            <dt>登場人物</dt>
            <dd>
              {DREAM_CHARACTERS.map((item) => (
                <span key={item.id}>{item.name}</span>
              ))}
            </dd>
          </div>
          <div>
            <dt>ドルミネンス</dt>
            <dd>
              {DREAM_DOLMINENCE.map((record) => (
                <span key={record.id}>{record.name}</span>
              ))}
            </dd>
          </div>
          <div>
            <dt>舞台</dt>
            <dd>
              {DREAM_STORY_CROSSINGS.map((place) => (
                <span key={place.name}>{place.name}</span>
              ))}
            </dd>
          </div>
        </dl>
        <span className="dream-footer-end" aria-hidden="true">
          終
        </span>
        <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS} transition="dream">
          <span>ディセプションワールドへ戻る</span>
          <small>DECEPTION WORLD</small>
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
