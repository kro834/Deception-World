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

type ZeusButtonPosition = { x: number; y: number };

type ZeusButtonSettings = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const ENABLED_KEY = "deception-world:zeus-button-enabled";
const POSITION_KEY = "deception-world:zeus-button-position";
const DEFAULT_POSITION: ZeusButtonPosition = { x: 0.9, y: 0.82 };
const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 9;
const RETURN_IMAGE_MIN_MS = 360;
const ZeusButtonContext = createContext<ZeusButtonSettings | null>(null);

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
      window.requestAnimationFrame(() => {
        document.getElementById("top")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      });
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
  const placementFrame = useRef<number | null>(null);

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

  const clampCenter = useCallback((clientX: number, clientY: number) => {
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
  }, [getViewport]);

  const setVisualCenter = useCallback((targetX: number, targetY: number) => {
    const button = buttonRef.current;
    if (!button) return { x: targetX, y: targetY };

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
      const actual = setVisualCenter(centerX, centerY);
      const normalized = {
        x: (actual.x - viewport.offsetLeft) / viewport.width,
        y: (actual.y - viewport.offsetTop) / viewport.height,
      };
      pendingPosition.current = normalized;
      return normalized;
    },
    [clampCenter, getViewport, setVisualCenter],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => placeButton(position));
    return () => window.cancelAnimationFrame(frame);
  }, [placeButton, position]);

  useEffect(() => {
    const onResize = () => {
      if (activePointer.current != null || placementFrame.current != null) return;
      placementFrame.current = window.requestAnimationFrame(() => {
        placementFrame.current = null;
        placeButton(pendingPosition.current);
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      if (placementFrame.current != null) window.cancelAnimationFrame(placementFrame.current);
      placementFrame.current = null;
    };
  }, [placeButton]);

  useEffect(() => {
    const preventHeldTouchScroll = (event: TouchEvent) => {
      if (held.current && activePointer.current != null && event.cancelable) {
        event.preventDefault();
      }
    };
    window.addEventListener("touchmove", preventHeldTouchScroll, {
      passive: false,
      capture: true,
    });
    return () => {
      window.removeEventListener("touchmove", preventHeldTouchScroll, { capture: true });
    };
  }, []);

  useEffect(
    () => () => {
      clearHoldTimer();
    },
    [clearHoldTimer],
  );

  /* Pointer capture is not guaranteed in Samsung Internet or embedded
     WebViews. If the finger leaves the button, terminate the pending long
     press at the window boundary so the document-wide touch guard cannot be
     stranded. Normal pointerup reaches the React handler first and makes this
     fallback a no-op. */
  useEffect(() => {
    const cancelDanglingPointer = (event?: PointerEvent) => {
      if (
        activePointer.current == null ||
        (event && event.pointerId !== activePointer.current)
      )
        return;
      const button = buttonRef.current;
      const pointerId = activePointer.current;
      clearHoldTimer();
      activePointer.current = null;
      held.current = false;
      moved.current = true;
      if (button) {
        button.dataset.dragging = "false";
        button.setAttribute("aria-grabbed", "false");
        try {
          if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        } catch {
          /* Native gesture takeover already released capture. */
        }
      }
    };
    const cancelOnBlur = () => cancelDanglingPointer();
    window.addEventListener("pointerup", cancelDanglingPointer);
    window.addEventListener("pointercancel", cancelDanglingPointer);
    window.addEventListener("blur", cancelOnBlur);
    window.addEventListener("pagehide", cancelOnBlur);
    return () => {
      window.removeEventListener("pointerup", cancelDanglingPointer);
      window.removeEventListener("pointercancel", cancelDanglingPointer);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("pagehide", cancelOnBlur);
    };
  });

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
    const wasHeld = held.current;
    activePointer.current = null;
    if (wasHeld && !cancelled) {
      moveToPointer(event.clientX, event.clientY);
      onPositionChange(pendingPosition.current);
    } else if (wasHeld && cancelled) {
      placeButton(position);
    }
    held.current = false;
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
        event.preventDefault();
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
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* Continue with the normal pointer stream when capture is unavailable. */
        }
        clearHoldTimer();
        holdTimer.current = window.setTimeout(() => {
          if (activePointer.current !== event.pointerId) return;
          held.current = true;
          target.dataset.dragging = "true";
          target.setAttribute("aria-grabbed", "true");
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
        moveToPointer(event.clientX, event.clientY);
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
        src="/zeus-button.png"
        alt=""
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
      <img
        className="zeus-button-image is-returning"
        src="/zeus-button-return.jpeg"
        alt=""
        loading="lazy"
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
