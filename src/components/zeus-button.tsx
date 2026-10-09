import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { useLoadGate } from "@/components/load-gate";
import { guardTapThrough } from "@/lib/tap-through-guard";
import { createViewportResizeFilter } from "@/lib/viewport-resize";
import { isAndroidRenderer } from "@/lib/rendering-profile.js";
import {
  clampZeusCenter,
  getZeusDragPosition,
  type ZeusBounds,
  type ZeusDragGeometry,
} from "@/lib/zeus-drag";
import {
  ZEUS_BUTTON_RETURN_SRCSET,
  ZEUS_BUTTON_SIZES,
  ZEUS_BUTTON_SRCSET,
} from "@/lib/thumbnail-images";

type ZeusButtonPosition = { x: number; y: number };

type ZeusButtonSettings = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const ENABLED_KEY = "deception-world:zeus-button-enabled";
const POSITION_KEY = "deception-world:zeus-button-position";
const DEFAULT_POSITION: ZeusButtonPosition = { x: 0.95, y: 0.82 };
const LONG_PRESS_MS = 420;
// A press still down at this point shows the hold filling in, so it reads as
// a hold before the drag takes over at LONG_PRESS_MS.
const HOLD_CUE_MS = 160;
// A touch or pen release after this is an abandoned hold, not a tap: it
// stays put. Close to LONG_PRESS_MS, so a slow tap still counts. A mouse has
// no abandoned hold (it drags on the first move), so its click always counts.
const TAP_MAX_MS = 380;
const MOVE_TOLERANCE = 9;
const RETURN_IMAGE_MIN_MS = 360;
// Relocations glide; the timer cleans up after the 220ms transition, or at
// once where reduced motion or economy leave no transition.
const GLIDE_MS = 260;
// A drop this close to a side edge docks on it.
const EDGE_SNAP_PX = 48;
const ZEUS_AVOID_SELECTOR = [
  ".ios-slide-open",
  ".episode-pickup-plus",
  ".episode-controls button",
  ".side-panel-trigger",
  ".side-panel-close",
  ".world-column-dialog-close",
  ".form-pickup-close",
  ".episode-pickup-close",
  ".rider-nightmare-dialog-close",
  ".dream-hero-actions a",
  ".dream-dossier-close",
  ".rw-gate-button",
  '.manager-archive-tabs [role="tab"]',
  '.world-column-tabs [role="tab"]',
  ".finale-content .primary-action",
  "footer > a",
  ".manager-pagination > a > span:last-child",
  // PREV / NEXT kicker and name: a mirrored step must not land on the text.
  ".manager-pagination > a > :is(small, b)",
  ".dossier-index-return",
  ".dossier-read-link",
  ".rxs-footer > a",
  // 2026-10-02: Rexonance's P14 baseline pills and its live readout chip, which
  // the button covered at 844x390 (dreamx/rx-audit O3).
  ".rxs-p14-range-labels button",
  ".rxs-p14-comparator output",
  // Disclosure rows: the whole summary, so its drawn open cue counts too.
  ".wa-profile > summary",
  ".wa-doc > summary",
  ".dream-story-case > summary",
  // Dream's phone PROFILE switch on the cast tiles (a button, same role).
  ".dream-roster-switch",
  // 2026-10-02 Track D: the Dream archive's fold rows (CASE, CIRCLE, group, speaker and
  // leaf summaries), only once their list has been revealed: an unrevealed fold is off
  // screen anyway, and matching it would force the layout of its skipped annex on every
  // placement pass (55ms at 4x CPU on a Pixel at the page top).
  '[data-dream-visible="true"] .dream-archive-fold > summary',
  // RE DIVE's 欠番 tags on the sealed III and VI plates: small words the
  // glyph pass skips (only display figures of 24px count), so on phones the
  // button could rest on the VI strip's tag.
  ".re-dive-section .signal.is-vacant > b",
  ".wa-open",
  ".wa-contents a",
  ".dream-contents a",
  // Full-width, but a sideways swipe that starts on the button cannot move it.
  ".wa-quote-rail",
  ".wa-quote-controls",
  '.rider-tabs [role="tab"]',
  '.rxs-stage-tabs [role="tab"]',
  ".dream-poster-thumbnails button",
  ".dream-poster-controls button",
  ".rxs-comparison-selector select",
  ".rxs-p14-range-labels button",
  "#rxs-p14-baseline",
  ".rider-special-site-link",
  ".dream-agent-open",
  ".dream-chapter-nav a",
  ".dossier-reader-links a",
  ".hero-actions .primary-action",
  // rx10 STAGE: the library's rider files and card bookmarks, the record
  // index's field, and the /download and 404 cards' ways back, which the
  // button covered on phones.
  ".library-cast-tile",
  ".library-card-actions button",
  ".search-input-row",
  ".export-page :is(.export-page-alt, .export-page-back)",
  ".app-not-found > a",
].join(",");
// A control taller than this share of the screen would block every spot and
// pin the button home over it; its words still count through the glyphs.
const ZEUS_AVOID_MAX_HEIGHT = 0.45;
// Candidates past this index (the far corner rows) are taken only when clear.
const ZEUS_NEAR_CANDIDATES = 10;
// The fallback weighs covered words (px²) against distance from home (px).
const ZEUS_FALLBACK_DISTANCE_WEIGHT = 12;
// A flip wider than this (a tablet or desktop, a landscape phone) crosses the
// whole page: the third step up on its own side is tried before it.
const ZEUS_FLIP_MAX_PX = 480;
/* Words the button never rests on: titles and the labels of controls. They are
   measured by their glyph boxes, not their element boxes, so a wide heading or
   a whole-card link moves the button only when it would cover the words
   themselves (レクソナンスサー|ガ). Display figures count as titles. */
const ZEUS_AVOID_TEXT_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  '[role="heading"]',
  "a[href]",
  "button",
  '[role="tab"]',
  "summary",
  "label",
].join(",");
const ZEUS_DISPLAY_TEXT_SELECTOR = "strong, b";
const ZEUS_DISPLAY_TEXT_MIN_PX = 24;
// At the end of the page nothing more scrolls out from under the button, so
// any text there counts.
const ZEUS_END_TEXT_SELECTOR = "p, li, dt, dd, small, span, em, q, blockquote, figcaption, time";
const ZEUS_TEXT_GAP = 6;
const ZeusButtonContext = createContext<ZeusButtonSettings | null>(null);

type ZeusRect = { left: number; right: number; top: number; bottom: number };

const meetsAny = (rect: ZeusRect, zones: ZeusRect[]) =>
  zones.some(
    (zone) =>
      rect.left < zone.right &&
      rect.right > zone.left &&
      rect.top < zone.bottom &&
      rect.bottom > zone.top,
  );

/* A sandboxed frame (the form archive) cannot be read from here, so it
   reports its own words and fixed controls (public/archive-zeus-bridge.js)
   as boxes in its viewport. They are kept per frame and placed on screen
   through the frame's box when a spot is chosen. */
const FRAME_AVOID_MESSAGE = "deception-world:frame-avoid";
const FRAME_AVOID_MAX = 480;
type FrameAvoid = { words: ZeusRect[]; controls: ZeusRect[] };
const frameAvoid = new Map<MessageEventSource, FrameAvoid>();

const readFrameBoxes = (value: unknown): ZeusRect[] => {
  if (!Array.isArray(value)) return [];
  const boxes: ZeusRect[] = [];
  for (const item of value.slice(0, FRAME_AVOID_MAX)) {
    if (!Array.isArray(item) || item.length !== 4) continue;
    const [left, top, right, bottom] = item as unknown[];
    if (![left, top, right, bottom].every((n) => typeof n === "number" && Number.isFinite(n)))
      continue;
    boxes.push({
      left: left as number,
      top: top as number,
      right: right as number,
      bottom: bottom as number,
    });
  }
  return boxes;
};

/* Each reporting frame's boxes moved onto the page, cut to the frame's own
   box. A frame that has left the page (the archive switched) is forgotten. */
function readFrameAvoid(pick: (entry: FrameAvoid) => ZeusRect[]) {
  const placed: ZeusRect[] = [];
  if (frameAvoid.size === 0) return placed;
  const frames = Array.from(document.querySelectorAll("iframe"));
  for (const [source, entry] of frameAvoid) {
    const frame = frames.find((candidate) => candidate.contentWindow === source);
    if (!frame) {
      frameAvoid.delete(source);
      continue;
    }
    const rect = frame.getBoundingClientRect();
    const left = rect.left + frame.clientLeft;
    const top = rect.top + frame.clientTop;
    const clip = {
      left,
      top,
      right: left + frame.clientWidth,
      bottom: top + frame.clientHeight,
    };
    for (const box of pick(entry)) {
      const onPage = {
        left: Math.max(clip.left, box.left + left),
        top: Math.max(clip.top, box.top + top),
        right: Math.min(clip.right, box.right + left),
        bottom: Math.min(clip.bottom, box.bottom + top),
      };
      if (onPage.right > onPage.left && onPage.bottom > onPage.top) placed.push(onPage);
    }
  }
  return placed;
}

/* Words that are not drawn (a closed disclosure's contents) are passed over
   before they are measured. Reading their box lays them out: at the end of
   /world that laid out every closed PROFILE, fetched the Japanese font slices
   for their rarer kanji, and each slice's arrival relaid the whole page
   mid-scroll. Engines without checkVisibility measure everything, as before. */
const drawn = (element: Element) =>
  typeof element.checkVisibility !== "function" || element.checkVisibility();

/* The glyph boxes of the words inside the candidate spots. Only elements whose
   box meets a spot are walked, so this is a handful of ranges, read once when
   scrolling settles. Inside a dialog only its own words count: the page
   behind it is covered anyway. */
function readAvoidText(button: HTMLElement, zones: ZeusRect[], pageEnd: boolean) {
  const root: ParentNode = button.closest("dialog") ?? document;
  const glyphs: ZeusRect[] = [];
  const walked = new Set<Element>();
  const range = document.createRange();
  const collect = (selector: string, accept?: (element: HTMLElement) => boolean) => {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (element === button || button.contains(element)) continue;
      if (!drawn(element)) continue;
      if (!meetsAny(element.getBoundingClientRect(), zones)) continue;
      // A title inside a card link is walked once, with the link.
      if (walked.has(element) || element.parentElement?.closest(selector)) continue;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (accept && !accept(element)) continue;
      walked.add(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue?.trim()) continue;
        // A walked card's own closed disclosure is not drawn either.
        if (node.parentElement && !drawn(node.parentElement)) continue;
        // Words kept for screen readers only overflow a clipped 1px box.
        const holder = node.parentElement?.getBoundingClientRect();
        if (holder && (holder.width < 2 || holder.height < 2)) continue;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0 && rect.height > 0 && meetsAny(rect, zones)) glyphs.push(rect);
        }
      }
    }
  };
  collect(ZEUS_AVOID_TEXT_SELECTOR);
  collect(
    ZEUS_DISPLAY_TEXT_SELECTOR,
    (element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize) >= ZEUS_DISPLAY_TEXT_MIN_PX,
  );
  if (pageEnd && root === document) collect(ZEUS_END_TEXT_SELECTOR);
  // A framed archive's words, as it last reported them.
  if (root === document) {
    for (const word of readFrameAvoid((entry) => entry.words)) {
      if (meetsAny(word, zones)) glyphs.push(word);
    }
  }
  return glyphs;
}

/* A fixed or sticky bar across the top of the screen (a header, a chapter
   nav). Only the steps away from home are kept off it; a spot the reader
   chose is theirs. One hit test and a short ancestor walk per settle. */
function readTopBar(button: HTMLElement, x: number, y: number): ZeusRect | null {
  const hit = document.elementFromPoint?.(x, y) ?? null;
  for (
    let element: Element | null = hit;
    element && element !== document.body && element !== document.documentElement;
    element = element.parentElement
  ) {
    if (element === button || button.contains(element)) return null;
    const { position } = window.getComputedStyle(element);
    if (position !== "fixed" && position !== "sticky") continue;
    const rect = element.getBoundingClientRect();
    return rect.height > 0 && rect.height < window.innerHeight * 0.4 ? rect : null;
  }
  return null;
}

// The stylesheet has no glide under reduced motion or economy; skip the writes.
const reducedGlide = () =>
  document.documentElement?.dataset?.worldEffects === "economy" ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function readPosition(): ZeusButtonPosition {
  try {
    const stored = window.localStorage.getItem(POSITION_KEY);
    if (!stored) return DEFAULT_POSITION;
    const parsed = JSON.parse(stored) as Partial<ZeusButtonPosition>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return {
        x: Math.max(0, Math.min(1, parsed.x)),
        y: Math.max(0, Math.min(1, parsed.y)),
      };
    }
  } catch {
    /* Use the default position when storage is unavailable or malformed. */
  }
  return DEFAULT_POSITION;
}

export function ZeusButtonProvider({ children }: { children: ReactNode }) {
  const { go } = useLoadGate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [enabled, setEnabledState] = useState(true);
  const [position, setPosition] = useState<ZeusButtonPosition>(DEFAULT_POSITION);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const navigatingRef = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const [returnImage, setReturnImage] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(window.localStorage.getItem(ENABLED_KEY) !== "false");
    } catch {
      setEnabledState(true);
    }
    setPosition(readPosition());
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateTarget = () => {
      frame = 0;
      const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
      setPortalTarget(openDialogs.at(-1) ?? document.body);
      setSideMenuOpen(Boolean(document.querySelector('.side-panel[data-open="true"]')));
    };
    const scheduleTargetUpdate = (records: MutationRecord[]) => {
      // Animated text and card updates do not change the portal surface.
      const containsSurface = (node: Node) =>
        node instanceof Element &&
        (node.matches("dialog, .side-panel") || Boolean(node.querySelector("dialog, .side-panel")));
      const surfacesChanged = records.some((record) =>
        record.type === "attributes"
          ? record.target instanceof Element && record.target.matches("dialog, .side-panel")
          : [...record.addedNodes, ...record.removedNodes].some(containsSurface),
      );
      if (!surfacesChanged) return;
      if (frame) return;
      frame = window.requestAnimationFrame(updateTarget);
    };
    updateTarget();
    const observer = new MutationObserver(scheduleTargetUpdate);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open", "data-open"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(ENABLED_KEY, String(next));
    } catch {
      /* The in-memory preference still applies for this session. */
    }
  }, []);

  const savePosition = useCallback((next: ZeusButtonPosition) => {
    setPosition(next);
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(next));
    } catch {
      /* The in-memory position still applies for this session. */
    }
  }, []);

  const settings = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  const goToTop = useCallback(async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setNavigating(true);
    setReturnImage(true);
    const returnImageStartedAt = performance.now();

    try {
      // Give the compact image swap one paint before navigation. The shared
      // fullscreen gate remains reserved for form-archive transitions.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      document.dispatchEvent(new CustomEvent("deception-world:cancel-route-transition"));
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
      ).reverse();
      for (const dialog of openDialogs) {
        try {
          dialog.close("zeus-navigation");
        } catch {
          /* A dialog may already be closing through its own transition. */
        }
      }
      document
        .querySelector<HTMLButtonElement>('.side-panel[data-open="true"] .side-panel-close')
        ?.click();
      document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
        frame.contentWindow?.postMessage({ type: "saga-archive:close-transients" }, "*");
      });

      await go({ to: "/world", hash: "top" });
    } finally {
      const remaining = RETURN_IMAGE_MIN_MS - (performance.now() - returnImageStartedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      setReturnImage(false);
      navigatingRef.current = false;
      setNavigating(false);
    }
  }, [go]);

  return (
    <ZeusButtonContext.Provider value={settings}>
      {children}
      {enabled && pathname !== "/" && portalTarget
        ? createPortal(
            <ZeusButton
              position={position}
              sideMenuOpen={sideMenuOpen}
              navigating={navigating}
              returnImage={returnImage}
              onPositionChange={savePosition}
              onNavigate={goToTop}
            />,
            portalTarget,
          )
        : null}
    </ZeusButtonContext.Provider>
  );
}

export function ZeusButtonToggle() {
  const settings = useContext(ZeusButtonContext);
  if (!settings) return null;
  return (
    <button
      type="button"
      className="side-panel-zeus-toggle"
      aria-pressed={settings.enabled}
      onClick={() => settings.setEnabled(!settings.enabled)}
    >
      <span>
        <b>ゼウスボタン</b>
        <small>常駐ナビゲーション</small>
      </span>
      <i aria-hidden="true">
        <em>{settings.enabled ? "ON" : "OFF"}</em>
        <u />
      </i>
    </button>
  );
}

function ZeusButton({
  position,
  sideMenuOpen,
  navigating,
  returnImage,
  onPositionChange,
  onNavigate,
}: {
  position: ZeusButtonPosition;
  sideMenuOpen: boolean;
  navigating: boolean;
  returnImage: boolean;
  onPositionChange: (position: ZeusButtonPosition) => void;
  onNavigate: () => Promise<void>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activePointer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const latestPointer = useRef({ x: 0, y: 0 });
  const grabOffset = useRef({ x: 0, y: 0 });
  const pendingPosition = useRef(position);
  // pendingPosition is where the button is shown, which may be a spot it
  // stepped to around a control. Scroll re-placement starts from the chosen
  // home instead, so the button returns once that control has passed.
  const preferredPosition = useRef(position);
  const placementFrame = useRef<number | null>(null);
  const placementTimer = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const dragGeometry = useRef<ZeusDragGeometry | null>(null);
  const cancelPointer = useRef<() => void>(() => {});
  const gestureOrigin = useRef(position);
  const droppedHere = useRef(false);
  const cueTimer = useRef<number | null>(null);
  const pressStartedAt = useRef(0);
  // The pending press's hold activation, so a mouse drag can start it early.
  const holdActivate = useRef<(() => void) | null>(null);
  const glideTimer = useRef<number | null>(null);
  // Set by the settle, toggle and dock paths: the next placement glides.
  const glideNext = useRef(false);
  // A safe temporary spot stays put until the reader moves on or that spot
  // becomes obstructed. Passive layout/frame reports must not send it home.
  const stepAway = useRef<{ scrollTop: number } | null>(null);

  useEffect(() => {
    preferredPosition.current = position;
  }, [position]);

  const cancelDragFrame = useCallback(() => {
    if (dragFrame.current != null) window.cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
  }, []);

  const cancelPlacement = useCallback(() => {
    if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
    if (placementFrame.current != null) window.cancelAnimationFrame(placementFrame.current);
    placementTimer.current = null;
    placementFrame.current = null;
  }, []);

  const getViewport = useCallback(() => {
    const viewport = window.visualViewport;
    const width = Math.max(1, viewport?.width ?? window.innerWidth);
    const height = Math.max(1, viewport?.height ?? window.innerHeight);
    const maxOffsetLeft = Math.max(0, window.innerWidth - width);
    const maxOffsetTop = Math.max(0, window.innerHeight - height);
    const clampOffset = (value: number, maximum: number) =>
      Math.max(0, Math.min(maximum, Number.isFinite(value) ? value : 0));
    return {
      width,
      height,
      // iOS reports transient negative offsets while the page rubber-bands
      // above its top edge. Never persist that bounce into the saved position.
      offsetLeft: clampOffset(viewport?.offsetLeft ?? 0, maxOffsetLeft),
      offsetTop: clampOffset(viewport?.offsetTop ?? 0, maxOffsetTop),
    };
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (cueTimer.current != null) window.clearTimeout(cueTimer.current);
    cueTimer.current = null;
    holdActivate.current = null;
    if (buttonRef.current) delete buttonRef.current.dataset.holding;
  }, []);

  /* A glide is an individual translate from the old spot back to zero, so it
     never touches left/top and ends with no translate left behind. */
  const endGlide = useCallback(() => {
    if (glideTimer.current != null) window.clearTimeout(glideTimer.current);
    glideTimer.current = null;
    const button = buttonRef.current;
    if (!button || button.dataset.relocating !== "true") return;
    delete button.dataset.relocating;
    button.style.removeProperty("translate");
  }, []);

  const startGlide = useCallback(
    (button: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) => {
      const dx = fromX - toX;
      const dy = fromY - toY;
      if (Math.hypot(dx, dy) < 2) return;
      button.style.translate = `${dx}px ${dy}px`;
      // Commit the old spot before the transition is switched on.
      void button.offsetWidth;
      button.dataset.relocating = "true";
      button.style.translate = "0px 0px";
      glideTimer.current = window.setTimeout(endGlide, GLIDE_MS);
    },
    [endGlide],
  );

  const readBounds = useCallback(
    (
      viewport: ReturnType<typeof getViewport>,
      rect: { width: number; height: number },
    ): ZeusBounds => {
      const button = buttonRef.current;
      const computed = button ? window.getComputedStyle(button) : null;
      const safeInset = (name: string) => {
        const value = Number.parseFloat(computed?.getPropertyValue(name) ?? "0");
        return Number.isFinite(value) ? Math.max(0, value) : 0;
      };
      const safe = 12;
      const safeTop = Math.max(safe, safeInset("--zeus-safe-top"));
      const safeRight = Math.max(safe, safeInset("--zeus-safe-right"));
      const safeBottom = Math.max(safe, safeInset("--zeus-safe-bottom"));
      const safeLeft = Math.max(safe, safeInset("--zeus-safe-left"));
      const minX = viewport.offsetLeft + rect.width / 2 + safeLeft;
      const maxX = Math.max(
        minX,
        viewport.offsetLeft + viewport.width - rect.width / 2 - safeRight,
      );
      const minY = viewport.offsetTop + rect.height / 2 + safeTop;
      const maxY = Math.max(
        minY,
        viewport.offsetTop + viewport.height - rect.height / 2 - safeBottom,
      );
      return { minX, maxX, minY, maxY };
    },
    [],
  );

  /* The button's box at rest: its layout size through a scaled dialog. The
     drawn rect still carries the hold's 1.075 scale while it eases out after
     a drop, which would clamp an edge dock a few pixels short. */
  const restingSize = useCallback((button: HTMLElement) => {
    const parent = button.offsetParent;
    let scaleX = 1;
    let scaleY = 1;
    if (parent instanceof HTMLElement) {
      const parentRect = parent.getBoundingClientRect();
      if (parent.offsetWidth > 0) scaleX = parentRect.width / parent.offsetWidth || 1;
      if (parent.offsetHeight > 0) scaleY = parentRect.height / parent.offsetHeight || 1;
    }
    return { width: button.offsetWidth * scaleX, height: button.offsetHeight * scaleY };
  }, []);

  // Mobile browser chrome can change the visual viewport without cancelling
  // a held pointer. Refresh only that snapshot (not every move's layout), so
  // release never reapplies an old normalized position to a new viewport.
  const refreshDragViewport = useCallback(() => {
    const geometry = dragGeometry.current;
    const button = buttonRef.current;
    if (!geometry || !button) return;
    const viewport = getViewport();
    const before = geometry.viewport;
    if (
      viewport.width === before.width &&
      viewport.height === before.height &&
      viewport.offsetLeft === before.offsetLeft &&
      viewport.offsetTop === before.offsetTop
    )
      return;
    const size = restingSize(button);
    geometry.viewport = viewport;
    geometry.bounds = readBounds(viewport, {
      width: size.width * 1.075,
      height: size.height * 1.075,
    });
  }, [getViewport, readBounds, restingSize]);

  const avoidCriticalControls = useCallback(
    (preferred: { x: number; y: number }) => {
      const button = buttonRef.current;
      if (!button) return preferred;
      const viewport = getViewport();
      const drawnRect = button.getBoundingClientRect();
      const size = restingSize(button);
      const shown = {
        x: drawnRect.left + drawnRect.width / 2,
        y: drawnRect.top + drawnRect.height / 2,
      };
      const rect = {
        width: size.width,
        height: size.height,
        left: shown.x - size.width / 2,
        right: shown.x + size.width / 2,
        top: shown.y - size.height / 2,
        bottom: shown.y + size.height / 2,
      };
      const bounds = readBounds(viewport, rect);
      const localX = preferred.x - viewport.offsetLeft;
      const localY = preferred.y - viewport.offsetTop;
      const mirrorX = viewport.offsetLeft + viewport.width - localX;
      const mirrorY = viewport.offsetTop + viewport.height - localY;
      const lift = rect.height + 28;
      // Its own side first: the screen-wide flip (306px on a phone, 1296px
      // on a desktop) is the longest jump, taken only when the near steps on
      // this side are blocked. A third step up lands mid-screen over the
      // prose, so it comes after the flip.
      const candidates = [
        preferred,
        { x: preferred.x, y: preferred.y - lift },
        // A page's closing stack of full-width links needs a second step up.
        // That keeps the button near its spot instead of flipping it to the
        // far edge of the screen, over the text there.
        { x: preferred.x, y: preferred.y - lift * 2 },
        // A tall title under the spot: one step down, still before the far
        // side of the screen.
        { x: preferred.x, y: preferred.y + lift },
        { x: mirrorX, y: preferred.y },
        { x: mirrorX, y: preferred.y - lift },
        { x: mirrorX, y: preferred.y - lift * 2 },
        { x: mirrorX, y: preferred.y + lift },
        { x: preferred.x, y: preferred.y - lift * 3 },
        { x: mirrorX, y: preferred.y - lift * 3 },
        // The far rows: taken only when clear (ZEUS_NEAR_CANDIDATES).
        { x: preferred.x, y: mirrorY },
        { x: mirrorX, y: mirrorY },
      ].map((candidate) => clampZeusCenter(candidate.x, candidate.y, bounds));
      if (Math.abs(mirrorX - preferred.x) > ZEUS_FLIP_MAX_PX) {
        // A page-wide flip goes after the third step up on this side
        // (index 8); the far side's own steps keep their order after it.
        candidates.splice(4, 0, ...candidates.splice(8, 1));
      }
      // Inside a dialog only its own controls count, as with its words: the
      // page behind it is covered and cannot be pressed.
      const controlRoot: ParentNode = button.closest("dialog") ?? document;
      const controls = Array.from(controlRoot.querySelectorAll<HTMLElement>(ZEUS_AVOID_SELECTOR))
        .filter((control) => control !== button && !button.contains(control))
        .filter((control) => !(control instanceof HTMLButtonElement && control.disabled))
        .map((control) => ({ control, rect: control.getBoundingClientRect() }))
        .filter(({ control, rect: controlRect }) => {
          if (controlRect.width < 1 || controlRect.height < 1) return false;
          if (controlRect.height > viewport.height * ZEUS_AVOID_MAX_HEIGHT) return false;
          if (
            controlRect.right <= viewport.offsetLeft ||
            controlRect.left >= viewport.offsetLeft + viewport.width ||
            controlRect.bottom <= viewport.offsetTop ||
            controlRect.top >= viewport.offsetTop + viewport.height
          )
            return false;
          const style = window.getComputedStyle(control);
          return style.visibility !== "hidden" && style.pointerEvents !== "none";
        });
      // A framed archive's fixed controls (its dock, an open sheet) count too.
      for (const controlRect of readFrameAvoid((entry) => entry.controls)) {
        controls.push({ control: button, rect: controlRect as DOMRect });
      }
      const gap = 10;
      const candidateRects = candidates.map((candidate) => ({
        left: candidate.x - rect.width / 2,
        right: candidate.x + rect.width / 2,
        top: candidate.y - rect.height / 2,
        bottom: candidate.y + rect.height / 2,
      }));
      // Where it is shown now, when that is a step away from home.
      const away = stepAway.current;
      const shownRect =
        away && Math.hypot(shown.x - preferred.x, shown.y - preferred.y) > 1
          ? {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            }
          : null;
      const topBar = readTopBar(
        button,
        viewport.offsetLeft + viewport.width / 2,
        bounds.minY - rect.height / 2 + 4,
      );
      const blocked = (candidateRect: ZeusRect) =>
        controls.some(
          ({ rect: controlRect }) =>
            candidateRect.left < controlRect.right + gap &&
            candidateRect.right > controlRect.left - gap &&
            candidateRect.top < controlRect.bottom + gap &&
            candidateRect.bottom > controlRect.top - gap,
        );
      const scroller = document.scrollingElement ?? document.documentElement;
      const pageEnd = scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 2;
      // A spot the reader has just dropped the button on is theirs: only the
      // controls move it off. Words count again once the page scrolls.
      const words = droppedHere.current
        ? []
        : readAvoidText(
            button,
            [...candidateRects, ...(shownRect ? [shownRect] : [])].map((candidateRect) => ({
              left: candidateRect.left - ZEUS_TEXT_GAP,
              right: candidateRect.right + ZEUS_TEXT_GAP,
              top: candidateRect.top - ZEUS_TEXT_GAP,
              bottom: candidateRect.bottom + ZEUS_TEXT_GAP,
            })),
            pageEnd,
          );
      const coveredWords = (candidateRect: ZeusRect) =>
        words.reduce((covered, word) => {
          const width =
            Math.min(candidateRect.right + ZEUS_TEXT_GAP, word.right) -
            Math.max(candidateRect.left - ZEUS_TEXT_GAP, word.left);
          const height =
            Math.min(candidateRect.bottom + ZEUS_TEXT_GAP, word.bottom) -
            Math.max(candidateRect.top - ZEUS_TEXT_GAP, word.top);
          return width > 0 && height > 0 ? covered + width * height : covered;
        }, 0);

      // Keep a clear step on a still page. Counting layout/frame reports as
      // permission to return, or retrying on a timer, caused unsolicited
      // A-B-A movement while the reader had already stopped scrolling.
      if (away && shownRect && !droppedHere.current) {
        const shownClear =
          !blocked(shownRect) &&
          !(topBar && meetsAny(shownRect, [topBar])) &&
          coveredWords(shownRect) === 0;
        const movedOn = Math.abs(scroller.scrollTop - away.scrollTop) > viewport.height * 0.6;
        if (shownClear && !movedOn) return shown;
      }

      // Clear of the controls and of the words: the first such spot. Words
      // everywhere (a column of titles): the nearby spot clear of the
      // controls that covers the least of them, weighed by how far it goes.
      // Controls everywhere: stay home, as before.
      let fallback: { candidate: ZeusButtonPosition; score: number } | null = null;
      for (const [index, candidate] of candidates.entries()) {
        const candidateRect = candidateRects[index];
        const obstructed =
          blocked(candidateRect) ||
          (index > 0 && topBar !== null && meetsAny(candidateRect, [topBar]));
        if (obstructed) continue;
        const covered = coveredWords(candidateRect);
        if (covered === 0) return candidate;
        if (index >= ZEUS_NEAR_CANDIDATES) continue;
        const score =
          covered +
          ZEUS_FALLBACK_DISTANCE_WEIGHT *
            Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y);
        if (!fallback || score < fallback.score) fallback = { candidate, score };
      }
      return fallback?.candidate ?? candidates[0] ?? preferred;
    },
    [readBounds, getViewport, restingSize],
  );

  const setVisualCenter = useCallback((targetX: number, targetY: number) => {
    const button = buttonRef.current;
    if (!button) return { x: targetX, y: targetY };

    const currentRect = button.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    if (Math.abs(targetX - currentX) < 0.25 && Math.abs(targetY - currentY) < 0.25) {
      return { x: currentX, y: currentY };
    }

    let left = Number.parseFloat(button.style.left);
    let top = Number.parseFloat(button.style.top);
    if (!Number.isFinite(left)) left = button.offsetLeft;
    if (!Number.isFinite(top)) top = button.offsetTop;

    // The button is portalled into the topmost dialog so it remains operable.
    // A transformed dialog becomes the containing block of a fixed child, so
    // CSS left/top no longer use viewport coordinates. Correct against the
    // rendered rectangle to keep the exact grabbed point under the finger.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      button.style.left = `${left}px`;
      button.style.top = `${top}px`;
      const rect = button.getBoundingClientRect();
      const deltaX = targetX - (rect.left + rect.width / 2);
      const deltaY = targetY - (rect.top + rect.height / 2);
      if (Math.abs(deltaX) < 0.25 && Math.abs(deltaY) < 0.25) break;

      const parent = button.offsetParent;
      let scaleX = 1;
      let scaleY = 1;
      if (parent instanceof HTMLElement) {
        const parentRect = parent.getBoundingClientRect();
        if (parent.offsetWidth > 0) scaleX = parentRect.width / parent.offsetWidth || 1;
        if (parent.offsetHeight > 0) scaleY = parentRect.height / parent.offsetHeight || 1;
      }
      left += deltaX / scaleX;
      top += deltaY / scaleY;
    }

    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const placeButton = useCallback(
    (next: ZeusButtonPosition) => {
      const button = buttonRef.current;
      if (!button) return next;
      const glide = glideNext.current;
      glideNext.current = false;
      // Where it is drawn now, mid-glide included; then settle any glide so
      // the placement below measures the real spot.
      const drawn = button.getBoundingClientRect();
      endGlide();
      const viewport = getViewport();
      const { x: centerX, y: centerY } = clampZeusCenter(
        viewport.offsetLeft + next.x * viewport.width,
        viewport.offsetTop + next.y * viewport.height,
        readBounds(viewport, restingSize(button)),
      );
      const safeCenter = avoidCriticalControls({ x: centerX, y: centerY });
      const shownBefore = pendingPosition.current;
      const actual = setVisualCenter(safeCenter.x, safeCenter.y);
      if (Math.hypot(safeCenter.x - centerX, safeCenter.y - centerY) <= 1) {
        stepAway.current = null;
      } else if (
        !stepAway.current ||
        Math.abs(shownBefore.x * viewport.width + viewport.offsetLeft - actual.x) > 1 ||
        Math.abs(shownBefore.y * viewport.height + viewport.offsetTop - actual.y) > 1
      ) {
        // A new step: count from here.
        const scroller = document.scrollingElement ?? document.documentElement;
        stepAway.current = { scrollTop: scroller.scrollTop };
      }
      if (glide && !reducedGlide()) {
        startGlide(
          button,
          drawn.left + drawn.width / 2,
          drawn.top + drawn.height / 2,
          actual.x,
          actual.y,
        );
      }
      const normalized = {
        x: (actual.x - viewport.offsetLeft) / viewport.width,
        y: (actual.y - viewport.offsetTop) / viewport.height,
      };
      pendingPosition.current = normalized;
      return normalized;
    },
    [
      avoidCriticalControls,
      readBounds,
      getViewport,
      setVisualCenter,
      endGlide,
      startGlide,
      restingSize,
    ],
  );

  const restoreGestureOrigin = useCallback(() => {
    buttonRef.current?.style.removeProperty("translate");
    dragGeometry.current = null;
    const viewport = getViewport();
    // Restore the displayed origin, not the expanded drag bounds or a new
    // collision candidate. Otherwise cancellation itself shifts the button.
    setVisualCenter(
      viewport.offsetLeft + gestureOrigin.current.x * viewport.width,
      viewport.offsetTop + gestureOrigin.current.y * viewport.height,
    );
    pendingPosition.current = { ...gestureOrigin.current };
  }, [getViewport, setVisualCenter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (activePointer.current == null) placeButton(position);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [placeButton, position]);

  useEffect(() => {
    const settleMs = isAndroidRenderer(navigator) ? 140 : 72;
    const schedulePlacement = () => {
      if (activePointer.current != null || placementFrame.current != null) return;
      placementFrame.current = window.requestAnimationFrame(() => {
        placementFrame.current = null;
        if (activePointer.current != null) return;
        placeButton(preferredPosition.current);
      });
    };
    const onScroll = () => {
      if (activePointer.current != null && !held.current) cancelPointer.current();
      if (activePointer.current != null) {
        if (held.current) refreshDragViewport();
        return;
      }
      droppedHere.current = false;
      if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
      // Collision checks read the geometry of every visible critical control.
      // Run that work once scrolling settles instead of on every scroll frame.
      placementTimer.current = window.setTimeout(() => {
        placementTimer.current = null;
        glideNext.current = true;
        schedulePlacement();
      }, settleMs);
    };
    /* Opening or closing a disclosure (a cast PROFILE, a Dream case) moves
       the page under the button without a scroll. toggle does not bubble,
       so it is caught on the way down; the wait covers an opening that
       animates its height. */
    const onLayoutChange = () => {
      if (activePointer.current != null) return;
      if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
      placementTimer.current = window.setTimeout(
        () => {
          placementTimer.current = null;
          glideNext.current = true;
          schedulePlacement();
        },
        Math.max(settleMs, 220),
      );
    };
    // A dossier dialog scrolls inside itself, not the window. Only a scroll
    // inside the dialog that holds the button counts; page rails do not.
    const onInnerScroll = (event: Event) => {
      const dialog = buttonRef.current?.closest("dialog");
      if (!dialog || event.target === dialog.ownerDocument) return;
      if (!dialog.contains(event.target as Node)) return;
      onScroll();
    };
    // A framed archive reports its words once its own scroll settles. A
    // report never cancels a press on the button (a tap in the archive can
    // land just before one); only an archive scroll lets words count again
    // over a spot the reader dropped the button on.
    const onFrameAvoid = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown;
        reason?: unknown;
        words?: unknown;
        controls?: unknown;
      } | null;
      if (!data || data.type !== FRAME_AVOID_MESSAGE || !event.source) return;
      const source = event.source;
      const frame = Array.from(document.querySelectorAll("iframe")).find(
        (candidate) => candidate.contentWindow === source,
      );
      if (!frame) return;
      frameAvoid.set(source, {
        words: readFrameBoxes(data.words),
        controls: readFrameBoxes(data.controls),
      });
      if (activePointer.current != null) return;
      if (data.reason === "scroll") droppedHere.current = false;
      schedulePlacement();
    };
    const significantResize = createViewportResizeFilter();
    const onResize = () => {
      if (dragGeometry.current) {
        const before = dragGeometry.current.viewport;
        const after = getViewport();
        if (
          Math.abs(after.width - before.width) >= 1 ||
          Math.abs(after.height - before.height) >= 160
        ) {
          cancelPointer.current();
        }
      }
      // A URL bar collapsing mid-scroll only re-clamps once the gesture settles.
      if (!significantResize()) {
        onScroll();
        return;
      }
      // Rotation, split view or a keyboard changes the cached drag bounds.
      // Cancel the gesture before the next sample can use obsolete geometry.
      cancelPointer.current();
      stepAway.current = null;
      if (placementTimer.current != null) {
        window.clearTimeout(placementTimer.current);
        placementTimer.current = null;
      }
      schedulePlacement();
    };
    // The optional iPad launcher moves immediately when its root flags change.
    // Waiting for scroll-settle and then gliding would leave this higher-z
    // button over the new menu target. Reconcile only that footprint change,
    // in the mutation microtask, without changing the reader's saved spot.
    const root = document.documentElement;
    const readCompactMenuFootprint = () =>
      root.getAttribute("data-ipad-menu") === "compact" &&
      root.getAttribute("data-ipad-menu-scrolled") === "true"
        ? root.getAttribute("data-viewport-chrome") ?? ""
        : "";
    let compactMenuFootprint = readCompactMenuFootprint();
    const reconcileCompactMenu = () => {
      const nextFootprint = readCompactMenuFootprint();
      if (nextFootprint === compactMenuFootprint) return;
      compactMenuFootprint = nextFootprint;
      // An active drag owns its position; its existing release placement
      // already avoids critical controls, including the menu opener.
      if (activePointer.current != null) return;
      cancelPlacement();
      glideNext.current = false;
      placeButton(preferredPosition.current);
    };
    const compactMenuObserver = new MutationObserver(reconcileCompactMenu);
    compactMenuObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-ipad-menu", "data-ipad-menu-scrolled", "data-viewport-chrome"],
    });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("message", onFrameAvoid);
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("toggle", onLayoutChange, { capture: true, passive: true });
    document.addEventListener("scroll", onInnerScroll, { capture: true, passive: true });
    return () => {
      compactMenuObserver.disconnect();
      document.removeEventListener("toggle", onLayoutChange, { capture: true });
      document.removeEventListener("scroll", onInnerScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("message", onFrameAvoid);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
      placementTimer.current = null;
      if (placementFrame.current != null) window.cancelAnimationFrame(placementFrame.current);
      placementFrame.current = null;
    };
  }, [placeButton, getViewport, refreshDragViewport, cancelPlacement]);

  /* A permanent non-passive window touchmove listener makes every page scroll
     wait for the main thread. Install it only while a held drag owns the
     finger; the button is re-portalled into dialogs, so it is not bound to the
     current button node either. */
  const touchGuardArmed = useRef(false);
  const preventHeldTouchScroll = useCallback((event: TouchEvent) => {
    if (event.touches.length > 1) {
      cancelPointer.current();
      return;
    }
    if (held.current && activePointer.current != null && event.cancelable) {
      event.preventDefault();
    }
  }, []);
  const disarmTouchGuard = useCallback(() => {
    if (!touchGuardArmed.current) return;
    touchGuardArmed.current = false;
    window.removeEventListener("touchmove", preventHeldTouchScroll, { capture: true });
  }, [preventHeldTouchScroll]);
  const armTouchGuard = useCallback(() => {
    if (touchGuardArmed.current) return;
    touchGuardArmed.current = true;
    window.addEventListener("touchmove", preventHeldTouchScroll, {
      passive: false,
      capture: true,
    });
  }, [preventHeldTouchScroll]);

  /* WebKit decides when a touch begins whether its moves can be cancelled,
     and a window listener added mid-gesture may come too late. The button
     keeps its own non-passive listener (only this small target is affected);
     it re-binds whenever the button is re-portalled, because that remounts it. */
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    button.addEventListener("touchmove", preventHeldTouchScroll, { passive: false });
    return () => button.removeEventListener("touchmove", preventHeldTouchScroll);
  }, [preventHeldTouchScroll]);

  useEffect(
    () => () => {
      clearHoldTimer();
      cancelDragFrame();
      cancelPlacement();
      disarmTouchGuard();
      endGlide();
    },
    [clearHoldTimer, cancelDragFrame, cancelPlacement, disarmTouchGuard, endGlide],
  );

  /* Pointer capture is not guaranteed in Samsung Internet or embedded
     WebViews. If the finger leaves the button, terminate the pending long
     press at the window boundary so the document-wide touch guard cannot be
     stranded. Normal pointerup reaches the React handler first and makes this
     fallback a no-op. */
  useEffect(() => {
    const cancelDanglingPointer = (event?: PointerEvent) => {
      if (activePointer.current == null || (event && event.pointerId !== activePointer.current))
        return;
      const button = buttonRef.current;
      const pointerId = activePointer.current;
      const wasHeld = held.current;
      clearHoldTimer();
      cancelDragFrame();
      activePointer.current = null;
      held.current = false;
      disarmTouchGuard();
      moved.current = true;
      if (button) {
        button.dataset.dragging = "false";
        button.setAttribute("aria-grabbed", "false");
        if (wasHeld) restoreGestureOrigin();
        try {
          if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        } catch {
          /* Native gesture takeover already released capture. */
        }
      }
    };
    const cancelOnBlur = () => cancelDanglingPointer();
    const cancelWhenHidden = () => {
      if (document.hidden) cancelDanglingPointer();
    };
    window.addEventListener("pointerup", cancelDanglingPointer);
    window.addEventListener("pointercancel", cancelDanglingPointer);
    window.addEventListener("blur", cancelOnBlur);
    window.addEventListener("pagehide", cancelOnBlur);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    cancelPointer.current = cancelOnBlur;
    return () => {
      window.removeEventListener("pointerup", cancelDanglingPointer);
      window.removeEventListener("pointercancel", cancelDanglingPointer);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("pagehide", cancelOnBlur);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      cancelPointer.current = () => {};
    };
  }, [clearHoldTimer, cancelDragFrame, disarmTouchGuard, restoreGestureOrigin]);

  const moveToPointer = (clientX: number, clientY: number) => {
    const button = buttonRef.current;
    const geometry = dragGeometry.current;
    if (!button || !geometry) return;
    const next = getZeusDragPosition(geometry, clientX, clientY);
    // Individual translate composes with the existing press/return scale.
    // Unlike left/top + getBoundingClientRect, it does not relayout each frame.
    button.style.translate = `${next.translate.x}px ${next.translate.y}px`;
    pendingPosition.current = next.normalized;
    // The MOVE tag rides above the finger, or below it at the top edge.
    const side = next.center.y - geometry.bounds.minY < 40 ? "below" : "above";
    if (button.dataset.moveTag !== side) button.dataset.moveTag = side;
  };

  /* A drop close to a side edge docks on it, so a spot meant for the edge
     does not end up a few pixels short of it. A drop elsewhere stays. */
  const dockToEdge = (button: HTMLElement, spot: ZeusButtonPosition) => {
    const viewport = getViewport();
    const bounds = readBounds(viewport, {
      width: button.offsetWidth,
      height: button.offsetHeight,
    });
    const x = viewport.offsetLeft + spot.x * viewport.width;
    let dockX: number | null = null;
    if (x - bounds.minX < EDGE_SNAP_PX) dockX = bounds.minX;
    else if (bounds.maxX - x < EDGE_SNAP_PX) dockX = bounds.maxX;
    if (dockX == null || Math.abs(dockX - x) < 1) return null;
    return { x: (dockX - viewport.offsetLeft) / viewport.width, y: spot.y };
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (activePointer.current !== event.pointerId) return;
    clearHoldTimer();
    cancelDragFrame();
    const wasHeld = held.current;
    activePointer.current = null;
    if (wasHeld && !cancelled) {
      droppedHere.current = true;
      refreshDragViewport();
      moveToPointer(event.clientX, event.clientY);
      event.currentTarget.style.removeProperty("translate");
      dragGeometry.current = null;
      const viewport = getViewport();
      setVisualCenter(
        viewport.offsetLeft + pendingPosition.current.x * viewport.width,
        viewport.offsetTop + pendingPosition.current.y * viewport.height,
      );
      const docked = dockToEdge(event.currentTarget, pendingPosition.current);
      if (docked) {
        // The saved spot is the edge; the placement that follows glides there.
        glideNext.current = true;
        pendingPosition.current = docked;
      }
      onPositionChange(pendingPosition.current);
    } else if (wasHeld && cancelled) {
      restoreGestureOrigin();
    }
    held.current = false;
    disarmTouchGuard();
    event.currentTarget.dataset.dragging = "false";
    event.currentTarget.setAttribute("aria-grabbed", "false");
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Pointer capture may already be released by the browser. */
    }
    const releaseDistance = Math.hypot(
      event.clientX - start.current.x,
      event.clientY - start.current.y,
    );
    // A hold let go before the drag took over is an abandoned move, not a tap.
    const abandonedHold =
      event.pointerType !== "mouse" && event.timeStamp - pressStartedAt.current > TAP_MAX_MS;
    if (
      !cancelled &&
      !wasHeld &&
      !moved.current &&
      !abandonedHold &&
      releaseDistance <= MOVE_TOLERANCE
    ) {
      clearHoldTimer();
      activePointer.current = null;
      held.current = false;
      // data-navigating turns pointer-events off before the touch's click is
      // hit-tested, so that click would open the card beneath. A mouse click
      // still targets the pressed button.
      if (event.pointerType !== "mouse") guardTapThrough();
      void onNavigate();
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="zeus-button"
      data-dragging="false"
      data-navigating={String(navigating)}
      data-return-loading={String(returnImage)}
      data-menu-open={String(sideMenuOpen)}
      aria-grabbed="false"
      aria-busy={navigating}
      aria-label="ゼウスボタン。押すとトップへ戻り、長押しすると移動できます"
      onPointerDown={(event) => {
        if (navigating) return;
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (activePointer.current != null) return;
        cancelPlacement();
        cancelDragFrame();
        // A glide in flight lands now, so the grab measures the real spot.
        endGlide();
        gestureOrigin.current = { ...pendingPosition.current };
        pressStartedAt.current = event.timeStamp;
        const target = event.currentTarget;
        activePointer.current = event.pointerId;
        start.current = { x: event.clientX, y: event.clientY };
        latestPointer.current = { x: event.clientX, y: event.clientY };
        const rect = event.currentTarget.getBoundingClientRect();
        grabOffset.current = {
          x: event.clientX - (rect.left + rect.width / 2),
          y: event.clientY - (rect.top + rect.height / 2),
        };
        moved.current = false;
        held.current = false;
        clearHoldTimer();
        holdTimer.current = window.setTimeout(activateHold, LONG_PRESS_MS);
        holdActivate.current = activateHold;
        // Past a tap's length the hold starts filling in (styles), so the
        // wait before the drag reads as progress, not as nothing happening.
        cueTimer.current = window.setTimeout(() => {
          cueTimer.current = null;
          if (activePointer.current === event.pointerId && !held.current) {
            target.dataset.holding = "true";
          }
        }, HOLD_CUE_MS);
        function activateHold() {
          if (activePointer.current !== event.pointerId) return;
          if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
          holdTimer.current = null;
          holdActivate.current = null;
          const rect = target.getBoundingClientRect();
          const viewport = getViewport();
          const parent = target.offsetParent;
          const scale = { x: 1, y: 1 };
          if (parent instanceof HTMLElement) {
            const parentRect = parent.getBoundingClientRect();
            if (parent.offsetWidth > 0) scale.x = parentRect.width / parent.offsetWidth || 1;
            if (parent.offsetHeight > 0) scale.y = parentRect.height / parent.offsetHeight || 1;
          }
          dragGeometry.current = {
            origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            grab: { ...grabOffset.current },
            // Reserve the expanded hold size before its scale transition starts.
            bounds: readBounds(viewport, {
              width: rect.width * 1.075,
              height: rect.height * 1.075,
            }),
            scale,
            viewport,
          };
          held.current = true;
          armTouchGuard();
          delete target.dataset.holding;
          target.dataset.dragging = "true";
          target.setAttribute("aria-grabbed", "true");
          // A short tick where the platform has one (Android); iOS has none.
          try {
            if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
          } catch {
            /* Vibration is optional. */
          }
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            /* The document-wide guards still terminate an uncaptured drag. */
          }
          moveToPointer(latestPointer.current.x, latestPointer.current.y);
        }
      }}
      onPointerMove={(event) => {
        if (activePointer.current !== event.pointerId) return;
        latestPointer.current = { x: event.clientX, y: event.clientY };
        const distance = Math.hypot(
          event.clientX - start.current.x,
          event.clientY - start.current.y,
        );
        if (!held.current) {
          // A mouse drag cannot be a page scroll, so it moves the button at
          // once instead of waiting out the hold.
          if (distance > MOVE_TOLERANCE && event.pointerType === "mouse" && holdActivate.current) {
            const activate = holdActivate.current;
            clearHoldTimer();
            activate();
            return;
          }
          if (distance > MOVE_TOLERANCE) {
            moved.current = true;
            clearHoldTimer();
            activePointer.current = null;
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            } catch {
              /* Native scrolling may already have released capture. */
            }
          }
          return;
        }
        event.preventDefault();
        if (dragFrame.current == null) {
          dragFrame.current = window.requestAnimationFrame(() => {
            dragFrame.current = null;
            if (held.current && activePointer.current != null) {
              moveToPointer(latestPointer.current.x, latestPointer.current.y);
            }
          });
        }
      }}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onLostPointerCapture={(event) => finishPointer(event, true)}
      onClick={(event) => {
        event.preventDefault();
        if (event.detail === 0) void onNavigate();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" && activePointer.current != null) {
          event.preventDefault();
          cancelPointer.current();
        }
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <span className="zeus-button-aura" aria-hidden="true" />
      <img
        className="zeus-button-image is-default"
        src="/zeus-button-360.webp"
        srcSet={ZEUS_BUTTON_SRCSET}
        sizes={ZEUS_BUTTON_SIZES}
        width={360}
        height={360}
        alt=""
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
      <img
        className="zeus-button-image is-returning"
        src="/zeus-button-return-360.webp"
        srcSet={ZEUS_BUTTON_RETURN_SRCSET}
        sizes={ZEUS_BUTTON_SIZES}
        width={360}
        height={360}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="low"
        draggable={false}
      />
      <span className="zeus-button-move" aria-hidden="true">
        MOVE
      </span>
    </button>
  );
}
