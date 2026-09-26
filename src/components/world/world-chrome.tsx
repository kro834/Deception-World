import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  EXTREME_SAGA_ENTER_ASSETS,
  FINAL_STAGE_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { RIDER_NAV } from "./dossier-nav";
import { LiquidPointerGlow } from "./liquid-rail";
import { UiVectorIcon } from "./ui-vector-icon";
import { worldChapterLine } from "./world-chapter-marker";

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
    title: "比較にならない最強の姿、レクソナンスサーガを発表。",
    image: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    imageAlt: "水色とピンクの星光をまとい、金色の神装を備えた仮面ライダーレクソナンスサーガ",
    width: 680,
    height: 906,
    eyebrow: "The next generation of SA-GA.",
    lede: "無限出力を、無限の攻撃へ。",
    comparisonTitle: "エクスプリームサーガ標準値比",
    metrics: [
      { value: "+61.6%", label: "PUNCH POWER", detail: "332.2t / 205.6t" },
      { value: "+55.6%", label: "KICK POWER", detail: "480.5t / 308.9t" },
      { value: "+480.6%", label: "JUMP HEIGHT", detail: "6000m / 1033.5m" },
      { value: "−89.5%", label: "100m TIME", detail: "0.00021s / 0.002s" },
    ],
    body: "ゼウスの超自己進化、レックスの絶対秩序、そして月城悠真の意思を一つの共鳴へ束ね、エクスプリームが切り開いた無制限出力を実効攻撃へ変換。標準状態からエクスプリーム・ウルトラを上回る、サーガシステムの次世代到達点です。ヴィンクルムサーガと比較して650%以上の反応速度と、エクスプリームサーガと比較して最大900%高い機動力を発揮。サーガシステムのウルトラハイエンドモデルに相応しい性能を備えています。",
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
  },
] as const satisfies readonly SiteAnnouncement[];

type AnnouncementId = (typeof SITE_ANNOUNCEMENTS)[number]["id"];

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
  return (
    <button
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
              const openedByKeyboard = event.detail === 0;
              window.dispatchEvent(
                new CustomEvent(SIDE_MENU_OPEN_INPUT_EVENT, {
                  detail: { keyboard: openedByKeyboard },
                }),
              );
              if (!openedByKeyboard) event.currentTarget.blur();
              onOpenChange(true);
            }
          : undefined
      }
    >
      <LiquidPointerGlow />
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

  return (
    <>
      <SideMenuLayer open={menuOpen} onOpenChange={setMenuOpen} />
      <header className="manager-topbar">
        <GuardedLink
          to="/world"
          hash={returnHash}
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
            hash={returnHash}
            assets={[]}
            className="manager-back"
            aria-label={returnAriaLabel}
          >
            <span>{returnLabel}</span>
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
  context?: "world" | "archive" | "movie" | "rexonance" | "extreme" | "final-stage";
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
    context === "rexonance" || context === "extreme" || context === "final-stage";
  // The dossier the reader is on is marked in the menu (aria-current).
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // RE DIVE (rising-world.tsx) joins the World's sections once reached this
  // session; read when the menu opens.
  const [reDiveReached, setReDiveReached] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    try {
      setReDiveReached(window.sessionStorage.getItem("dw-re-dive") === "1");
    } catch {
      setReDiveReached(false);
    }
  }, [isOpen]);
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
    const rememberInput = (event: Event) => {
      const detail = (event as CustomEvent<{ keyboard?: boolean }>).detail;
      sideMenuRestoreFocusRef.current = detail?.keyboard === true;
    };
    window.addEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
    return () => window.removeEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
  }, []);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const root = document.documentElement;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.scrollTop = 0;
    // The reader's own row (a dossier in RIDERS or UNMANAGED) sits below the
    // fold of the long menu on a laptop as on a phone: the menu opens with it
    // in view, clear of the bottom edge by the panel's own bottom padding
    // (32px, plus the home indicator's inset on an iPhone). Only the panel
    // scrolls; scrollIntoView could also move the locked page behind it.
    const current = panel.querySelector<HTMLElement>('.side-panel-links > [aria-current="page"]');
    if (current) {
      const clearance = parseFloat(window.getComputedStyle(panel).paddingBottom) || 24;
      const overflow =
        current.getBoundingClientRect().bottom + clearance - panel.getBoundingClientRect().bottom;
      if (overflow > 0) panel.scrollTop += overflow;
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
      // Released before focus returns: an inert opener cannot take it.
      for (const element of inerted) element.inert = false;
      window.cancelAnimationFrame(focusFrame);
      swipeRef.current = null;
      panel.style.removeProperty("translate");
      panel.style.removeProperty("transition");
      document.removeEventListener("touchmove", containBackgroundScroll, true);
      document.removeEventListener("wheel", containBackgroundScroll, true);
      document.removeEventListener("focusin", containBackgroundFocus, true);
      releaseViewportScrollLock();
      delete root.dataset.sideMenuOpen;
      if (sideMenuRestoreFocusRef.current) {
        previousFocus?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      sideMenuRestoreFocusRef.current = false;
    };
  }, [controlled, isOpen, onOpenChange]);

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
                : context === "movie"
                  ? "DREAM CHAPTER"
                  : context === "rexonance"
                    ? "REXONANCE SAGA"
                    : context === "extreme"
                      ? "EXTREME SAGA"
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
          <p>SECTIONS</p>
          <div className="side-panel-links">
            {isSpecialSite ? (
              <>
                {(context === "rexonance"
                  ? [
                      ["top", "トップ", "TOP"],
                      ["performance", "パフォーマンス", "PERFORMANCE"],
                      ["p14", "P14", "PROCESSOR"],
                      ["stages", "三つの運用段階", "STAGES"],
                      ["system", "トリニティ・レゾナンス", "SYSTEM"],
                    ]
                  : context === "extreme"
                    ? [
                        ["top", "トップ", "TOP"],
                        ["performance", "性能比較", "COMPARISON"],
                        ["p14", "P14", "PROCESSOR"],
                        ["stages", "二つの運用段階", "STAGES"],
                        ["system", "中核システム", "SYSTEM"],
                      ]
                    : [
                        ["top", "トップ", "TOP"],
                        ["story", "あらすじ", "STORY"],
                        ["characters", "登場人物", "CHARACTERS"],
                        ["far-from-saga", "ファーフロムサーガ", "RIDER 01"],
                        ["realm-royal", "レルムロイヤル", "RIDER 02"],
                      ]
                ).map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to={
                      context === "rexonance"
                        ? "/rexonance-saga"
                        : context === "extreme"
                          ? "/extreme-saga"
                          : "/final-stage"
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
                    <span>RE DIVE</span>
                    <i>RIKUEI</i>
                  </GuardedLink>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="side-panel-group">
          <p>SPECIAL</p>
          <div className="side-panel-links">
            <GuardedLink
              to="/extreme-saga"
              hash="top"
              assets={context === "extreme" ? [] : EXTREME_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "extreme" ? "page" : undefined}
            >
              <span>エクスプリームサーガ</span>
              <i>SUPREME SITE</i>
            </GuardedLink>
            <GuardedLink
              to="/rexonance-saga"
              hash="top"
              assets={context === "rexonance" ? [] : REXONANCE_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "rexonance" ? "page" : undefined}
            >
              <span>レクソナンスサーガ</span>
              <i>PERFORMANCE SITE</i>
            </GuardedLink>
          </div>
        </div>
        <div className="side-panel-group">
          <p>STORIES</p>
          <div className="side-panel-links">
            {context === "movie" ? (
              <>
                <GuardedLink
                  to="/dream-chapter"
                  hash="top"
                  assets={[]}
                  beforeNavigate={close}
                  aria-current="page"
                >
                  <span>映画第一作「ドリームチャプター」</span>
                  <i>MOVIE 01</i>
                </GuardedLink>
                <GuardedLink
                  to="/world"
                  hash="top"
                  assets={WORLD_ENTER_ASSETS}
                  transition="dream"
                  beforeNavigate={close}
                >
                  <span>ディセプションワールド</span>
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
                  <span>映画第一作「ドリームチャプター」</span>
                  <i>MOVIE 01</i>
                </GuardedLink>
                {/* The special sites stand apart from the World: its way home
                    sits in story order, as it does on the Dream Chapter. */}
                {isSpecialSite ? (
                  <GuardedLink
                    to="/world"
                    hash="top"
                    assets={WORLD_ENTER_ASSETS}
                    beforeNavigate={close}
                  >
                    <span>ディセプションワールド</span>
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
        <div className="side-panel-group">
          <p>UNMANAGED</p>
          <div className="side-panel-links">
            <GuardedLink
              to="/characters/dante"
              assets={["/character-dante.webp"]}
              beforeNavigate={close}
              aria-current={pathname === "/characters/dante" ? "page" : undefined}
            >
              <span>ダンテ</span>
              <i>管理人殺し</i>
            </GuardedLink>
          </div>
        </div>
        <div className="side-panel-group">
          <p>INFORMATION</p>
          <div className="side-panel-links">
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
              <p>INFORMATION / ARCHIVE</p>
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
                  <h3>{selectedAnnouncement.title}</h3>
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
                        <span className="site-announcement-list-visual" aria-hidden="true">
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
                          <b>{notice.title}</b>
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
