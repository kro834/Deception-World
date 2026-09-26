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
const MOVE_TOLERANCE = 9;
const RETURN_IMAGE_MIN_MS = 360;
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
].join(",");
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
  return glyphs;
}

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
    const scheduleTargetUpdate = () => {
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
  const gestureOrigin = useRef(position);
  const droppedHere = useRef(false);

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
  }, []);

  const clampCenter = useCallback(
    (clientX: number, clientY: number) => {
      const button = buttonRef.current;
      if (!button) return { x: clientX, y: clientY };
      const rect = button.getBoundingClientRect();
      const viewport = getViewport();
      const computed = window.getComputedStyle(button);
      const safeInset = (name: string) => {
        const value = Number.parseFloat(computed.getPropertyValue(name));
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
      const centerX = Math.max(minX, Math.min(maxX, clientX));
      const centerY = Math.max(minY, Math.min(maxY, clientY));
      return { x: centerX, y: centerY };
    },
    [getViewport],
  );

  const avoidCriticalControls = useCallback(
    (preferred: { x: number; y: number }) => {
      const button = buttonRef.current;
      if (!button) return preferred;
      const viewport = getViewport();
      const rect = button.getBoundingClientRect();
      const localX = preferred.x - viewport.offsetLeft;
      const localY = preferred.y - viewport.offsetTop;
      const mirrorX = viewport.offsetLeft + viewport.width - localX;
      const mirrorY = viewport.offsetTop + viewport.height - localY;
      const lift = rect.height + 28;
      const candidates = [
        preferred,
        { x: mirrorX, y: preferred.y },
        { x: preferred.x, y: preferred.y - lift },
        { x: mirrorX, y: preferred.y - lift },
        // A page's closing stack of full-width links needs a second step up.
        // That keeps the button near its spot instead of flipping it to the
        // far edge of the screen, over the text there.
        { x: preferred.x, y: preferred.y - lift * 2 },
        { x: mirrorX, y: preferred.y - lift * 2 },
        // A tall title under the spot: one step down, then a third up, still
        // before the far side of the screen.
        { x: preferred.x, y: preferred.y + lift },
        { x: mirrorX, y: preferred.y + lift },
        { x: preferred.x, y: preferred.y - lift * 3 },
        { x: mirrorX, y: preferred.y - lift * 3 },
        { x: preferred.x, y: mirrorY },
        { x: mirrorX, y: mirrorY },
      ].map((candidate) => clampCenter(candidate.x, candidate.y));
      const controls = Array.from(document.querySelectorAll<HTMLElement>(ZEUS_AVOID_SELECTOR))
        .filter((control) => control !== button && !button.contains(control))
        .filter((control) => !(control instanceof HTMLButtonElement && control.disabled))
        .map((control) => ({ control, rect: control.getBoundingClientRect() }))
        .filter(({ control, rect: controlRect }) => {
          if (controlRect.width < 1 || controlRect.height < 1) return false;
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
      const gap = 10;
      const candidateRects = candidates.map((candidate) => ({
        left: candidate.x - rect.width / 2,
        right: candidate.x + rect.width / 2,
        top: candidate.y - rect.height / 2,
        bottom: candidate.y + rect.height / 2,
      }));
      const scroller = document.scrollingElement ?? document.documentElement;
      const pageEnd = scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 2;
      // A spot the reader has just dropped the button on is theirs: only the
      // controls move it off. Words count again once the page scrolls.
      const words = droppedHere.current
        ? []
        : readAvoidText(
            button,
            candidateRects.map((candidateRect) => ({
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

      // Clear of the controls and of the words: the first such spot. Words
      // everywhere (a column of titles): the spot clear of the controls that
      // covers the least of them. Controls everywhere: stay home, as before.
      let fallback: { candidate: ZeusButtonPosition; covered: number } | null = null;
      for (const [index, candidate] of candidates.entries()) {
        const candidateRect = candidateRects[index];
        const obstructed = controls.some(
          ({ rect: controlRect }) =>
            candidateRect.left < controlRect.right + gap &&
            candidateRect.right > controlRect.left - gap &&
            candidateRect.top < controlRect.bottom + gap &&
            candidateRect.bottom > controlRect.top - gap,
        );
        if (obstructed) continue;
        const covered = coveredWords(candidateRect);
        if (covered === 0) return candidate;
        if (!fallback || covered < fallback.covered) fallback = { candidate, covered };
      }
      return fallback?.candidate ?? candidates[0] ?? preferred;
    },
    [clampCenter, getViewport],
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
      const viewport = getViewport();
      const { x: centerX, y: centerY } = clampCenter(
        viewport.offsetLeft + next.x * viewport.width,
        viewport.offsetTop + next.y * viewport.height,
      );
      const safeCenter = avoidCriticalControls({ x: centerX, y: centerY });
      const actual = setVisualCenter(safeCenter.x, safeCenter.y);
      const normalized = {
        x: (actual.x - viewport.offsetLeft) / viewport.width,
        y: (actual.y - viewport.offsetTop) / viewport.height,
      };
      pendingPosition.current = normalized;
      return normalized;
    },
    [avoidCriticalControls, clampCenter, getViewport, setVisualCenter],
  );

  const restoreGestureOrigin = useCallback(() => {
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
    const schedulePlacement = () => {
      if (activePointer.current != null || placementFrame.current != null) return;
      placementFrame.current = window.requestAnimationFrame(() => {
        placementFrame.current = null;
        if (activePointer.current != null) return;
        placeButton(preferredPosition.current);
      });
    };
    const onScroll = () => {
      if (activePointer.current != null) return;
      droppedHere.current = false;
      if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
      // Collision checks read the geometry of every visible critical control.
      // Run that work once scrolling settles instead of on every scroll frame.
      placementTimer.current = window.setTimeout(() => {
        placementTimer.current = null;
        schedulePlacement();
      }, 72);
    };
    const significantResize = createViewportResizeFilter();
    const onResize = () => {
      // A URL bar collapsing mid-scroll only re-clamps once the gesture settles.
      if (!significantResize()) {
        onScroll();
        return;
      }
      if (placementTimer.current != null) {
        window.clearTimeout(placementTimer.current);
        placementTimer.current = null;
      }
      schedulePlacement();
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      if (placementTimer.current != null) window.clearTimeout(placementTimer.current);
      placementTimer.current = null;
      if (placementFrame.current != null) window.cancelAnimationFrame(placementFrame.current);
      placementFrame.current = null;
    };
  }, [placeButton]);

  /* A permanent non-passive window touchmove listener makes every page scroll
     wait for the main thread. Install it only while a held drag owns the
     finger; the button is re-portalled into dialogs, so it is not bound to the
     current button node either. */
  const touchGuardArmed = useRef(false);
  const preventHeldTouchScroll = useCallback((event: TouchEvent) => {
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
    },
    [clearHoldTimer, cancelDragFrame, cancelPlacement, disarmTouchGuard],
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
    return () => {
      window.removeEventListener("pointerup", cancelDanglingPointer);
      window.removeEventListener("pointercancel", cancelDanglingPointer);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("pagehide", cancelOnBlur);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [clearHoldTimer, cancelDragFrame, disarmTouchGuard, restoreGestureOrigin]);

  const moveToPointer = (clientX: number, clientY: number) => {
    const button = buttonRef.current;
    if (!button) return;
    const viewport = getViewport();
    const { x: centerX, y: centerY } = clampCenter(
      clientX - grabOffset.current.x,
      clientY - grabOffset.current.y,
    );
    const actual = setVisualCenter(centerX, centerY);
    pendingPosition.current = {
      x: (actual.x - viewport.offsetLeft) / viewport.width,
      y: (actual.y - viewport.offsetTop) / viewport.height,
    };
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (activePointer.current !== event.pointerId) return;
    clearHoldTimer();
    cancelDragFrame();
    const wasHeld = held.current;
    activePointer.current = null;
    if (wasHeld && !cancelled) {
      droppedHere.current = true;
      moveToPointer(event.clientX, event.clientY);
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
    if (!cancelled && !wasHeld && !moved.current) {
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
        gestureOrigin.current = { ...pendingPosition.current };
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
        holdTimer.current = window.setTimeout(() => {
          if (activePointer.current !== event.pointerId) return;
          held.current = true;
          armTouchGuard();
          target.dataset.dragging = "true";
          target.setAttribute("aria-grabbed", "true");
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            /* The document-wide guards still terminate an uncaptured drag. */
          }
          moveToPointer(latestPointer.current.x, latestPointer.current.y);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        if (activePointer.current !== event.pointerId) return;
        latestPointer.current = { x: event.clientX, y: event.clientY };
        const distance = Math.hypot(
          event.clientX - start.current.x,
          event.clientY - start.current.y,
        );
        if (!held.current) {
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
