import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { GALLERY_CURTAIN_STICKERS } from "@/components/gallery/gallery-curtain";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { DisplayName } from "@/components/name-text";
import { isCastRosterOrigin } from "@/lib/dossier-origin";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  EXTREME_SAGA_ENTER_ASSETS,
  FAR_FROM_SAGA_ENTER_ASSETS,
  FINAL_STAGE_ENTER_ASSETS,
  ILLUSIONCULUM_SAGA_ENTER_ASSETS,
  META_UNITAS_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { prefetchMetaUnitasEntry } from "@/lib/meta-unitas-entry-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { watchSideMenuSwipeLifecycle } from "@/lib/side-menu-swipe-lifecycle.js";
import { RE_DIVE_RIKUEI_NAV, RELATED_NAV, RIDER_NAV, RIKUEI_NAV } from "./dossier-nav";
import { launcherTile } from "@/lib/thumbnail-images";
import { LiquidPointerGlow } from "./liquid-rail";
import { UiVectorIcon } from "./ui-vector-icon";
import { worldChapterLine } from "./world-chapter-marker";
import { LibraryCurrentButton } from "@/components/library/library-controls";
import {
  SPECIAL_SITE_PATHS,
  SPECIAL_SITE_SECTIONS,
  type SpecialSiteId,
} from "@/lib/special-site-sections";
import { openQuickSearch, prefetchQuickSearch } from "@/components/search/quick-search-events";
import { IpadMenuToggle } from "@/components/ipad-menu-mode";
import { CinemaLink } from "./external-cinema-link";
import {
  claimSideMenuEarlyInput,
  isSideMenuEarlyInputValid,
  type SideMenuEarlyInput,
} from "@/lib/side-menu-early-input.js";

type SiteAnnouncementMetric = {
  value: string;
  label: string;
  detail: string;
};

type SiteAnnouncement = {
  id: string;
  sequence: string;
  date: string;
  title: string;
  image: string;
  imageAlt: string;
  width: number;
  height: number;
  /** Where the poster frames crop the key visual (object-position y):
      `tall` for the board's 4:5 frame, `square` for its 1:1 frame on short
      screens, `thumb` for the phones' 3:4 thumbnail. A poster's wordmark is
      either whole in the frame or out. */
  posterY?: { tall?: string; square?: string; thumb?: string };
  eyebrow?: string;
  lede?: string;
  comparisonTitle?: string;
  metrics?: readonly SiteAnnouncementMetric[];
  body?: string;
  note?: string;
};

const SITE_ANNOUNCEMENTS = [
  {
    id: "rexonance-saga-release",
    sequence: "PRODUCT BRIEFING 03",
    date: "2026.08.27",
    title: "レクソナンスサーガの性能と三つの形態を紹介。",
    image: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    imageAlt: "水色とピンクの星光をまとい、金色の神装を備えた仮面ライダーレクソナンスサーガ",
    width: 680,
    height: 906,
    eyebrow: "The next generation of SA-GA.",
    lede: "第五の犬として完全覚醒した悠真が、自身の『終焉』を完全制御する。",
    comparisonTitle: "エクスプリームサーガ標準値比",
    metrics: [
      { value: "+81.0%", label: "PUNCH POWER", detail: "372.2t / 205.6t" },
      { value: "+56.5%", label: "KICK POWER", detail: "483.5t / 308.9t" },
      { value: "+480.6%", label: "JUMP HEIGHT", detail: "6000m / 1033.5m" },
      { value: "−89.5%", label: "100m TIME", detail: "0.00021s / 0.002s" },
    ],
    body: "精神的変化に伴う著しい適正値上昇によって完全覚醒した悠真が、自己共鳴型のシステムで『終焉』を運用します。KHAOSが候補を生成し、KOSMOSが整合性を検証し、採用と対象の最終判断は悠真自身が行います。",
    note: "公開済みの標準カタログ値から算出。100mは所要時間の短縮率であり、最大出力ではなく標準値の比較です。",
  },
  {
    id: "not-even-close",
    sequence: "TRANSMISSION 02",
    date: "2026.08.26",
    title: "Not Even Close.",
    image: "/announcement-not-even-close.jpeg",
    imageAlt: "金色と青紫色に発光する仮面とDeus. A NEW ERA BEGINS.の文字",
    width: 900,
    height: 1125,
    // Square: Deus. and A NEW ERA BEGINS whole (71-88% of the art), the
    // flare and COMING SOON (92-96%) out.
    posterY: { square: "50%" },
  },
  {
    id: "who-supreme",
    sequence: "TRANSMISSION 01",
    date: "2026.08.23",
    title: "Who Supreme?",
    image: "/announcement-who-supreme.jpeg",
    imageAlt: "青白く発光する仮面とEX. Beyond imagination.の文字",
    width: 960,
    height: 1441,
    // 4:5: the whole mask (to 81% of the art), the EX. mark (85-95%) out.
    // Square: the mask's chin whole at the foot (the horns run off the
    // top), the EX. mark out; at 18% the frame cut through the chin.
    // Thumb (3:4 keeps 89%): the mark cannot leave, so it stands whole
    // with its line under it; centred, its foot touched the frame.
    posterY: { tall: "0%", square: "48%", thumb: "100%" },
  },
] as const satisfies readonly SiteAnnouncement[];

type AnnouncementId = (typeof SITE_ANNOUNCEMENTS)[number]["id"];

function announcementPosterStyle({ posterY }: SiteAnnouncement): CSSProperties | undefined {
  if (!posterY) return undefined;
  return {
    ...(posterY.tall ? { "--poster-y-tall": posterY.tall } : {}),
    ...(posterY.square ? { "--poster-y-square": posterY.square } : {}),
    ...(posterY.thumb ? { "--poster-y-thumb": posterY.thumb } : {}),
  } as CSSProperties;
}

// A Japanese title wraps between its phrases: a break opportunity where a
// particle (hiragana) meets the next word (kanji or katakana), so
// レクソナンスサーガの / 性能と / 三つの / 形態を / 紹介。 The copy is
// unchanged; keep-all (chrome-elevation) holds each phrase whole. WebKit
// split 性 / 能 under balance (2026-10-22). Latin titles keep their spaces.
// The next word never starts on a small kana, ・ or ー (no line starts there).
const TITLE_PHRASE_SEAM =
  /([\u3041-\u309f])(?=(?![\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6])[\u30a1-\u30fa\u4e00-\u9fff])/gu;

// A tail this short (紹介。) rides with the phrase before it: balance left it
// alone under a full line at 48px (1440 / 1920, 2026-10-22).
const TITLE_TAIL_MAX = 3;

function PhrasedTitle({ text }: { text: string }) {
  const phrases = text.replace(TITLE_PHRASE_SEAM, "$1\u200b").split("\u200b");
  if (phrases.length > 1 && phrases[phrases.length - 1].length <= TITLE_TAIL_MAX) {
    phrases.splice(-2, 2, phrases.slice(-2).join(""));
  }
  return phrases.map((phrase, index) => (
    <Fragment key={`${index}-${phrase}`}>
      {index > 0 ? <wbr /> : null}
      {phrase}
    </Fragment>
  ));
}

const FILE_CHAPTER_CODES: Record<string, string> = {
  "dossier-profile": "PROFILE",
  "identity-records": "RECORDS",
  "dossier-index": "DOSSIER",
  "form-records": "FORMS",
};
const YOAKE_MAMORI_LINK = {
  name: "夜明護尊",
  href: "/characters/yoake-mamori",
  assets: ["/character-yoake-mamori.jpeg"],
} as const;

const SIDE_MENU_OPEN_INPUT_EVENT = "deception-world:side-menu-open-input";

// A finger swipe to the right closes the menu (touch only). The first 10px
// decide the gesture: it is the menu's when it runs right and 1.4 times wider
// than it is tall; otherwise the list keeps its native vertical scroll. On
// release it closes past 72px, or when flicked past 24px faster than
// 0.5px/ms. The flick's speed is the finger's over its last ~100ms, so a flick
// after a hold still counts, and a tap that rolls a few pixels stays a tap.
const SIDE_MENU_SWIPE_SLOP_PX = 10;
const SIDE_MENU_SWIPE_RATIO = 1.4;
const SIDE_MENU_SWIPE_CLOSE_PX = 72;
const SIDE_MENU_SWIPE_FLICK_MIN_PX = 24;
const SIDE_MENU_SWIPE_CLOSE_PX_PER_MS = 0.5;
const SIDE_MENU_SWIPE_SAMPLE_MS = 100;
// The menu opens scrolled to the current group's kicker: this far under the
// sticky head's rule, clear of the 32px ink fade below it (chrome-elevation).
const SIDE_MENU_GROUP_CLEARANCE_PX = 36;
// The head's ink fade (chrome-elevation / stage-shell): solid ink for its
// first 12px, then a 20px fall to clear. Words seen through that fall read as
// cut, not as passing under the head; its last 3px are as good as clear.
const SIDE_MENU_HEAD_INK_PX = 12;
const SIDE_MENU_HEAD_FADE_PX = 29;

/* An opening never leaves a line of words in the head's fade. On a menu
   barely taller than the screen (an iPad, a laptop) the kicker step stops at
   the end of the scroll, mid-row: SECTIONS or a row's labels half under the
   head. It steps back up to the nearest spot where no line shows through the
   fall, as long as the reader's own row stays in view; failing that it stays.
   One text pass per opening, no layout writes but the scroll. */
function settleClearOfHeadFade(panel: HTMLElement, keep: HTMLElement | null, clearance: number) {
  const doc = panel.ownerDocument;
  const head = panel.querySelector(".side-panel-head");
  if (!head || typeof doc?.createTreeWalker !== "function" || typeof doc.createRange !== "function")
    return;
  const edge = head.getBoundingClientRect().bottom;
  const lines: { top: number; bottom: number }[] = [];
  const walker = doc.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim() || head.contains(node)) continue;
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) lines.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  // Scrolling up by `shift` moves every line down by it.
  const sliced = (shift: number) =>
    lines.some(
      (line) =>
        line.bottom + shift > edge + SIDE_MENU_HEAD_INK_PX &&
        line.top + shift < edge + SIDE_MENU_HEAD_FADE_PX,
    );
  if (!sliced(0)) return;
  const room = keep
    ? panel.getBoundingClientRect().bottom - clearance - keep.getBoundingClientRect().bottom
    : Infinity;
  const shifts = lines
    .flatMap((line) => [
      edge + SIDE_MENU_HEAD_FADE_PX - line.top,
      edge + SIDE_MENU_HEAD_INK_PX - line.bottom,
    ])
    .filter((shift) => shift > 0 && shift <= panel.scrollTop && shift <= room)
    .sort((a, b) => a - b);
  const clear = shifts.find((shift) => !sliced(shift));
  if (clear !== undefined) panel.scrollTop -= clear;
}

type SideMenuCloseWatcher = { onclose: (() => void) | null; destroy(): void };

export function SideMenuTrigger({
  open,
  onOpenChange,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
} = {}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const earlyInputRef = useRef<SideMenuEarlyInput | null>(null);
  useLayoutEffect(() => {
    const opener = triggerRef.current;
    if (opener && onOpenChange) earlyInputRef.current ??= claimSideMenuEarlyInput(opener);
  }, [onOpenChange]);
  useEffect(() => {
    let cancelled = false;
    const input = earlyInputRef.current;
    if (input && onOpenChange) {
      // The menu's input listener is a passive effect. Deliver after all
      // mount effects, so early keyboard activation retains focus metadata.
      // StrictMode cancels its first microtask; the shared ref lets the real
      // setup deliver the consumed packet exactly once, not lose or replay it.
      queueMicrotask(() => {
        if (cancelled || earlyInputRef.current !== input) return;
        earlyInputRef.current = null;
        if (!isSideMenuEarlyInputValid(input)) return;
        window.dispatchEvent(
          new CustomEvent(SIDE_MENU_OPEN_INPUT_EVENT, {
            detail: { keyboard: input.keyboard, opener: input.opener },
          }),
        );
        if (!input.keyboard) input.opener.blur();
        onOpenChange(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [onOpenChange]);
  return (
    <button
      ref={triggerRef}
      className={`side-panel-trigger ios26-glass${className ? ` ${className}` : ""}`}
      data-liquid-pointer="true"
      type="button"
      aria-expanded={open ?? false}
      aria-controls="site-side-panel"
      aria-haspopup="dialog"
      aria-label="メニューを開く"
      onClick={
        onOpenChange
          ? (event) => {
              earlyInputRef.current = null;
              const openedByKeyboard = event.detail === 0;
              window.dispatchEvent(
                new CustomEvent(SIDE_MENU_OPEN_INPUT_EVENT, {
                  detail: { keyboard: openedByKeyboard, opener: event.currentTarget },
                }),
              );
              if (!openedByKeyboard) event.currentTarget.blur();
              onOpenChange(true);
            }
          : undefined
      }
    >
      <LiquidPointerGlow />
      <span className="side-panel-trigger-convergence" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="side-panel-trigger-ring" aria-hidden="true" />
      <span className="side-panel-trigger-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

export function DossierTopbar({
  fileLabel,
  returnHash,
  returnLabel,
  returnAriaLabel = returnLabel,
}: {
  fileLabel: string;
  returnHash: string;
  returnLabel: string;
  returnAriaLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fromCastRoster = useRouterState({
    select: (state) => isCastRosterOrigin(state.location.search),
  });
  const targetHash = fromCastRoster ? "cast-roster" : returnHash;
  const targetLabel = fromCastRoster ? "人物一覧へ戻る" : returnLabel;
  const targetAriaLabel = fromCastRoster ? "人物一覧へ戻る" : returnAriaLabel;

  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <header className="manager-topbar">
        <GuardedLink
          to="/world"
          hash={targetHash}
          assets={[]}
          className="brand"
          aria-label={`${fileLabel}からDeception Worldへ戻る`}
        >
          <span className="brand-sigil">
            <i>DW</i>
          </span>
          <span>
            <b>DECEPTION WORLD</b>
            <small>{fileLabel}</small>
          </span>
        </GuardedLink>
        <div className="detail-topbar-actions">
          <GuardedLink
            to="/world"
            hash={targetHash}
            assets={[]}
            className="manager-back"
            aria-label={targetAriaLabel}
          >
            <span>{targetLabel}</span>
            <i aria-hidden="true">
              <UiVectorIcon kind="arrow-left" size={14} />
            </i>
          </GuardedLink>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
    </>
  );
}

export function SideMenuLayer({
  context = "world",
  open,
  onOpenChange,
}: {
  context?: "world" | "archive" | "movie" | "cinema" | "gallery" | SpecialSiteId;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const panelRef = useRef<HTMLElement>(null);
  const announcementRef = useRef<HTMLDialogElement>(null);
  const announcementTriggerRef = useRef<HTMLButtonElement>(null);
  const announcementStageRef = useRef<HTMLDivElement>(null);
  const announcementBackRef = useRef<HTMLButtonElement>(null);
  const announcementTransitionFrameRef = useRef(0);
  const announcementTransitionKeyboardRef = useRef(false);
  const announcementReturnIdRef = useRef<AnnouncementId | null>(null);
  const announcementOpenedByKeyboardRef = useRef(false);
  const sideMenuRestoreFocusRef = useRef(false);
  const sideMenuOpenerRef = useRef<HTMLButtonElement | null>(null);
  const swipeRef = useRef<{
    id: number;
    x: number;
    y: number;
    dragging: boolean;
    // The release speed is read from sample to release: a point on the path
    // that trails the finger by up to SIDE_MENU_SWIPE_SAMPLE_MS.
    sampleX: number;
    sampleTime: number;
    lastX: number;
    lastTime: number;
  } | null>(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<AnnouncementId | null>(null);
  const controlled = typeof open === "boolean" && Boolean(onOpenChange);
  const isOpen = controlled ? open : false;
  const isSpecialSite =
    context === "rexonance" ||
    context === "extreme" ||
    context === "far-from" ||
    context === "illusionculum" ||
    context === "meta-unitas" ||
    context === "final-stage";
  const router = useRouter();
  // The dossier the reader is on is marked in the menu (aria-current).
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const locationHash = useRouterState({ select: (state) => state.location.hash });
  // RE DIVE (rising-world.tsx) joins the World's sections once reached this
  // session; read when the menu opens.
  const [reDiveReached, setReDiveReached] = useState(false);
  // Owner (2026-10-24): 「他と同じく、事前にデータを読み込む方式にして」 — the Meta
  // Unitas entry's chunk, engine and suit warm when the menu opens.
  useEffect(() => {
    if (isOpen && pathname !== "/meta-unitas-saga") prefetchMetaUnitasEntry?.();
  }, [isOpen, pathname]);
  useEffect(() => {
    if (!isOpen) return;
    try {
      setReDiveReached(window.sessionStorage.getItem("dw-re-dive") === "1");
    } catch {
      setReDiveReached(false);
    }
  }, [isOpen]);
  const [fileChapters, setFileChapters] = useState<readonly { id: string; label: string }[]>([]);
  useEffect(() => {
    const doc = panelRef.current?.ownerDocument;
    if (!doc) return;
    const rows = doc.querySelectorAll<HTMLAnchorElement>(
      'main.manager-page .dossier-reader-links > a[href^="#"]',
    );
    setFileChapters(
      Array.from(rows, (row) => ({
        id: row.getAttribute("href")!.slice(1),
        label: row.textContent?.trim() ?? "",
      })),
    );
  }, [pathname, isOpen]);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel || !fileChapters.length) return;
    const current = panel.ownerDocument
      .querySelector('main.manager-page .dossier-reader-links > a[aria-current="location"]')
      ?.getAttribute("href");
    panel.querySelectorAll(".side-panel-links > a").forEach((row) => {
      if (!row.getAttribute("href")?.startsWith(`${pathname}#`)) return;
      if (row.getAttribute("href") === `${pathname}${current}`) {
        row.setAttribute("aria-current", "location");
      } else {
        row.removeAttribute("aria-current");
      }
    });
  }, [isOpen, pathname, fileChapters]);
  // The World header marks the chapter in view (WorldSectionNav); its row in
  // SECTIONS repeats that mark as aria-current="location", read when the menu
  // opens (the page cannot scroll behind it). It is set on the rows directly:
  // React never gives these /world# rows an aria-current of their own, and
  // GuardedLink only types the "page" value.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const header = document
      .querySelector('.topbar nav a[aria-current="location"]')
      ?.getAttribute("href");
    // 六詠 lies inside STORY on the page but has its own row here: while it
    // spans the header's reading line (world-chapter-marker.ts), that row is
    // the mark.
    const archive = header === "#story" ? document.getElementById("manager-archive") : null;
    let chapter = header;
    if (archive) {
      const { top, bottom } = archive.getBoundingClientRect();
      const line = worldChapterLine(archive);
      if (top <= line && bottom > line) chapter = "#manager-archive";
    }
    panel.querySelectorAll('.side-panel-links > a[href^="/world#"]').forEach((row) => {
      if (chapter && row.getAttribute("href") === `/world${chapter}`) {
        row.setAttribute("aria-current", "location");
      } else {
        row.removeAttribute("aria-current");
      }
    });
  }, [isOpen]);
  const close = () => onOpenChange?.(false);
  const selectedAnnouncement: SiteAnnouncement | null =
    SITE_ANNOUNCEMENTS.find((notice) => notice.id === selectedAnnouncementId) ?? null;

  useEffect(() => {
    if (!isOpen && !announcementOpen) return;
    // Hash history keeps this page mounted. Release transient UI as the
    // browser restores its destination, rather than leaving it inert/locked
    // behind the menu (or its nested announcement).
    return router.history.subscribe(({ action }) => {
      if (action.type !== "BACK" && action.type !== "FORWARD" && action.type !== "GO") return;
      sideMenuRestoreFocusRef.current = false;
      announcementOpenedByKeyboardRef.current = false;
      onOpenChange?.(false);
      setAnnouncementOpen(false);
      setSelectedAnnouncementId(null);
    });
  }, [announcementOpen, isOpen, onOpenChange, router]);

  useEffect(() => {
    const rememberInput = (event: Event) => {
      const detail = (event as CustomEvent<{ keyboard?: boolean; opener?: HTMLButtonElement }>)
        .detail;
      sideMenuRestoreFocusRef.current = detail?.keyboard === true;
      sideMenuOpenerRef.current = detail?.opener ?? null;
    };
    window.addEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
    return () => window.removeEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
  }, []);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const root = document.documentElement;
    // Pointer activation blurs the trigger before this effect runs. Remember
    // its identity too, so a later Escape can still return keyboard focus.
    const previousFocus = sideMenuOpenerRef.current?.isConnected
      ? sideMenuOpenerRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panel.scrollTop = 0;
    // The reader's own row (a dossier in RIDERS or UNMANAGED) sits below the
    // fold of the long menu on a laptop as on a phone: the menu opens with it
    // in view, clear of the bottom edge by the panel's own bottom padding
    // (32px, plus the home indicator's inset on an iPhone). Only the panel
    // scrolls; scrollIntoView could also move the locked page behind it.
    // World chapters have a current location, not a current file. Keep that
    // row visible even when its whole SECTIONS group cannot fit in landscape.
    const current =
      // The special site's own chapters take precedence over its duplicate
      // SPECIAL launcher row. Preserve the dossier/current-file rule elsewhere.
      (context === "rexonance"
        ? panel.querySelector<HTMLElement>("[data-side-menu-sections] .side-panel-links > a")
        : null) ??
      panel.querySelector<HTMLElement>('.side-panel-links > [aria-current="page"]') ??
      panel.querySelector<HTMLElement>('.side-panel-links > [aria-current="location"]');
    if (current) {
      const clearance = parseFloat(window.getComputedStyle(panel).paddingBottom) || 24;
      const overflow =
        current.getBoundingClientRect().bottom + clearance - panel.getBoundingClientRect().bottom;
      if (overflow > 0) panel.scrollTop += overflow;
    }
    // Then the menu opens on the group the reader is in, its kicker (RIDERS,
    // SPECIAL, STORIES) in full under the sticky head: the head's ink runs on
    // 32px below its rule (the fade a row passes under), so the kicker lands
    // below that fade, never half inside it. Scrolling further only ever
    // moves the current row up, so it stays in view; a group taller than the
    // screen from its kicker to that row keeps the row where it is and lets
    // the kicker pass under the head instead (the kicker is never pulled
    // back down).
    const group = current?.closest<HTMLElement>(".side-panel-group");
    const head = panel.querySelector(".side-panel-head");
    if (group && head) {
      const top = head.getBoundingClientRect().bottom + SIDE_MENU_GROUP_CLEARANCE_PX;
      const below = group.getBoundingClientRect().top - top;
      if (below > 0) panel.scrollTop += below;
    }
    if (current) {
      settleClearOfHeadFade(
        panel,
        current,
        parseFloat(window.getComputedStyle(panel).paddingBottom) || 24,
      );
    }
    // Android's back gesture (and Esc from outside the menu) asks the
    // browser's CloseWatcher to close the menu instead of leaving the page.
    // Feature-detected, and no history entries are touched; the panel's own
    // Escape handler cancels its key, so Esc inside the menu closes it once.
    const Watcher = (window as unknown as { CloseWatcher?: new () => SideMenuCloseWatcher })
      .CloseWatcher;
    let watcher: SideMenuCloseWatcher | null = null;
    if (typeof Watcher === "function") {
      try {
        watcher = new Watcher();
        watcher.onclose = () => {
          sideMenuRestoreFocusRef.current = false;
          onOpenChange?.(false);
        };
      } catch {
        watcher = null;
      }
    }
    root.dataset.sideMenuOpen = "true";
    const releaseViewportScrollLock = acquireViewportScrollLock();
    const stopSwipeLifecycle = watchSideMenuSwipeLifecycle(() => {
      const pointerId = swipeRef.current?.id;
      swipeRef.current = null;
      panel.style.removeProperty("translate");
      panel.style.removeProperty("transition");
      if (pointerId !== undefined && panel.hasPointerCapture(pointerId)) {
        panel.releasePointerCapture(pointerId);
      }
    });
    const containBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      if (!(event.target instanceof Node)) {
        event.preventDefault();
        return;
      }
      if (panel.contains(event.target)) return;
      const announcementDialog = announcementRef.current;
      if (announcementDialog?.open && announcementDialog.contains(event.target)) return;
      event.preventDefault();
    };
    const containBackgroundFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || panel.contains(event.target)) return;
      const announcementDialog = announcementRef.current;
      if (announcementDialog?.open && announcementDialog.contains(event.target)) return;
      const focusTarget = sideMenuRestoreFocusRef.current
        ? panel.querySelector<HTMLElement>(".side-panel-close")
        : panel;
      focusTarget?.focus({ preventScroll: true });
    };
    document.addEventListener("touchmove", containBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("wheel", containBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("focusin", containBackgroundFocus, true);
    let focusFrame = 0;
    const focusPanel = () => {
      // The opening CSS visibility transition can still be hidden on the
      // first frame. Retry after layout rather than leaving focus on body.
      if (window.getComputedStyle(panel).visibility !== "visible") {
        focusFrame = window.requestAnimationFrame(focusPanel);
        return;
      }
      const focusTarget = sideMenuRestoreFocusRef.current
        ? panel.querySelector<HTMLElement>(".side-panel-close")
        : panel;
      // WebKit can reveal the sheet one frame before its sticky head. A
      // hidden close button silently rejects focus, even in reduced motion.
      if (focusTarget && window.getComputedStyle(focusTarget).visibility !== "visible") {
        focusFrame = window.requestAnimationFrame(focusPanel);
        return;
      }
      focusTarget?.focus({ preventScroll: true });
    };
    focusFrame = window.requestAnimationFrame(focusPanel);
    // Tab already stays inside the menu; the page behind it leaves the
    // accessibility tree too, so a screen reader cannot wander out. Every
    // branch beside the panel's path up to <body> goes inert, except the
    // announcement dialog opened from the menu, the scrim that closes it and
    // non-content nodes. Only the branches set here are released.
    const inerted: HTMLElement[] = [];
    let node: HTMLElement = panel;
    while (node !== document.body && node.parentElement) {
      const parent: HTMLElement = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
        if (sibling.matches("dialog, .side-panel-scrim, script, style, link")) continue;
        sibling.inert = true;
        inerted.push(sibling);
      }
      node = parent;
    }
    return () => {
      watcher?.destroy();
      if (
        !sideMenuRestoreFocusRef.current &&
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      // Released before focus returns: an inert opener cannot take it.
      for (const element of inerted) element.inert = false;
      window.cancelAnimationFrame(focusFrame);
      stopSwipeLifecycle();
      document.removeEventListener("touchmove", containBackgroundScroll, true);
      document.removeEventListener("wheel", containBackgroundScroll, true);
      document.removeEventListener("focusin", containBackgroundFocus, true);
      releaseViewportScrollLock();
      if (!root.dataset.routeCover) {
        delete root.dataset.sideMenuOpen;
      }
      if (sideMenuRestoreFocusRef.current) {
        previousFocus?.focus({ preventScroll: true });
      }
      sideMenuRestoreFocusRef.current = false;
      sideMenuOpenerRef.current = null;
    };
  }, [controlled, isOpen, onOpenChange, context]);

  useEffect(() => {
    const dialog = announcementRef.current;
    if (!dialog || !announcementOpen) return;
    const sidePanel = panelRef.current;
    const announcementTrigger = announcementTriggerRef.current;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        setAnnouncementOpen(false);
        return;
      }
    }
    const releaseViewportScrollLock = acquireViewportScrollLock();
    dialog.scrollTop = 0;
    // Focusing the dialog itself prevents WebKit from auto-focusing (and
    // visually latching) the first close control when showModal() runs.
    dialog.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      releaseViewportScrollLock();
      if (announcementOpenedByKeyboardRef.current) {
        const returnTarget =
          sidePanel?.dataset.open === "true" && announcementTrigger?.isConnected
            ? announcementTrigger
            : document.querySelector<HTMLButtonElement>(".side-panel-trigger");
        returnTarget?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        dialog.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      announcementOpenedByKeyboardRef.current = false;
    };
  }, [announcementOpen]);

  useLayoutEffect(() => {
    if (!announcementOpen) return;
    if (announcementTransitionFrameRef.current) {
      window.cancelAnimationFrame(announcementTransitionFrameRef.current);
    }
    if (announcementStageRef.current) announcementStageRef.current.scrollTop = 0;
    const keyboardTransition = announcementTransitionKeyboardRef.current;
    const returnId = announcementReturnIdRef.current;
    announcementTransitionFrameRef.current = window.requestAnimationFrame(() => {
      announcementTransitionFrameRef.current = 0;
      if (!announcementRef.current?.open) return;
      if (selectedAnnouncement) {
        if (keyboardTransition) announcementBackRef.current?.focus({ preventScroll: true });
        else announcementRef.current.focus({ preventScroll: true });
      } else if (keyboardTransition && returnId) {
        const returnTarget = Array.from(
          announcementRef.current.querySelectorAll<HTMLButtonElement>(
            ".site-announcement-list-item",
          ),
        ).find((item) => item.dataset.announcementId === returnId);
        returnTarget?.focus({ preventScroll: true });
        // Keep a later keyboard opener visible without scrolling the page or
        // the side menu behind this dialog. Pointer returns still start at 0.
        const stage = announcementStageRef.current;
        if (returnTarget && stage) {
          const targetBounds = returnTarget.getBoundingClientRect();
          const stageBounds = stage.getBoundingClientRect();
          if (targetBounds.bottom > stageBounds.bottom) {
            stage.scrollTop += targetBounds.bottom - stageBounds.bottom;
          } else if (targetBounds.top < stageBounds.top) {
            stage.scrollTop -= stageBounds.top - targetBounds.top;
          }
        }
      } else {
        announcementRef.current.focus({ preventScroll: true });
      }
      announcementTransitionKeyboardRef.current = false;
      announcementReturnIdRef.current = null;
    });
    return () => {
      if (announcementTransitionFrameRef.current) {
        window.cancelAnimationFrame(announcementTransitionFrameRef.current);
        announcementTransitionFrameRef.current = 0;
      }
    };
  }, [announcementOpen, selectedAnnouncement]);

  const openAnnouncements = (event: MouseEvent<HTMLButtonElement>) => {
    const openedByKeyboard = event.detail === 0;
    announcementOpenedByKeyboardRef.current = openedByKeyboard;
    announcementTransitionKeyboardRef.current = false;
    announcementReturnIdRef.current = null;
    if (!openedByKeyboard) event.currentTarget.blur();
    setSelectedAnnouncementId(null);
    setAnnouncementOpen(true);
  };

  const closeAnnouncement = (restoreFocus = announcementOpenedByKeyboardRef.current) => {
    announcementOpenedByKeyboardRef.current = restoreFocus;
    announcementTransitionKeyboardRef.current = false;
    announcementReturnIdRef.current = null;
    setAnnouncementOpen(false);
    setSelectedAnnouncementId(null);
  };

  const openAnnouncementDetail = (event: MouseEvent<HTMLButtonElement>, id: AnnouncementId) => {
    const openedByKeyboard = event.detail === 0;
    announcementTransitionKeyboardRef.current = openedByKeyboard;
    announcementReturnIdRef.current = id;
    if (!openedByKeyboard) event.currentTarget.blur();
    setSelectedAnnouncementId(id);
  };

  const returnToAnnouncementIndex = (event: MouseEvent<HTMLButtonElement>) => {
    const openedByKeyboard = event.detail === 0;
    announcementTransitionKeyboardRef.current = openedByKeyboard;
    announcementReturnIdRef.current = selectedAnnouncementId;
    if (!openedByKeyboard) event.currentTarget.blur();
    setSelectedAnnouncementId(null);
  };

  const onAnnouncementBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeAnnouncement(false);
  };

  // Swipe right to close (SIDE_MENU_SWIPE_*). Only the finger moves the
  // panel; on release the menu's own transition carries it out or back.
  const releaseSwipe = () => {
    swipeRef.current = null;
    panelRef.current?.style.removeProperty("translate");
    panelRef.current?.style.removeProperty("transition");
  };

  const onPanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    sideMenuRestoreFocusRef.current = false;
    if (!controlled || !isOpen || event.pointerType !== "touch" || !event.isPrimary) return;
    swipeRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      sampleX: event.clientX,
      sampleTime: event.timeStamp,
      lastX: event.clientX,
      lastTime: event.timeStamp,
    };
  };

  const onPanelPointerMove = (event: PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    const panel = panelRef.current;
    if (!swipe || !panel || event.pointerId !== swipe.id) return;
    if (event.timeStamp - swipe.sampleTime > SIDE_MENU_SWIPE_SAMPLE_MS) {
      swipe.sampleX = swipe.lastX;
      swipe.sampleTime = swipe.lastTime;
    }
    swipe.lastX = event.clientX;
    swipe.lastTime = event.timeStamp;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.dragging) {
      if (Math.abs(dx) <= SIDE_MENU_SWIPE_SLOP_PX && Math.abs(dy) <= SIDE_MENU_SWIPE_SLOP_PX) {
        return;
      }
      if (dx <= SIDE_MENU_SWIPE_SLOP_PX || dx <= SIDE_MENU_SWIPE_RATIO * Math.abs(dy)) {
        swipeRef.current = null;
        return;
      }
      swipe.dragging = true;
      try {
        panel.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer has already gone */
      }
      panel.style.transition = "none";
    }
    panel.style.translate = `${Math.max(0, dx)}px 0`;
  };

  const onPanelPointerUp = (event: PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || event.pointerId !== swipe.id) return;
    releaseSwipe();
    if (!swipe.dragging) return;
    const dx = event.clientX - swipe.x;
    const speed = (event.clientX - swipe.sampleX) / Math.max(1, event.timeStamp - swipe.sampleTime);
    if (
      dx > SIDE_MENU_SWIPE_CLOSE_PX ||
      (dx > SIDE_MENU_SWIPE_FLICK_MIN_PX && speed > SIDE_MENU_SWIPE_CLOSE_PX_PER_MS)
    ) {
      sideMenuRestoreFocusRef.current = false;
      close();
    }
  };

  const onPanelPointerCancel = (event: PointerEvent<HTMLElement>) => {
    // A row handing its implicit touch capture to the panel is not an end.
    if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
    if (swipeRef.current?.id === event.pointerId) releaseSwipe();
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!controlled || !isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sideMenuRestoreFocusRef.current = true;
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((item) => item.tabIndex >= 0 && item.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === panel ||
        document.activeElement === first ||
        !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      // The last row sits below the fold of a long menu: it scrolls into view,
      // clear of the sticky head, so the wrapped focus is never hidden.
      last.focus({ preventScroll: true });
      last.scrollIntoView({ block: "nearest" });
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div
        className="side-panel-scrim"
        data-open={String(isOpen)}
        aria-hidden="true"
        onPointerDown={() => {
          sideMenuRestoreFocusRef.current = false;
        }}
        onClick={controlled ? close : undefined}
      />
      <aside
        ref={panelRef}
        id="site-side-panel"
        className="side-panel"
        data-liquid-pointer="true"
        data-react-controlled={controlled ? "true" : undefined}
        data-open={String(isOpen)}
        role="dialog"
        data-file-menu={context === "world" ? "true" : undefined}
        aria-modal={true}
        aria-hidden={!isOpen}
        aria-label="サイトメニュー"
        tabIndex={-1}
        inert={controlled ? !isOpen : undefined}
        onPointerDown={onPanelPointerDown}
        onPointerMove={onPanelPointerMove}
        onPointerUp={onPanelPointerUp}
        onPointerCancel={onPanelPointerCancel}
        onLostPointerCapture={onPanelPointerCancel}
        onKeyDown={controlled ? onPanelKeyDown : undefined}
      >
        <LiquidPointerGlow />
        <span className="side-panel-depth" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="side-panel-head">
          <div>
            <p>NAVIGATION</p>
            <b>
              {context === "archive"
                ? "FORM ARCHIVE"
                : context === "cinema"
                  ? "SAGA CINEMA"
                  : context === "movie"
                    ? "DREAM CHAPTER"
                    : context === "rexonance"
                      ? "REXONANCE SAGA"
                      : context === "extreme"
                        ? "EXTREME SAGA"
                        : context === "far-from"
                          ? "FAR FROM SAGA"
                          : context === "illusionculum"
                            ? "ILLUSIONCULUM SAGA"
                            : context === "meta-unitas"
                              ? "META UNITAS SAGA"
                              : context === "final-stage"
                                ? "FINAL STAGE"
                                : "DECEPTION WORLD"}
            </b>
          </div>
          <button
            className="side-panel-close ios26-glass"
            type="button"
            data-liquid-pointer="true"
            aria-label="メニューを閉じる"
            onClick={
              controlled
                ? (event) => {
                    sideMenuRestoreFocusRef.current = event.detail === 0;
                    if (event.detail !== 0) event.currentTarget.blur();
                    close();
                  }
                : undefined
            }
          >
            <LiquidPointerGlow />
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
          <p>FIND A RECORD</p>
          <div className="side-panel-links">
            <button
              type="button"
              className="side-panel-link-button side-panel-quick-search"
              aria-haspopup="dialog"
              aria-keyshortcuts="/ Control+K Meta+K"
              onPointerEnter={prefetchQuickSearch}
              onFocus={prefetchQuickSearch}
              onClick={() => {
                close();
                window.requestAnimationFrame(openQuickSearch);
              }}
            >
              <span>クイック検索</span>
              <i>
                QUICK <kbd aria-hidden="true">/</kbd>
              </i>
            </button>
            <GuardedLink
              to="/search"
              assets={[]}
              beforeNavigate={close}
              aria-current={pathname === "/search" ? "page" : undefined}
            >
              <span>資料を探す</span>
              <i>SEARCH</i>
            </GuardedLink>
            <GuardedLink
              to="/library"
              assets={[]}
              beforeNavigate={close}
              aria-current={pathname === "/library" ? "page" : undefined}
            >
              <span>資料室・しおり</span>
              <i>LIBRARY</i>
            </GuardedLink>
            <LibraryCurrentButton pathname={pathname} hash={locationHash} />
          </div>
        </div>
        <div className="side-panel-group" data-side-menu-sections>
          <p>SECTIONS</p>
          <div className="side-panel-links">
            {context === "world" && fileChapters.length > 0 ? (
              <>
                {fileChapters.map(({ id, label }) => (
                  <GuardedLink key={id} to={pathname} hash={id} assets={[]} beforeNavigate={close}>
                    <span>{label}</span>
                    <i>{FILE_CHAPTER_CODES[id] ?? "SECTION"}</i>
                  </GuardedLink>
                ))}
                <GuardedLink to="/world" assets={[]} beforeNavigate={close}>
                  <span>ワールドへ戻る</span>
                  <i>WORLD</i>
                </GuardedLink>
              </>
            ) : isSpecialSite ? (
              <>
                {SPECIAL_SITE_SECTIONS[
                  context === "rexonance"
                    ? "rexonance"
                    : context === "extreme"
                      ? "extreme"
                      : context === "far-from"
                        ? "far-from"
                        : context === "illusionculum"
                          ? "illusionculum"
                          : context === "meta-unitas"
                            ? "meta-unitas"
                            : "final-stage"
                ].map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to={
                      SPECIAL_SITE_PATHS[
                        context === "rexonance"
                          ? "rexonance"
                          : context === "extreme"
                            ? "extreme"
                            : context === "far-from"
                              ? "far-from"
                              : context === "illusionculum"
                                ? "illusionculum"
                                : context === "meta-unitas"
                                  ? "meta-unitas"
                                  : "final-stage"
                      ]
                    }
                    hash={hash}
                    assets={[]}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "gallery" ? (
              <>
                <GuardedLink to="/gallery" hash="gallery-top" assets={[]} beforeNavigate={close}>
                  <span>ギャラリートップ</span>
                  <i>GALLERY</i>
                </GuardedLink>
                <GuardedLink
                  to="/gallery"
                  hash="gallery-collection"
                  assets={[]}
                  beforeNavigate={close}
                >
                  <span>作品一覧</span>
                  <i>COLLECTION</i>
                </GuardedLink>
                <GuardedLink to="/world" assets={[]} beforeNavigate={close}>
                  <span>ワールドへ戻る</span>
                  <i>WORLD</i>
                </GuardedLink>
              </>
            ) : context === "archive" ? (
              <>
                {[
                  ["top", "トップ", "TOP"],
                  ["story", "ストーリー", "STORY"],
                  ["manager-archive", "六詠", "RIKUEI"],
                  ["riders", "八人のライダー", "RIDERS"],
                  ["records", "レコード", "RECORDS"],
                ].map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to="/world"
                    hash={hash}
                    assets={WORLD_ENTER_ASSETS}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "cinema" ? (
              <>
                {[
                  ["top", "トップ", "TOP"],
                  ["introduction", "作品について", "INTRODUCTION"],
                  ["films", "映画4部作", "THE FOUR FILMS"],
                  ["visuals", "ビジュアル", "VISUAL ARCHIVE"],
                  ["information", "公開情報", "INFORMATION"],
                ].map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to="/saga-cinema"
                    hash={hash}
                    assets={[]}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "movie" ? (
              <>
                <GuardedLink to="/dream-chapter" hash="top" assets={[]} beforeNavigate={close}>
                  <span>トップ</span>
                  <i>TOP</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="posters" assets={[]} beforeNavigate={close}>
                  <span>ポスター</span>
                  <i>POSTERS</i>
                </GuardedLink>
                <GuardedLink
                  to="/dream-chapter"
                  hash="characters"
                  assets={[]}
                  beforeNavigate={close}
                >
                  <span>キャラクター</span>
                  <i>CAST</i>
                </GuardedLink>
                <GuardedLink
                  to="/dream-chapter"
                  hash="dolminence"
                  assets={[]}
                  beforeNavigate={close}
                >
                  <span>ドルミネンス</span>
                  <i>DOLMINENCE</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="cases" assets={[]} beforeNavigate={close}>
                  <span>エピソード</span>
                  <i>CASES</i>
                </GuardedLink>
              </>
            ) : (
              <>
                <GuardedLink to="/world" hash="top" assets={[]} beforeNavigate={close}>
                  <span>トップ</span>
                  <i>TOP</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="story" assets={[]} beforeNavigate={close}>
                  <span>ストーリー</span>
                  <i>STORY</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="manager-archive" assets={[]} beforeNavigate={close}>
                  <span>六詠</span>
                  <i>ARCHIVE</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="riders" assets={[]} beforeNavigate={close}>
                  <span>八人のライダー</span>
                  <i>RIDERS</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="records" assets={[]} beforeNavigate={close}>
                  <span>レコード</span>
                  <i>RECORDS</i>
                </GuardedLink>
                {reDiveReached ? (
                  <GuardedLink to="/world" hash="re-dive" assets={[]} beforeNavigate={close}>
                    <span>機密ファイル</span>
                    <i>CLASSIFIED</i>
                  </GuardedLink>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="side-panel-group">
          <p>SPECIAL</p>
          {/* The order (owner, 2026-10-23: 「ファーフロムは一番最後です。」):
              エクスプリーム, レクソナンス, イリュージョンクルム, メタ・ウニタス,
              then ファーフロム, a little larger (styles-stage-shell.css). Each
              tile is its form's art and its name. */}
          <div className="side-panel-links" data-special-tiles="">
            <GuardedLink
              to="/extreme-saga"
              hash="top"
              assets={context === "extreme" ? [] : EXTREME_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "extreme" ? "page" : undefined}
            >
              <span>
                <DisplayName value="エクスプリームサーガ" />
              </span>
            </GuardedLink>
            <GuardedLink
              to="/rexonance-saga"
              hash="top"
              assets={context === "rexonance" ? [] : REXONANCE_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "rexonance" ? "page" : undefined}
            >
              <span>
                <DisplayName value="レクソナンスサーガ" />
              </span>
            </GuardedLink>
            <GuardedLink
              to="/illusionculum-saga"
              hash="top"
              assets={context === "illusionculum" ? [] : ILLUSIONCULUM_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "illusionculum" ? "page" : undefined}
            >
              <span>
                <DisplayName value="イリュージョンクルムサーガ" />
              </span>
            </GuardedLink>
            <GuardedLink
              to="/meta-unitas-saga"
              hash="top"
              assets={context === "meta-unitas" ? [] : META_UNITAS_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "meta-unitas" ? "page" : undefined}
            >
              <span>
                <DisplayName value="メタ・ウニタスサーガ" />
              </span>
            </GuardedLink>
            <GuardedLink
              to="/far-from-saga"
              hash="top"
              assets={context === "far-from" ? [] : FAR_FROM_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "far-from" ? "page" : undefined}
            >
              <span>
                <DisplayName value="ファーフロムサーガ" />
              </span>
            </GuardedLink>
          </div>
        </div>
        {/* The films' and the site's names wrap between their phrases in
            every engine (WebKit has no auto-phrase): 映画第一作 /
            「ドリームチャプター」, ディセプション / ワールド. The names are
            unchanged, and so are the links' accessible names. */}
        <div className="side-panel-group">
          <p>STORIES</p>
          <div className="side-panel-links">
            <CinemaLink beforeNavigate={close} active={context === "cinema"} />
            {context === "movie" ? (
              <>
                <GuardedLink
                  to="/dream-chapter"
                  hash="top"
                  assets={[]}
                  beforeNavigate={close}
                  aria-current="page"
                >
                  <span>
                    <span className="side-panel-phrase">映画第一作</span>
                    <wbr />
                    <span className="side-panel-phrase">「ドリームチャプター」</span>
                  </span>
                  <i>MOVIE 01</i>
                </GuardedLink>
                <GuardedLink
                  to="/world"
                  hash="top"
                  assets={WORLD_ENTER_ASSETS}
                  transition="dream"
                  beforeNavigate={close}
                >
                  <span>
                    <span className="side-panel-phrase">ディセプション</span>
                    <wbr />
                    <span className="side-panel-phrase">ワールド</span>
                  </span>
                  <i>MAIN SITE</i>
                </GuardedLink>
              </>
            ) : (
              <>
                <GuardedLink
                  to="/dream-chapter"
                  assets={DREAM_CHAPTER_ENTER_ASSETS}
                  beforeNavigate={close}
                >
                  <span>
                    <span className="side-panel-phrase">映画第一作</span>
                    <wbr />
                    <span className="side-panel-phrase">「ドリームチャプター」</span>
                  </span>
                  <i>MOVIE 01</i>
                </GuardedLink>
                {/* The special sites stand apart from the World: its way home
                    sits in story order, as it does on the Dream Chapter. */}
                {isSpecialSite || context === "cinema" ? (
                  <GuardedLink
                    to="/world"
                    hash="top"
                    assets={WORLD_ENTER_ASSETS}
                    beforeNavigate={close}
                  >
                    <span>
                      <span className="side-panel-phrase">ディセプション</span>
                      <wbr />
                      <span className="side-panel-phrase">ワールド</span>
                    </span>
                    <i>MAIN SITE</i>
                  </GuardedLink>
                ) : null}
              </>
            )}
            <GuardedLink
              to="/final-stage"
              hash="top"
              assets={context === "final-stage" ? [] : FINAL_STAGE_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "final-stage" ? "page" : undefined}
            >
              <span>ファイナルステージ</span>
              <i>FINAL STAGE</i>
            </GuardedLink>
          </div>
        </div>
        {context === "world" ? (
          <div className="side-panel-group side-panel-riders">
            <p>RIDERS</p>
            <div className="side-panel-links">
              {RIDER_NAV.map((r, i) =>
                r.href ? (
                  <GuardedLink
                    key={r.id}
                    to={r.href}
                    assets={r.assets}
                    beforeNavigate={close}
                    aria-current={pathname === r.href ? "page" : undefined}
                  >
                    <span>{r.name}</span>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                  </GuardedLink>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
        {context === "world" ? (
          <>
            <div className="side-panel-group side-panel-files side-panel-rikuei">
              <p>RIKUEI</p>
              <div className="side-panel-links">
                {RIKUEI_NAV.map((file) => (
                  <GuardedLink
                    key={file.href}
                    to={file.href!}
                    assets={file.assets}
                    beforeNavigate={close}
                    aria-current={pathname === file.href ? "page" : undefined}
                  >
                    {isOpen ? (
                      <img src={launcherTile(file.href)} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    <span>{file.name}</span>
                    <i>{file.id}</i>
                  </GuardedLink>
                ))}
              </div>
            </div>
            <div className="side-panel-group side-panel-files side-panel-related">
              <p>RELATED</p>
              <div className="side-panel-links">
                {[
                  ...(reDiveReached || pathname === "/characters/ciel"
                    ? RE_DIVE_RIKUEI_NAV.filter((file) => file.href === "/characters/ciel")
                    : []),
                  ...RELATED_NAV,
                  YOAKE_MAMORI_LINK,
                ].map((file) => (
                  <GuardedLink
                    key={file.href}
                    to={file.href!}
                    assets={file.assets}
                    beforeNavigate={close}
                    aria-current={pathname === file.href ? "page" : undefined}
                  >
                    {isOpen ? (
                      <img src={launcherTile(file.href)} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    <span>{file.name}</span>
                    <i>FILE</i>
                  </GuardedLink>
                ))}
              </div>
            </div>
          </>
        ) : null}
        <div className="side-panel-group">
          <p>UNMANAGED</p>
          <div className="side-panel-links">
            <GuardedLink
              to="/characters/dante"
              assets={["/character-dante.webp"]}
              beforeNavigate={close}
              aria-current={pathname === "/characters/dante" ? "page" : undefined}
            >
              <span>ダンテ／ヴァルグ</span>
              <i>第二の犬</i>
            </GuardedLink>
          </div>
        </div>
        <div className="side-panel-group">
          <p>INFORMATION</p>
          <div className="side-panel-links">
            <GuardedLink
              to="/gallery"
              assets={GALLERY_CURTAIN_STICKERS}
              beforeNavigate={close}
              aria-current={pathname === "/gallery" ? "page" : undefined}
            >
              <span>ギャラリー</span>
              <i>VISUAL COLLECTION</i>
            </GuardedLink>
            <button
              ref={announcementTriggerRef}
              className="side-panel-link-button side-panel-announcement-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-controls="site-announcement-dialog"
              onClick={openAnnouncements}
            >
              <span>お知らせ</span>
              <i>NOTICE</i>
            </button>
          </div>
        </div>
        <div className="side-panel-group">
          <p>SYSTEM</p>
          <div className="side-panel-links">
            {context === "archive" ? (
              <GuardedLink
                to="/form-archive"
                hash="archive-switcher"
                assets={[]}
                beforeNavigate={close}
                aria-current="page"
              >
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </GuardedLink>
            ) : (
              <GuardedLink to="/form-archive" assets={[]} beforeNavigate={close}>
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </GuardedLink>
            )}
            <ZeusButtonToggle />
            <IpadMenuToggle />
            <Link
              to="/"
              onClick={(e) => {
                // The title skips an opening already seen this session (a
                // browser Back); asked for from here, it plays in full. A
                // modified click opens a new tab with its own session, so it
                // leaves this tab's Back alone.
                if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  try {
                    window.sessionStorage.setItem("dw-opening-replay", "1");
                  } catch {
                    /* storage unavailable: the opening plays anyway */
                  }
                }
                if (controlled) close();
              }}
            >
              <span>オープニング</span>
              <i>OPENING</i>
            </Link>
          </div>
        </div>
      </aside>
      <dialog
        ref={announcementRef}
        id="site-announcement-dialog"
        className="site-announcement-dialog"
        aria-labelledby="site-announcement-hub-title"
        tabIndex={-1}
        onClick={onAnnouncementBackdrop}
        onCancel={(event) => {
          event.preventDefault();
          closeAnnouncement(true);
        }}
        onClose={() => setAnnouncementOpen(false)}
      >
        <section
          className="site-announcement-hub"
          data-view={selectedAnnouncement ? "detail" : "index"}
        >
          <span className="site-announcement-aura" aria-hidden="true" />
          <header className="site-announcement-header">
            <div>
              <p>
                INFORMATION
                <span className="site-announcement-kicker-tail">{" / ARCHIVE"}</span>
              </p>
              <h2 id="site-announcement-hub-title">お知らせ</h2>
            </div>
            <span
              className="site-announcement-count"
              aria-label={`お知らせ${SITE_ANNOUNCEMENTS.length}件`}
            >
              {String(SITE_ANNOUNCEMENTS.length).padStart(2, "0")} ACTIVE
            </span>
            <button
              className="site-announcement-close ios26-glass"
              type="button"
              aria-label="お知らせを閉じる"
              onClick={(event) => {
                event.stopPropagation();
                const restoreFocus = event.detail === 0;
                if (!restoreFocus) event.currentTarget.blur();
                closeAnnouncement(restoreFocus);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
          <div ref={announcementStageRef} className="site-announcement-stage">
            {selectedAnnouncement ? (
              <article
                className={`site-announcement-detail${
                  selectedAnnouncement.metrics?.length ? " is-product-release" : ""
                }`}
              >
                <button
                  ref={announcementBackRef}
                  className="site-announcement-back"
                  type="button"
                  onClick={returnToAnnouncementIndex}
                >
                  <span aria-hidden="true">←</span>
                  一覧へ戻る
                </button>
                <figure className="site-announcement-visual">
                  {announcementOpen ? (
                    <img
                      src={selectedAnnouncement.image}
                      alt={selectedAnnouncement.imageAlt}
                      width={selectedAnnouncement.width}
                      height={selectedAnnouncement.height}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : null}
                </figure>
                <div className="site-announcement-copy">
                  <p className="site-announcement-meta">
                    NOTICE / {selectedAnnouncement.sequence}
                    <time dateTime={selectedAnnouncement.date.replaceAll(".", "-")}>
                      {selectedAnnouncement.date}
                    </time>
                  </p>
                  {selectedAnnouncement.eyebrow ? (
                    <span className="site-announcement-eyebrow">
                      {selectedAnnouncement.eyebrow}
                    </span>
                  ) : null}
                  <h3>
                    <PhrasedTitle text={selectedAnnouncement.title} />
                  </h3>
                  {selectedAnnouncement.lede ? (
                    <p className="site-announcement-lede">{selectedAnnouncement.lede}</p>
                  ) : null}
                  {selectedAnnouncement.metrics?.length ? (
                    <section
                      className="site-announcement-release"
                      aria-labelledby={`${selectedAnnouncement.id}-comparison-title`}
                    >
                      <p
                        className="site-announcement-release-title"
                        id={`${selectedAnnouncement.id}-comparison-title`}
                      >
                        {selectedAnnouncement.comparisonTitle}
                      </p>
                      <div className="site-announcement-metrics">
                        {selectedAnnouncement.metrics.map((metric) => (
                          <div className="site-announcement-metric" key={metric.label}>
                            <b>{metric.value}</b>
                            <span>{metric.label}</span>
                            <small>{metric.detail}</small>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {selectedAnnouncement.body ? (
                    <p className="site-announcement-body">{selectedAnnouncement.body}</p>
                  ) : null}
                  {selectedAnnouncement.note ? (
                    <small className="site-announcement-note">{selectedAnnouncement.note}</small>
                  ) : null}
                </div>
              </article>
            ) : (
              <div className="site-announcement-index">
                <div className="site-announcement-index-copy">
                  <p>新着情報と記録された通信を選択してください。</p>
                  <span>SELECT TRANSMISSION</span>
                </div>
                <ul className="site-announcement-list">
                  {SITE_ANNOUNCEMENTS.map((notice) => (
                    <li key={notice.id}>
                      <button
                        className="site-announcement-list-item"
                        type="button"
                        data-announcement-id={notice.id}
                        onClick={(event) => openAnnouncementDetail(event, notice.id)}
                        aria-label={`${notice.title}を開く`}
                      >
                        <span
                          className="site-announcement-list-visual"
                          aria-hidden="true"
                          style={announcementPosterStyle(notice)}
                        >
                          {announcementOpen ? (
                            <img
                              src={notice.image}
                              alt=""
                              width={notice.width}
                              height={notice.height}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                            />
                          ) : null}
                        </span>
                        <span className="site-announcement-list-copy">
                          <span>
                            <small>{notice.sequence}</small>
                            <time dateTime={notice.date.replaceAll(".", "-")}>{notice.date}</time>
                          </span>
                          <b>
                            <PhrasedTitle text={notice.title} />
                          </b>
                          <i>OPEN RECORD</i>
                        </span>
                        <span className="site-announcement-list-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </dialog>
    </>
  );
}
