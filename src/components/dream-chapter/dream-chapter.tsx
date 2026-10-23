import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { DREAM_CHAPTER_HERO_ART, DREAM_CHAPTER_LOGO, WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";
import { LiquidPointerGlow } from "@/components/world/liquid-rail";
import { settlePickupScroll } from "@/components/world/pickup-scroll-reset";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { mountFilmMotion } from "@/lib/film-motion";
import { holdFragmentPath, mountStableFragmentNavigation } from "@/lib/stable-fragment-navigation";
import { DisplayName } from "@/components/name-text";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { posterImage, preparePosterImage } from "@/lib/thumbnail-images";
import { createReadyPosterLoader } from "@/lib/ready-poster-loader";
import { dossierImage } from "@/lib/dossier-images";
import { FilmTextScan } from "@/components/cinematic/film-text-scan";
import {
  DREAM_AGENT_ROSTER,
  DREAM_CASE_NOTES,
  DREAM_CASES,
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_DOLMINENCE_RECORD,
  DREAM_FACTIONS,
  DREAM_GLOSSARY,
  DREAM_POSTERS,
  DREAM_QUOTES,
  DREAM_STORY_CROSSINGS,
  type DreamCharacter,
  type DreamDolminence,
} from "./dream-chapter-data";
import {
  AgentAdditions,
  AgentSupplement,
  DossierSupplement,
  DreamArsenal,
  DreamAtlas,
  DreamChronicle,
  DreamRelations,
  FactionMemberNote,
  FactionSupplement,
  GlossaryIndex,
  GlossarySupplement,
  RecordSupplement,
  RosterSupplement,
  VoicesLeaf,
} from "./dream-chapter-extra";
import {
  DREAM_ARCHIVE_CORNERS,
  DREAM_CHRONICLE,
  DREAM_RELATIONS,
  type DreamArchiveCornerId,
} from "./dream-chapter-extra-data";
import { DreamScreeningLauncher } from "./dream-screening-launcher";
import { DreamReadingLauncher } from "./dream-reading-launcher";
import { DreamProgrammeDesk } from "./dream-programme-desk";
import { DreamKarakuriCabinet } from "./dream-karakuri-cabinet";
import { DreamStageLantern } from "./dream-stage-lantern";
import { DreamGlossarySearch } from "./dream-glossary-search";
import { DreamDossierGuide } from "./dream-dossier-guide";
import {
  DreamChapterCompanion,
  DreamStoryBacklinks,
  DreamStoryIndex,
  DreamStoryNavigation,
} from "./dream-story-navigation";

/** An archive corner's title: the 目次 link and the corner's heading share it. */
const archiveCornerTitle = (id: DreamArchiveCornerId) =>
  DREAM_ARCHIVE_CORNERS.find((corner) => corner.id === id)?.title.text ?? id;

type DreamSectionId = "posters" | "characters" | "dolminence" | "cases";

const DREAM_SECTION_LINKS: readonly { id: DreamSectionId; label: string }[] = [
  { id: "posters", label: "絵看板" },
  { id: "characters", label: "登場人物" },
  { id: "dolminence", label: "ドルミネンス" },
  { id: "cases", label: "物語" },
];

// Scroll position belongs to the small act index, not the entire programme.
// Poster changes likewise do not need to render this navigation again.
const DreamSectionNav = memo(function DreamSectionNav() {
  const [activeSection, setActiveSection] = useState<DreamSectionId | null>(null);

  useEffect(() => {
    const sections = DREAM_SECTION_LINKS.map(({ id }) => document.getElementById(id)).filter(
      (section): section is HTMLElement => section != null,
    );
    if (!sections.length) return;
    let frame = 0;
    let active: DreamSectionId | null = null;
    let landings: number[] | null = null;
    const syncActiveSection = () => {
      frame = 0;
      if (document.hidden) return;
      const marker = Math.max(140, Math.min(320, window.innerHeight * 0.36));
      // Scroll margins only change with layout. Keep live bounds so image
      // loading, profile expansion and restored scroll positions stay correct.
      landings ??= sections.map(
        (section) => (parseFloat(getComputedStyle(section).scrollMarginTop) || 0) + 8,
      );
      let current: DreamSectionId | null = null;
      sections.forEach((section, index) => {
        if (section.getBoundingClientRect().top <= Math.max(marker, landings![index])) {
          current = section.id as DreamSectionId;
        }
      });
      if (current !== active) {
        active = current;
        setActiveSection(current);
      }
    };
    const requestSectionSync = () => {
      if (frame || document.hidden) return;
      frame = window.requestAnimationFrame(syncActiveSection);
    };
    const invalidateLayout = () => {
      landings = null;
      requestSectionSync();
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidateLayout);
    sections.forEach((section) => resizeObserver?.observe(section));
    window.addEventListener("scroll", requestSectionSync, { passive: true });
    window.addEventListener("resize", invalidateLayout, { passive: true });
    window.visualViewport?.addEventListener("resize", invalidateLayout, { passive: true });
    document.addEventListener("visibilitychange", invalidateLayout);
    syncActiveSection();
    return () => {
      window.removeEventListener("scroll", requestSectionSync);
      window.removeEventListener("resize", invalidateLayout);
      window.visualViewport?.removeEventListener("resize", invalidateLayout);
      document.removeEventListener("visibilitychange", invalidateLayout);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav className="dream-chapter-nav" aria-label="DREAM CHAPTER セクション">
      {DREAM_SECTION_LINKS.map(({ id, label }) => (
        <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
});

// The programme's contents: the four acts keep the act index above; each act
// gains its annex, and the appendix closes the page.
const DREAM_CONTENTS: readonly {
  act: string;
  links: readonly { href: string; label: string }[];
}[] = [
  { act: "第一幕", links: [{ href: "#posters", label: "絵看板" }] },
  {
    act: "第二幕",
    links: [
      { href: "#characters", label: "登場人物" },
      { href: "#cast-roster", label: "人物一覧" },
    ],
  },
  {
    act: "第三幕",
    links: [
      { href: "#dolminence", label: "ドルミネンス" },
      { href: "#factions", label: "組織と勢力" },
    ],
  },
  {
    act: "第四幕",
    links: [
      { href: "#cases", label: "物語" },
      { href: "#case-notes", label: "章の言葉" },
      // The archive corners close the act (their titles are the corners' own).
      { href: "#chronicle", label: archiveCornerTitle("chronicle") },
      { href: "#atlas", label: archiveCornerTitle("atlas") },
      { href: "#relations", label: archiveCornerTitle("relations") },
      { href: "#arsenal", label: archiveCornerTitle("arsenal") },
    ],
  },
  {
    act: "附録",
    links: [
      { href: "#glossary", label: "用語集" },
      { href: "#quotes", label: "名台詞" },
    ],
  },
];

/** "0" → "00"; letters stay as they are. */
function agentCode(code: string) {
  return /^\d+$/.test(code) ? code.padStart(2, "0") : code;
}

function QuoteFigure({ text, by }: { text: string; by?: string }) {
  return (
    <figure className="dream-annex-quote">
      <blockquote>
        <p>「{text}」</p>
      </blockquote>
      {by ? <figcaption>{by}</figcaption> : null}
    </figure>
  );
}

// Shared by the opening prologue; the story section keeps the spoiler note.
const DREAM_STORY_INTRO =
  "人の心を蝕む悪夢が、シエルを東風谷慶弥と探偵・怪作へ引き合わせる。追手を逃れて辿り着いた幻想郷では、怪作を狙うドルミネンスが人里を襲い、霊夢たちも戦いへ巻き込まれていく。家族を案じる慶弥と、誰にも頼れずにいるシエルは、夢の中で流れた血と、守ろうとした想いの重さを知る。";

function lockDreamViewport() {
  const root = document.documentElement;
  root.dataset.dreamDialogOpen = "true";
  const releaseViewportScrollLock = acquireViewportScrollLock({ freezeBody: true });

  return () => {
    delete root.dataset.dreamDialogOpen;
    releaseViewportScrollLock();
  };
}

function resolveSpecMeter(label: string, value: string): number | null {
  if (value.includes("計測不能") || value.includes("∞")) return 100;
  const numeric = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  switch (label) {
    case "HEIGHT":
      return Math.min(100, Math.max(24, Math.round((numeric / 225) * 100)));
    case "WEIGHT":
      return Math.min(100, Math.max(24, Math.round((numeric / 165) * 100)));
    case "PUNCH":
    case "KICK":
      return Math.min(100, Math.max(18, Math.round((Math.sqrt(numeric) / Math.sqrt(175)) * 100)));
    case "JUMP":
      return Math.min(100, Math.max(24, Math.round((numeric / 60) * 100)));
    case "RUN": {
      const secMatch = value.match(/(\d+(?:\.\d+)?)\s*秒/);
      const seconds = secMatch ? parseFloat(secMatch[1]) : numeric;
      return Math.min(100, Math.max(28, Math.round((1 - Math.min(seconds, 8) / 9.5) * 100)));
    }
    default:
      return null;
  }
}

const ROSTER_FILTERS = [
  { id: "all", label: "全て" },
  { id: "shrine", label: "神社・森・山" },
  { id: "nether", label: "冥界・紅魔・地底" },
  { id: "village", label: "人里・永守組・同行" },
  { id: "dream", label: "夢境・深層" },
] as const;

type RosterFilterId = (typeof ROSTER_FILTERS)[number]["id"];

function matchesRosterFilter(affiliation: string, filter: RosterFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "shrine") {
    return /博麗神社|幻想郷|守矢神社|魔法の森|烏天狗/.test(affiliation);
  }
  if (filter === "nether") {
    return /白玉楼|紅魔館|旧地獄/.test(affiliation);
  }
  if (filter === "village") {
    return /妹|人里|永守組|浪人/.test(affiliation);
  }
  if (filter === "dream") {
    return /ベルベットルーム|悪夢/.test(affiliation);
  }
  return true;
}

const DOSSIER_CHRONICLE_CAST: Record<string, readonly string[]> = {
  ciel: ["シエル"],
  keiya: ["慶弥", "東風谷慶弥"],
  kaisaku: ["怪作"],
  "lord-knight": ["ロードナイト", "ワン"],
  "lord-chaos": ["ロードケイオス", "ケイオス"],
  dread: ["シンソウ", "ドレッド", "エイト"],
  lupin: ["サヨ", "ルパン"],
};

function resolveDossierChronicleEvents(id: string) {
  const names = DOSSIER_CHRONICLE_CAST[id];
  if (!names) return [];
  return DREAM_CHRONICLE.filter((event) =>
    event.cast.some((member) => names.some((name) => member.includes(name))),
  );
}

function resolveDossierRelations(id: string) {
  const names = DOSSIER_CHRONICLE_CAST[id];
  if (!names) return [];
  return DREAM_RELATIONS.filter((tie) =>
    names.some((name) => tie.a.includes(name) || tie.b.includes(name)),
  );
}

function DossierContent({
  character,
  onSelect,
  onSelectDolminence,
  onClose,
}: {
  character: DreamCharacter;
  onSelect?: (next: DreamCharacter) => void;
  onSelectDolminence?: (next: DreamDolminence) => void;
  onClose?: () => void;
}) {
  const dossierRef = useRef<HTMLDivElement>(null);
  const [plateFocus, setPlateFocus] = useState<"split" | "primary" | "secondary">("split");
  useEffect(() => {
    setPlateFocus("split");
  }, [character.id]);
  const chronicleEvents = resolveDossierChronicleEvents(character.id);
  const relationTies = resolveDossierRelations(character.id);

  return (
    <div
      ref={dossierRef}
      className="dream-dossier-layout"
      style={{ ["--dream-accent" as string]: character.accent }}
    >
      <div
        className={`dream-dossier-visuals${character.secondary ? "" : " is-single"}`}
        data-ts-order={character.order}
        data-plate-focus={character.secondary ? plateFocus : undefined}
      >
        <figure>
          <img
            src={character.portrait}
            {...dossierImage(character.portrait)}
            alt={character.portraitAlt}
            width={character.id === "ciel" ? 1022 : character.id === "keiya" ? 736 : 638}
            height={character.id === "ciel" ? 1539 : character.id === "keiya" ? 976 : 630}
            style={{ objectPosition: character.portraitPosition }}
            decoding="async"
          />
        </figure>
        {character.secondary ? (
          <figure>
            <img
              src={character.secondary}
              {...dossierImage(character.secondary)}
              alt={character.secondaryAlt}
              width={character.id === "ciel" ? 846 : 1089}
              height={character.id === "ciel" ? 1219 : 1445}
              style={{ objectPosition: character.secondaryPosition }}
              decoding="async"
            />
          </figure>
        ) : null}
      </div>
      {character.secondary ? <i className="dream-dossier-rail-mark" aria-hidden="true" /> : null}

      <div className="dream-dossier-copy">
        {onSelect ? (
          <nav className="dream-dossier-switcher" aria-label="人物・機密ファイルの切り替え">
            {DREAM_CHARACTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-kind="cast"
                aria-current={item.id === character.id ? "true" : undefined}
                onClick={() => onSelect(item)}
              >
                <span>{item.name}</span>
              </button>
            ))}
            {onSelectDolminence
              ? DREAM_DOLMINENCE.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-kind="agent"
                    onClick={() => onSelectDolminence(item)}
                  >
                    <span>{item.name}</span>
                  </button>
                ))
              : null}
          </nav>
        ) : null}

        {character.secondary ? (
          <div className="dream-dossier-plate-controls" role="group" aria-label="図版表示モード">
            <button
              type="button"
              aria-pressed={plateFocus === "split"}
              onClick={() => setPlateFocus("split")}
            >
              並置表示
            </button>
            <button
              type="button"
              aria-pressed={plateFocus === "primary"}
              onClick={() => setPlateFocus("primary")}
            >
              第一図版拡大
            </button>
            <button
              type="button"
              aria-pressed={plateFocus === "secondary"}
              onClick={() => setPlateFocus("secondary")}
            >
              第二図版拡大
            </button>
          </div>
        ) : null}

        <DreamDossierGuide scope={dossierRef} recordId={character.id} name={character.name} />

        <header className="dream-dossier-title">
          <span>{character.tagline}</span>
          <h2>{character.name}</h2>
          <small>{character.role}</small>
        </header>

        {character.quotes?.map((quote) => (
          <blockquote key={quote}>「{quote}」</blockquote>
        ))}

        <dl className="dream-profile-grid">
          {character.profile.map((row) => {
            const meter = resolveSpecMeter(row.label, row.value);
            return (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
                {meter != null ? (
                  <span className="dream-profile-meter" aria-hidden="true">
                    <i style={{ width: `${meter}%` }} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </dl>

        <div className="dream-dossier-sections">
          {character.sections.map((section) => (
            <section key={section.title}>
              <header>
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
          <DossierSupplement id={character.id} after={character.sections.length} />
          {relationTies.length ? (
            <section className="dream-dossier-relations-links">
              <header>
                <h3>因縁・関係性の記録</h3>
              </header>
              <ol className="dream-dossier-relations-grid">
                {relationTies.map((tie) => (
                  <li key={`${tie.a}/${tie.b}/${tie.label.lines}`}>
                    <a href="#relations" onClick={() => onClose?.()}>
                      <small>{tie.circle}</small>
                      <strong>
                        {tie.a} ⇄ {tie.b}
                      </strong>
                      <span>{tie.label.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {chronicleEvents.length ? (
            <section className="dream-dossier-chronicle-links">
              <header>
                <h3>登場する出来事の記録</h3>
              </header>
              <ol className="dream-dossier-chronicle-grid">
                {chronicleEvents.slice(0, 12).map((event) => (
                  <li key={event.no}>
                    <a href={`#dream-chronicle-event-${event.no}`} onClick={() => onClose?.()}>
                      <small>CASE {event.case}</small>
                      <strong>{event.title.text}</strong>
                      <span>{event.place}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
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
  onSelect,
  onSelectDolminence,
}: {
  character: DreamCharacter | null;
  openedByKeyboard: boolean;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  onSelect?: (next: DreamCharacter) => void;
  onSelectDolminence?: (next: DreamDolminence) => void;
}) {
  const router = useRouter();
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
    let historyDismissed = false;
    const stopHistory = router.history.subscribe(({ action }) => {
      if (action.type !== "BACK" && action.type !== "FORWARD" && action.type !== "GO") return;
      historyDismissed = true;
      stopSettling();
      if (dialog.open) dialog.close();
      // Release the frozen departure offset before history restores its destination.
      unlockViewport();
      onClose();
    });
    return () => {
      stopHistory();
      stopSettling();
      if (dialog.open) dialog.close();
      unlockViewport();
      if (openedByKeyboard && !historyDismissed) {
        window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
      } else {
        trigger?.blur();
        window.requestAnimationFrame(() => trigger?.blur());
      }
    };
  }, [character, onClose, openedByKeyboard, router, trigger]);

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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <DossierContent
          character={character}
          onSelect={onSelect}
          onSelectDolminence={onSelectDolminence}
          onClose={onClose}
        />
      </div>
    </dialog>
  );
}

function DolminenceContent({
  record,
  onSelect,
  onSelectCharacter,
  onClose,
}: {
  record: DreamDolminence;
  onSelect?: (next: DreamDolminence) => void;
  onSelectCharacter?: (next: DreamCharacter) => void;
  onClose?: () => void;
}) {
  const dossierRef = useRef<HTMLDivElement>(null);
  const [plateFocus, setPlateFocus] = useState<"split" | "primary" | "secondary">("split");
  useEffect(() => {
    setPlateFocus("split");
  }, [record.id]);
  const chronicleEvents = resolveDossierChronicleEvents(record.id);
  const relationTies = resolveDossierRelations(record.id);

  return (
    <div
      ref={dossierRef}
      className="dream-dossier-layout dream-dolminence-dossier"
      style={{ ["--dream-accent" as string]: record.accent }}
    >
      <div
        className={`dream-dossier-visuals dream-dolminence-visuals${record.secondary ? "" : " is-single"}`}
        data-ts-order={record.order}
        data-plate-focus={record.secondary ? plateFocus : undefined}
      >
        <figure>
          <img
            src={record.image}
            {...dossierImage(record.image)}
            alt={record.imageAlt}
            width={record.imageWidth}
            height={record.imageHeight}
            style={{ objectPosition: record.imagePosition }}
            decoding="async"
          />
        </figure>
        {record.secondary ? (
          <figure>
            <img
              src={record.secondary}
              {...dossierImage(record.secondary)}
              alt={record.secondaryAlt}
              width={record.secondaryWidth}
              height={record.secondaryHeight}
              style={{ objectPosition: record.secondaryPosition }}
              decoding="async"
            />
          </figure>
        ) : null}
      </div>
      {record.secondary ? <i className="dream-dossier-rail-mark" aria-hidden="true" /> : null}

      <div className="dream-dossier-copy">
        {onSelect ? (
          <nav className="dream-dossier-switcher" aria-label="人物・機密ファイルの切り替え">
            {onSelectCharacter
              ? DREAM_CHARACTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-kind="cast"
                    onClick={() => onSelectCharacter(item)}
                  >
                    <span>{item.name}</span>
                  </button>
                ))
              : null}
            {DREAM_DOLMINENCE.map((item) => (
              <button
                key={item.id}
                type="button"
                data-kind="agent"
                aria-current={item.id === record.id ? "true" : undefined}
                onClick={() => onSelect(item)}
              >
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {record.secondary ? (
          <div className="dream-dossier-plate-controls" role="group" aria-label="図版表示モード">
            <button
              type="button"
              aria-pressed={plateFocus === "split"}
              onClick={() => setPlateFocus("split")}
            >
              並置表示
            </button>
            <button
              type="button"
              aria-pressed={plateFocus === "primary"}
              onClick={() => setPlateFocus("primary")}
            >
              第一図版拡大
            </button>
            <button
              type="button"
              aria-pressed={plateFocus === "secondary"}
              onClick={() => setPlateFocus("secondary")}
            >
              設定画拡大
            </button>
          </div>
        ) : null}

        <DreamDossierGuide scope={dossierRef} recordId={record.id} name={record.name} />

        <header className="dream-dossier-title">
          {/* The name breaks at its seam (仮面ライダー / ルパン), never before its last kana. */}
          <h2>
            <DisplayName value={record.name} />
          </h2>
          <small>{record.agent}</small>
        </header>

        <dl className="dream-profile-grid">
          {record.profile.map((row) => {
            const meter = resolveSpecMeter(row.label, row.value);
            return (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
                {meter != null ? (
                  <span className="dream-profile-meter" aria-hidden="true">
                    <i style={{ width: `${meter}%` }} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </dl>

        <div className="dream-dossier-sections">
          <section>
            <header>
              <h3>機密記録</h3>
            </header>
            {record.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
          <section>
            <header>
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
          <DossierSupplement id={record.id} after={2} />
          {relationTies.length ? (
            <section className="dream-dossier-relations-links">
              <header>
                <h3>因縁・関係性の記録</h3>
              </header>
              <ol className="dream-dossier-relations-grid">
                {relationTies.map((tie) => (
                  <li key={`${tie.a}/${tie.b}/${tie.label.lines}`}>
                    <a href="#relations" onClick={() => onClose?.()}>
                      <small>{tie.circle}</small>
                      <strong>
                        {tie.a} ⇄ {tie.b}
                      </strong>
                      <span>{tie.label.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {chronicleEvents.length ? (
            <section className="dream-dossier-chronicle-links">
              <header>
                <h3>交戦・出現の記録</h3>
              </header>
              <ol className="dream-dossier-chronicle-grid">
                {chronicleEvents.slice(0, 12).map((event) => (
                  <li key={event.no}>
                    <a href={`#dream-chronicle-event-${event.no}`} onClick={() => onClose?.()}>
                      <small>CASE {event.case}</small>
                      <strong>{event.title.text}</strong>
                      <span>{event.place}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
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
  onSelect,
  onSelectCharacter,
}: {
  record: DreamDolminence | null;
  openedByKeyboard: boolean;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  onSelect?: (next: DreamDolminence) => void;
  onSelectCharacter?: (next: DreamCharacter) => void;
}) {
  const router = useRouter();
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
    let historyDismissed = false;
    const stopHistory = router.history.subscribe(({ action }) => {
      if (action.type !== "BACK" && action.type !== "FORWARD" && action.type !== "GO") return;
      historyDismissed = true;
      stopSettling();
      if (dialog.open) dialog.close();
      unlockViewport();
      onClose();
    });
    return () => {
      stopHistory();
      stopSettling();
      if (dialog.open) dialog.close();
      unlockViewport();
      if (openedByKeyboard && !historyDismissed) {
        window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
      } else {
        trigger?.blur();
        window.requestAnimationFrame(() => trigger?.blur());
      }
    };
  }, [onClose, openedByKeyboard, record, router, trigger]);

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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <DolminenceContent
          record={record}
          onSelect={onSelect}
          onSelectCharacter={onSelectCharacter}
          onClose={onClose}
        />
      </div>
    </dialog>
  );
}

export function DreamChapter() {
  useWorldMode();
  const dossierHash = useRouterState({ select: (state) => state.location.hash });
  const [menuOpen, setMenuOpen] = useState(false);
  const [posterIndex, setPosterIndex] = useState(0);
  const [previousPosterIndex, setPreviousPosterIndex] = useState<number | null>(null);
  const [posterLocked, setPosterLocked] = useState(false);
  const [posterShuffling, setPosterShuffling] = useState(false);
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterLoadFailed, setPosterLoadFailed] = useState(false);
  const [posterControlsFocused, setPosterControlsFocused] = useState(false);
  const [screeningActive, setScreeningActive] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);
  const [heroVisible, setHeroVisible] = useState(true);
  const [posterMotionEnabled, setPosterMotionEnabled] = useState(true);
  const [character, setCharacter] = useState<DreamCharacter | null>(null);
  const [dolminenceRecord, setDolminenceRecord] = useState<DreamDolminence | null>(null);
  const [characterOpenedByKeyboard, setCharacterOpenedByKeyboard] = useState(false);
  const [dolminenceOpenedByKeyboard, setDolminenceOpenedByKeyboard] = useState(false);
  const closeCharacter = useCallback(() => setCharacter(null), []);
  const closeDolminenceRecord = useCallback(() => setDolminenceRecord(null), []);
  // 人物一覧 on phones: each profile sits behind its PROFILE switch
  // (styles-dream-annex.css shows every profile on tablets and desktops and
  // hides the switch there, so the server markup is right at every width).
  const [openProfiles, setOpenProfiles] = useState<ReadonlySet<string>>(() => new Set());
  const [rosterFilter, setRosterFilter] = useState<RosterFilterId>("all");
  const characterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dolminenceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const posterSectionRef = useRef<HTMLElement | null>(null);
  const shuffleTimers = useRef<number[]>([]);
  const shuffleActive = useRef(false);
  const shuffleRunId = useRef(0);
  const posterSelectionId = useRef(0);
  const posterLoader = useRef<ReturnType<typeof createReadyPosterLoader> | null>(null);
  const activePoster = DREAM_POSTERS[posterIndex];
  const previousPoster = previousPosterIndex == null ? null : DREAM_POSTERS[previousPosterIndex];

  useEffect(() => mountFilmMotion(pageRef.current), []);
  useEffect(() => mountStableFragmentNavigation(pageRef.current), []);

  // Search links identify the existing record card. The same dialog and its
  // history dismissal/focus cleanup handle direct arrivals and revisits.
  const openDossier = useCallback((hash: string) => {
    let id: string;
    try {
      id = decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
      return false;
    }
    const targetCharacter = DREAM_CHARACTERS.find((item) => id === `dream-character-${item.id}`);
    const targetRecord = DREAM_DOLMINENCE.find((item) => id === `dream-dolminence-${item.id}`);
    if (!targetCharacter && !targetRecord) return false;
    const trigger = document.getElementById(id);
    if (!(trigger instanceof HTMLButtonElement) || !pageRef.current?.contains(trigger))
      return false;
    setMenuOpen(false);
    if (targetCharacter) {
      characterTriggerRef.current = trigger;
      setCharacterOpenedByKeyboard(true);
      setDolminenceRecord(null);
      setCharacter(targetCharacter);
    } else if (targetRecord) {
      dolminenceTriggerRef.current = trigger;
      setDolminenceOpenedByKeyboard(true);
      setCharacter(null);
      setDolminenceRecord(targetRecord);
    }
    return true;
  }, []);
  useLayoutEffect(() => {
    openDossier(dossierHash);
  }, [dossierHash, openDossier]);

  // Closing a record leaves its fragment in the address bar. Its next explicit
  // link visit still opens the file even though the router's hash is unchanged.
  const revisitDossier = (event: MouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (
      !link ||
      !event.currentTarget.contains(link) ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download") ||
      link.getAttribute("href") !== window.location.hash
    )
      return;
    if (openDossier(link.hash)) event.preventDefault();
  };

  // A search result that names a record inside a section (a roster plate, a
  // faction, a term) lands on it whole: the skipped sections above it are
  // laid out at their real heights while the landing aligns, its block is
  // shown at once instead of waiting for its reveal, and a roster plate opens
  // its PROFILE (the matched words are in it).
  useLayoutEffect(() => {
    const page = pageRef.current;
    let id: string;
    try {
      id = decodeURIComponent(dossierHash.replace(/^#/, ""));
    } catch {
      return;
    }
    if (!page || !id || id === "top") return;
    if (id.startsWith("dream-character-") || id.startsWith("dream-dolminence-")) return;
    const target = document.getElementById(id);
    if (!target || !page.contains(target) || !target.closest(".dream-section, .dream-annex")) {
      return;
    }
    const release = holdFragmentPath(page, target);
    const reveal = target.closest<HTMLElement>("[data-dream-reveal]");
    let frame = 0;
    if (reveal && reveal.dataset.dreamVisible !== "true") {
      reveal.style.transition = "none";
      reveal.dataset.dreamVisible = "true";
      frame = window.requestAnimationFrame(() => reveal.style.removeProperty("transition"));
    }
    const rosterEntry = DREAM_CAST_ROSTER.find((entry) => id === `dream-roster-${entry.id}`);
    if (rosterEntry) {
      setOpenProfiles((current) =>
        current.has(rosterEntry.id) ? current : new Set(current).add(rosterEntry.id),
      );
    }
    return () => {
      window.cancelAnimationFrame(frame);
      release();
    };
  }, [dossierHash]);

  const cancelShuffle = useCallback(() => {
    posterSelectionId.current += 1;
    setPosterLoading(false);
    setPosterLoadFailed(false);
    shuffleRunId.current += 1;
    shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
    shuffleTimers.current = [];
    shuffleActive.current = false;
    setPosterShuffling(false);
  }, []);

  const loadPoster = useCallback((index: number, priority: "high" | "low" = "high") => {
    posterLoader.current ??= createReadyPosterLoader(preparePosterImage);
    return posterLoader.current.load(DREAM_POSTERS[index].src, priority);
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
    // Economy rendering shows every block at once, as reduced motion does
    // (styles-dream-chapter.css also covers a switch made after this runs).
    const economy = html.dataset.worldEffects === "economy";
    if (reducedMotion || economy || typeof IntersectionObserver === "undefined") {
      reveals.forEach((element) => {
        element.dataset.dreamVisible = "true";
      });
      return () => {
        delete html.dataset.dreamRevealReady;
      };
    }
    // A block reveals when its top crosses the line 12% above the foot of
    // the screen, however tall it is: a ratio threshold never fired for a
    // block taller than the screen over that ratio (the glossary on a short
    // landscape phone stayed blank).
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.dreamVisible = "true";
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12%", threshold: 0 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      delete html.dataset.dreamRevealReady;
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

  const commitPoster = useCallback((next: number) => {
    setPosterLoadFailed(false);
    setPosterIndex((current) => {
      const wrapped = ((next % DREAM_POSTERS.length) + DREAM_POSTERS.length) % DREAM_POSTERS.length;
      if (wrapped !== current) setPreviousPosterIndex(current);
      return wrapped;
    });
  }, []);

  const selectPoster = useCallback(
    (next: number) => {
      const wrapped = ((next % DREAM_POSTERS.length) + DREAM_POSTERS.length) % DREAM_POSTERS.length;
      const selection = ++posterSelectionId.current;
      setPosterLoading(true);
      setPosterLoadFailed(false);
      void loadPoster(wrapped).then((ready) => {
        if (selection !== posterSelectionId.current) return;
        if (ready) commitPoster(wrapped);
        setPosterLoadFailed(!ready);
        setPosterLoading(false);
      });
    },
    [commitPoster, loadPoster],
  );

  useEffect(() => {
    if (
      posterLocked ||
      posterShuffling ||
      posterLoading ||
      posterControlsFocused ||
      screeningActive ||
      !posterVisible ||
      !posterMotionEnabled ||
      menuOpen ||
      character != null ||
      dolminenceRecord != null
    )
      return;
    let cancelled = false;
    const selection = posterSelectionId.current;
    let retryDelay = 5200;
    let timer: number;
    const advance = () => {
      const next = (posterIndex + 1) % DREAM_POSTERS.length;
      void loadPoster(next, "low").then((ready) => {
        if (cancelled || selection !== posterSelectionId.current) return;
        if (ready) commitPoster(next);
        else {
          // A temporary network failure must not silently stop unlocked autoplay.
          timer = window.setTimeout(advance, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      });
    };
    timer = window.setTimeout(advance, 5200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    commitPoster,
    loadPoster,
    character,
    dolminenceRecord,
    menuOpen,
    posterIndex,
    posterLocked,
    posterMotionEnabled,
    posterShuffling,
    posterLoading,
    posterControlsFocused,
    screeningActive,
    posterVisible,
  ]);

  useEffect(() => {
    if (
      !posterMotionEnabled ||
      !posterVisible ||
      posterControlsFocused ||
      screeningActive ||
      menuOpen ||
      character ||
      dolminenceRecord
    )
      return;
    const timer = window.setTimeout(() => {
      void loadPoster((posterIndex + 1) % DREAM_POSTERS.length, "low");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    loadPoster,
    character,
    dolminenceRecord,
    menuOpen,
    posterControlsFocused,
    screeningActive,
    posterIndex,
    posterMotionEnabled,
    posterVisible,
  ]);

  useEffect(() => {
    if (
      !posterVisible ||
      !posterMotionEnabled ||
      menuOpen ||
      screeningActive ||
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
    screeningActive,
  ]);

  const handleScreeningActive = useCallback(
    (active: boolean) => {
      if (active) cancelShuffle();
      setScreeningActive(active);
    },
    [cancelShuffle],
  );

  useEffect(
    () => () => {
      posterSelectionId.current += 1;
      posterLoader.current?.dispose();
      posterLoader.current = null;
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

    cancelShuffle();
    shuffleActive.current = true;
    const runId = shuffleRunId.current;
    setPosterShuffling(true);
    const finalReady = loadPoster(finalPoster);
    const finish = (ready: boolean) => {
      if (!shuffleActive.current || shuffleRunId.current !== runId) return;
      if (ready) commitPoster(finalPoster);
      setPosterLoadFailed(!ready);
      setPosterShuffling(false);
      shuffleActive.current = false;
      shuffleTimers.current = [];
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void finalReady.then(finish);
      return;
    }

    const previewReady = new Set<number>();
    previewPool.forEach((index) => {
      void loadPoster(index, "low").then((ready) => {
        if (ready && shuffleRunId.current === runId) previewReady.add(index);
      });
    });
    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach((delay, index, steps) => {
      const timer = window.setTimeout(async () => {
        const final = index === steps.length - 1;
        const ready = final ? await finalReady : false;
        if (!shuffleActive.current || shuffleRunId.current !== runId) return;
        if (final) {
          if (ready) commitPoster(finalPoster);
          const settleTimer = window.setTimeout(() => {
            finish(ready);
          }, 300);
          shuffleTimers.current.push(settleTimer);
        } else {
          const next = previews[index % previews.length];
          if (previewReady.has(next)) commitPoster(next);
        }
      }, delay);
      shuffleTimers.current.push(timer);
    });
  }, [cancelShuffle, commitPoster, loadPoster, posterIndex, previousPosterIndex]);

  return (
    <main ref={pageRef} id="top" className="dream-page" onClickCapture={revisitDossier}>
      <header className="dream-site-header">
        <GuardedLink
          className="dream-back-link"
          to="/world"
          hash="top"
          assets={WORLD_ENTER_ASSETS}
          transition="dream"
          aria-label="ディセプションワールドへ戻る"
        >
          <span aria-hidden="true">←</span>
          <span>DECEPTION WORLD</span>
        </GuardedLink>
        <p>
          <b>ドリームチャプター</b>
        </p>
        <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
      </header>

      <SideMenuLayer context="movie" open={menuOpen} onOpenChange={setMenuOpen} />

      <DreamSectionNav />

      <section
        ref={heroRef}
        className="dream-hero"
        aria-labelledby="dream-title"
        data-dream-hero-active={heroVisible ? "true" : "false"}
      >
        <div className="dream-hero-field" aria-hidden="true">
          <img
            className="dream-hero-art"
            src={DREAM_CHAPTER_HERO_ART}
            alt=""
            width={1448}
            height={1086}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <span className="dream-hero-vignette" aria-hidden="true" />
        <span className="dream-hero-lamplight" aria-hidden="true" />
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
            src={DREAM_CHAPTER_LOGO}
            alt="仮面ライダーサーガ Dream Chapter"
            width="1280"
            height="731"
            fetchPriority="high"
            decoding="async"
          />
          <nav className="dream-hero-actions" aria-label="DREAM CHAPTERを探索">
            <a href="#posters">
              <span>絵看板を見る</span>
            </a>
            <a href="#characters">
              <span>登場人物へ</span>
            </a>
          </nav>
          <DreamStageLantern />
        </div>
        <div className="dream-hero-obi">
          <i aria-hidden="true" />
          <span>劇場版第二作『ディセプションワールド』へ続く</span>
          <i aria-hidden="true" />
        </div>
      </section>

      <section className="dream-prologue" id="prologue" aria-labelledby="prologue-title">
        <div className="dream-prologue-card" data-dream-reveal>
          <h2 id="prologue-title">口上</h2>
          <p>{DREAM_STORY_INTRO}</p>
        </div>
      </section>

      <DreamKarakuriCabinet />
      <DreamProgrammeDesk />
      <nav className="dream-contents" aria-labelledby="dream-contents-title" data-dream-reveal>
        <h2 id="dream-contents-title">目次</h2>
        <ol>
          {DREAM_CONTENTS.map(({ act, links }) => (
            <li key={act}>
              <small>{act}</small>
              {links.map(({ href, label }) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </li>
          ))}
        </ol>
      </nav>

      <section
        id="posters"
        ref={posterSectionRef}
        className="dream-section dream-poster-section"
        aria-labelledby="poster-title"
      >
        <header className="dream-section-heading" data-film-reveal data-ts-numeral="I">
          <img
            className="dream-act-still"
            aria-hidden="true"
            src={DREAM_POSTERS[9].src}
            {...posterImage(DREAM_POSTERS[9].src)}
            alt=""
            loading="lazy"
            decoding="async"
            width={DREAM_POSTERS[9].width}
            height={DREAM_POSTERS[9].height}
          />
          <FilmTextScan />
          <i className="dream-act-mark" aria-hidden="true" />
          <h2 id="poster-title">絵看板</h2>
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
                {...posterImage(previousPoster.src)}
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
            aria-busy={posterLoading || posterShuffling}
            onAnimationEnd={(event) => {
              if (event.animationName === "dream-poster-enter") setPreviousPosterIndex(null);
            }}
          >
            <img
              key={activePoster.src}
              src={activePoster.src}
              {...posterImage(activePoster.src)}
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
              <i
                className="dream-poster-progress"
                aria-hidden="true"
                style={{ width: `${((posterIndex + 1) / DREAM_POSTERS.length) * 100}%` }}
              />
              <b>{activePoster.alt}</b>
              <DreamScreeningLauncher
                index={posterIndex}
                onActiveChange={handleScreeningActive}
                onSelection={selectPoster}
              />
            </figcaption>
            <p
              className="dream-poster-load-status"
              role="status"
              hidden={!posterLoadFailed && !posterLoading}
            >
              {posterLoadFailed
                ? "画像を読み込めませんでした。もう一度選択してください。"
                : posterLoading
                  ? "ポスターを読み込み中です。"
                  : ""}
            </p>
            <div className="dream-poster-hud">
              <div className="dream-poster-hud-step" role="group" aria-label="ポスター送り">
                <button
                  type="button"
                  aria-label="前のポスターを表示"
                  onClick={(event) => {
                    cancelShuffle();
                    selectPoster((posterIndex - 1 + DREAM_POSTERS.length) % DREAM_POSTERS.length);
                    if (event.detail !== 0) event.currentTarget.blur();
                  }}
                >
                  <span aria-hidden="true">◀</span>
                </button>
                <button
                  type="button"
                  aria-label="次のポスターを表示"
                  onClick={(event) => {
                    cancelShuffle();
                    selectPoster((posterIndex + 1) % DREAM_POSTERS.length);
                    if (event.detail !== 0) event.currentTarget.blur();
                  }}
                >
                  <span aria-hidden="true">▶</span>
                </button>
              </div>
            </div>
          </figure>
          <div className="dream-poster-thumbnails" role="tablist" aria-label="ポスターを選択">
            {DREAM_POSTERS.map((poster, index) => (
              <button
                key={poster.src}
                type="button"
                role="tab"
                id={`dream-poster-tab-${index}`}
                aria-label={`${index + 1}番: ${poster.alt}`}
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
        <header className="dream-section-heading" data-film-reveal data-ts-numeral="II">
          <img
            className="dream-act-still"
            aria-hidden="true"
            src={DREAM_POSTERS[3].src}
            {...posterImage(DREAM_POSTERS[3].src)}
            alt=""
            loading="lazy"
            decoding="async"
            width={DREAM_POSTERS[3].width}
            height={DREAM_POSTERS[3].height}
          />
          <FilmTextScan />
          <i className="dream-act-mark" aria-hidden="true" />
          <h2 id="character-title">登場人物</h2>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <div className="dream-character-grid" data-dream-reveal>
          {DREAM_CHARACTERS.map((item) => (
            <article key={item.id} style={{ ["--dream-accent" as string]: item.accent }}>
              <button
                id={`dream-character-${item.id}`}
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
                  {...dossierImage(item.portrait)}
                  alt={item.portraitAlt}
                  width={item.id === "ciel" ? 1022 : item.id === "keiya" ? 736 : 638}
                  height={item.id === "ciel" ? 1539 : item.id === "keiya" ? 976 : 630}
                  style={{ objectPosition: item.portraitPosition }}
                  loading="lazy"
                  decoding="async"
                />
                <span className="dream-character-shade" aria-hidden="true" />
                <span className="dream-character-copy">
                  <b>{item.name}</b>
                  <small>{item.tagline}</small>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="cast-roster" className="dream-annex" aria-labelledby="cast-roster-title">
        <header className="dream-annex-heading">
          <h2 id="cast-roster-title">人物一覧</h2>
        </header>
        <div className="dream-roster-toolbar" role="toolbar" aria-label="人物一覧の絞り込み">
          <div className="dream-roster-filters">
            {ROSTER_FILTERS.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={rosterFilter === group.id}
                onClick={() => setRosterFilter(group.id)}
              >
                <span>{group.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dream-roster-bulk"
            onClick={() =>
              setOpenProfiles((current) =>
                current.size === DREAM_CAST_ROSTER.length
                  ? new Set()
                  : new Set(DREAM_CAST_ROSTER.map((entry) => entry.id)),
              )
            }
          >
            {openProfiles.size === DREAM_CAST_ROSTER.length
              ? "全プロフィールを閉じる"
              : "全プロフィールを展開"}
          </button>
        </div>
        <ol className="dream-roster" data-dream-reveal>
          {DREAM_CAST_ROSTER.map((entry) => (
            <li
              key={entry.id}
              data-roster-dimmed={
                !matchesRosterFilter(entry.affiliation, rosterFilter) ? "true" : undefined
              }
            >
              <article aria-labelledby={`dream-roster-${entry.id}`}>
                <p className="dream-roster-affiliation">{entry.affiliation}</p>
                <h3 id={`dream-roster-${entry.id}`}>{entry.name}</h3>
                <QuoteFigure text={entry.line} />
                <button
                  type="button"
                  className="dream-roster-switch"
                  aria-expanded={openProfiles.has(entry.id)}
                  aria-controls={`dream-roster-${entry.id}-profile`}
                  aria-labelledby={`dream-roster-${entry.id} dream-roster-${entry.id}-switch`}
                  onClick={(event) => {
                    setOpenProfiles((current) => {
                      const next = new Set(current);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    });
                    // The re-place signal a native disclosure sends (the Zeus
                    // button listens for toggle in the capture phase).
                    event.currentTarget.dispatchEvent(new Event("toggle"));
                  }}
                >
                  <span id={`dream-roster-${entry.id}-switch`} lang="en">
                    PROFILE
                  </span>
                  <i aria-hidden="true" />
                </button>
                <div className="dream-roster-body" id={`dream-roster-${entry.id}-profile`}>
                  {entry.profile.map((paragraph) => (
                    <p key={paragraph} className="dream-roster-profile">
                      {paragraph}
                    </p>
                  ))}
                  <RosterSupplement id={entry.id} />
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="dolminence"
        className="dream-section dream-dolminence-section"
        aria-labelledby="dolminence-title"
      >
        <header className="dream-section-heading" data-film-reveal data-ts-numeral="III">
          <img
            className="dream-act-still"
            aria-hidden="true"
            src={DREAM_POSTERS[12].src}
            {...posterImage(DREAM_POSTERS[12].src)}
            alt=""
            loading="lazy"
            decoding="async"
            width={DREAM_POSTERS[12].width}
            height={DREAM_POSTERS[12].height}
          />
          <FilmTextScan />
          <i className="dream-act-mark" aria-hidden="true" />
          <h2 id="dolminence-title">ドルミネンス</h2>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <p className="dream-dolminence-intro" data-dream-reveal>
          夢と現実の境界で作戦を遂行する機密組織「ドルミネンス」。ロードナイト、ロードケイオス、ドレッド、ルパンの四人について、変身者と装備、その性能を紹介する。
        </p>
        <div className="dream-dolminence-grid" data-dream-reveal>
          {DREAM_DOLMINENCE.map((record) => (
            <article key={record.id} style={{ ["--dream-accent" as string]: record.accent }}>
              <button
                id={`dream-dolminence-${record.id}`}
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
                  {...dossierImage(record.image)}
                  alt={record.imageAlt}
                  width={record.imageWidth}
                  height={record.imageHeight}
                  style={{ objectPosition: record.imagePosition }}
                  loading="lazy"
                  decoding="async"
                />
                <span className="dream-character-shade" aria-hidden="true" />
                <span className="dream-dolminence-copy">
                  <small>{record.agent}</small>
                  <b>
                    <DisplayName value={record.name} />
                  </b>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="factions" className="dream-annex" aria-labelledby="factions-title">
        <header className="dream-annex-heading">
          <h2 id="factions-title">組織と勢力</h2>
        </header>
        <div className="dream-factions">
          <section
            className="dream-faction is-dolminence"
            aria-labelledby="dream-faction-dolminence"
          >
            <h3 id="dream-faction-dolminence">ドルミネンス</h3>
            <dl className="dream-record-sheet">
              {DREAM_DOLMINENCE_RECORD.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.by ? <QuoteFigure text={row.text} by={row.by} /> : <p>{row.text}</p>}
                    {row.note ? <p className="dream-record-note">{row.note}</p> : null}
                    <RecordSupplement label={row.label} />
                  </dd>
                </div>
              ))}
            </dl>
            <h4 className="dream-agent-title">エージェント名簿</h4>
            <ol className="dream-agent-roster">
              {DREAM_AGENT_ROSTER.map((agent) => {
                const filed = agent.filed
                  ? DREAM_DOLMINENCE.find((record) => record.id === agent.filed)
                  : undefined;
                return (
                  <li key={agent.code} className={filed ? "is-filed" : undefined}>
                    <span className="dream-agent-code">
                      <b className={agent.code.length > 2 ? "is-long" : undefined}>
                        {agentCode(agent.code)}
                      </b>
                    </span>
                    <div className="dream-agent-copy">
                      <h5>{filed ? filed.name : agent.name}</h5>
                      {filed ? (
                        <p className="dream-agent-note">{filed.agent}</p>
                      ) : agent.note ? (
                        <p className="dream-agent-note">{agent.note}</p>
                      ) : null}
                      {agent.line ? <p className="dream-agent-line">「{agent.line}」</p> : null}
                      <AgentSupplement code={agent.code} />
                      {filed ? (
                        <button
                          type="button"
                          className="dream-agent-open"
                          aria-label={`${filed.name} 機密記録を開く`}
                          onClick={(event) => {
                            dolminenceTriggerRef.current = event.currentTarget;
                            setDolminenceOpenedByKeyboard(event.detail === 0);
                            setCharacter(null);
                            setDolminenceRecord(filed);
                            if (event.detail !== 0) event.currentTarget.blur();
                          }}
                        >
                          機密記録を開く
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <AgentAdditions />
          </section>
          {DREAM_FACTIONS.map((faction) => (
            <section
              key={faction.id}
              className={`dream-faction is-${faction.id}`}
              aria-labelledby={`dream-faction-${faction.id}`}
            >
              <h3 id={`dream-faction-${faction.id}`}>{faction.name}</h3>
              {faction.statements.map((statement) => (
                <QuoteFigure key={statement.text} text={statement.text} by={statement.by} />
              ))}
              {faction.creed?.length ? (
                <ul className="dream-faction-creed">
                  {faction.creed.map((rule) => (
                    <li key={rule}>「{rule}」</li>
                  ))}
                </ul>
              ) : null}
              {faction.limit ? <p className="dream-faction-limit">「{faction.limit}」</p> : null}
              {faction.members?.length ? (
                <dl className="dream-faction-members">
                  {faction.members.map((member) => (
                    <div key={member.name}>
                      <dt>{member.name}</dt>
                      <dd>
                        {member.spoken ? `「${member.note}」` : member.note}
                        <FactionMemberNote id={faction.id} name={member.name} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {faction.pact ? (
                <p className="dream-faction-pact">
                  <b>{faction.pact.term}</b>
                  <span>{faction.pact.text}</span>
                </p>
              ) : null}
              <FactionSupplement id={faction.id} />
            </section>
          ))}
        </div>
      </section>

      <section
        id="cases"
        className="dream-section dream-case-section dream-reader"
        aria-labelledby="case-title"
      >
        <header className="dream-section-heading" data-film-reveal data-ts-numeral="IV">
          <img
            className="dream-act-still"
            aria-hidden="true"
            src={DREAM_POSTERS[13].src}
            {...posterImage(DREAM_POSTERS[13].src)}
            alt=""
            loading="lazy"
            decoding="async"
            width={DREAM_POSTERS[13].width}
            height={DREAM_POSTERS[13].height}
          />
          <FilmTextScan />
          <i className="dream-act-mark" aria-hidden="true" />
          <h2 id="case-title">物語の記録</h2>
          <i className="film-boundary-line" aria-hidden="true" />
        </header>
        <div className="dream-story-intro">
          <p>
            悪夢から慶弥を救ったシエルは、怪作と共に幻想郷へ辿り着く。迫る追手を迎え撃つ六つの章を、出会いから怪作奪還の決意まで辿る。
          </p>
          <p className="dream-story-scope" id="dream-story-scope">
            各章のあらすじには、物語の展開・ネタバレを含みます。
          </p>
        </div>
        <DreamReadingLauncher />
        <DreamStoryIndex />
        <div className="dream-story-layout">
          <aside className="dream-story-crossings" aria-labelledby="dream-crossings-title">
            <h3 id="dream-crossings-title">幻想郷との交差</h3>
            <p className="dream-story-crossings-lead">
              怪作を狙う追撃は人里を襲い、神社と竹林を戦場に変える。迎え撃つ霊夢たちとの共闘は、シエルと慶弥にも、守られる側になる戸惑いをもたらす。
            </p>
            <dl>
              {DREAM_STORY_CROSSINGS.map((place) => (
                <div key={place.name}>
                  <dt>{place.name}</dt>
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
                <details
                  className="dream-story-case"
                  id={`dream-case-${episode.no}`}
                  data-case-no={episode.no}
                >
                  <summary>
                    <span className="dream-story-case-number">
                      <b>{episode.no}</b>
                    </span>
                    <span className="dream-story-case-heading">
                      <span>{episode.title}</span>
                    </span>
                    <span className="dream-story-case-toggle" aria-hidden="true">
                      ＋
                    </span>
                    <span className="dream-reader-preview">{episode.lead}</span>
                  </summary>
                  <div className="dream-story-case-body">
                    <h3>{episode.lead}</h3>
                    {episode.paragraphs.map((paragraph, index) => (
                      <p
                        key={paragraph}
                        id={`dream-case-${episode.no}-paragraph-${index + 1}`}
                        data-dream-reading-paragraph
                        data-case-no={episode.no}
                        data-paragraph-no={index + 1}
                        tabIndex={-1}
                      >
                        {paragraph}
                      </p>
                    ))}
                    <DreamChapterCompanion no={episode.no} />
                    <DreamStoryNavigation no={episode.no} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="case-notes" className="dream-annex" aria-labelledby="case-notes-title">
        <header className="dream-annex-heading">
          <h2 id="case-notes-title">章の言葉</h2>
        </header>
        <ol className="dream-case-notes" data-dream-reveal>
          {DREAM_CASE_NOTES.map((note) => {
            const episode = DREAM_CASES.find((item) => item.no === note.no);
            return (
              <li key={note.no} id={`dream-case-note-${note.no}`} tabIndex={-1}>
                <p className="dream-case-note-head">
                  <span>
                    <b>{note.no}</b>
                  </span>
                  <strong>{episode?.title}</strong>
                </p>
                {note.motto ? (
                  <p className="dream-case-note-motto" lang="en">
                    {note.motto}
                  </p>
                ) : null}
                <QuoteFigure text={note.line} by={note.by} />
                <DreamStoryBacklinks no={note.no} from="note" />
              </li>
            );
          })}
        </ol>
      </section>

      <DreamChronicle id="chronicle" />
      <DreamAtlas id="atlas" />
      <DreamRelations id="relations" />
      <DreamArsenal id="arsenal" />

      <section id="glossary" className="dream-annex" aria-labelledby="glossary-title">
        <header className="dream-annex-heading">
          <h2 id="glossary-title">用語集</h2>
        </header>
        <DreamGlossarySearch />
        <dl className="dream-glossary" data-dream-reveal>
          {DREAM_GLOSSARY.map((entry, index) => (
            <div key={entry.term} id={`dream-term-${index + 1}`}>
              <dt>{entry.term}</dt>
              <dd>
                {entry.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {entry.said ? <QuoteFigure text={entry.said} by={entry.by} /> : null}
                <GlossarySupplement term={entry.term} />
              </dd>
            </div>
          ))}
        </dl>
        <GlossaryIndex />
      </section>

      <section id="quotes" className="dream-annex dream-quotes" aria-labelledby="quotes-title">
        <header className="dream-annex-heading">
          <h2 id="quotes-title">名台詞</h2>
        </header>
        <ol className="dream-quote-band" data-dream-reveal>
          {DREAM_QUOTES.map((quote) => (
            <li key={quote.text}>
              <QuoteFigure text={quote.text} by={quote.by} />
            </li>
          ))}
        </ol>
        <VoicesLeaf />
      </section>

      <footer className="dream-footer">
        <h2>
          <span>ドリームチャプター</span>
        </h2>
        <dl className="dream-credits" aria-label="登場記録">
          <div>
            <dt>登場人物</dt>
            <dd>
              {DREAM_CHARACTERS.map((item) => (
                <span key={item.id}>
                  <a href={`#dream-character-${item.id}`}>{item.name}</a>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>ドルミネンス</dt>
            <dd>
              {DREAM_DOLMINENCE.map((record) => (
                <span key={record.id}>
                  <a href={`#dream-dolminence-${record.id}`}>{record.name}</a>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>舞台</dt>
            <dd>
              {DREAM_STORY_CROSSINGS.map((place) => (
                <span key={place.name}>
                  <a href="#atlas">{place.name}</a>
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <nav className="dream-footer-nav" aria-label="幕間クイック移動">
          <a href="#top">↑ 巻頭へ戻る</a>
          <a href="#posters">絵看板</a>
          <a href="#characters">登場人物</a>
          <a href="#dolminence">ドルミネンス</a>
          <a href="#cases">物語の記録</a>
        </nav>
        <span className="dream-footer-end" aria-hidden="true">
          終
        </span>
        <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS} transition="dream">
          <span>ディセプションワールドへ戻る</span>
        </GuardedLink>
      </footer>

      <CharacterDialog
        character={character}
        openedByKeyboard={characterOpenedByKeyboard}
        trigger={characterTriggerRef.current}
        onClose={closeCharacter}
        onSelect={setCharacter}
        onSelectDolminence={(nextRecord) => {
          setCharacter(null);
          setDolminenceRecord(nextRecord);
        }}
      />
      <DolminenceDialog
        record={dolminenceRecord}
        openedByKeyboard={dolminenceOpenedByKeyboard}
        trigger={dolminenceTriggerRef.current}
        onClose={closeDolminenceRecord}
        onSelect={setDolminenceRecord}
        onSelectCharacter={(nextCharacter) => {
          setDolminenceRecord(null);
          setCharacter(nextCharacter);
        }}
      />
    </main>
  );
}
