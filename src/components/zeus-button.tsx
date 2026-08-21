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
import { useNavigate } from "@tanstack/react-router";

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
  const [enabled, setEnabledState] = useState(true);
  const [position, setPosition] = useState<ZeusButtonPosition>(DEFAULT_POSITION);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(window.localStorage.getItem(ENABLED_KEY) !== "false");
    } catch {
      setEnabledState(true);
    }
    setPosition(readPosition());
  }, []);

  useEffect(() => {
    const updateTarget = () => {
      const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
      setPortalTarget(openDialogs.at(-1) ?? document.body);
      setSideMenuOpen(Boolean(document.querySelector('.side-panel[data-open="true"]')));
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open", "data-open"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
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

  return (
    <ZeusButtonContext.Provider value={settings}>
      {children}
      {enabled && portalTarget
        ? createPortal(
            <ZeusButton
              position={position}
              sideMenuOpen={sideMenuOpen}
              onPositionChange={savePosition}
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
  onPositionChange,
}: {
  position: ZeusButtonPosition;
  sideMenuOpen: boolean;
  onPositionChange: (position: ZeusButtonPosition) => void;
}) {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activePointer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const grabOffset = useRef({ x: 0, y: 0 });
  const pendingPosition = useRef(position);

  const clearHoldTimer = () => {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const clampCenter = useCallback((clientX: number, clientY: number) => {
    const button = buttonRef.current;
    if (!button) return { x: clientX, y: clientY };
    const rect = button.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const safe = sideMenuOpen ? 4 : 12;
    const panelLeft = sideMenuOpen
      ? document.querySelector<HTMLElement>('.side-panel[data-open="true"]')?.getBoundingClientRect().left
      : undefined;
    const minX = rect.width / 2 + safe;
    const maxX = Math.max(
      minX,
      panelLeft == null
        ? viewportWidth - rect.width / 2 - safe
        : panelLeft - rect.width / 2 + 7,
    );
    const centerX = Math.max(minX, Math.min(maxX, clientX));
    const centerY = Math.max(
      rect.height / 2 + safe,
      Math.min(viewportHeight - rect.height / 2 - safe, clientY),
    );
    return { x: centerX, y: centerY };
  }, [sideMenuOpen]);

  const placeButton = useCallback((next: ZeusButtonPosition) => {
    const button = buttonRef.current;
    if (!button) return next;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const { x: centerX, y: centerY } = clampCenter(
      next.x * viewportWidth,
      next.y * viewportHeight,
    );
    button.style.left = `${centerX}px`;
    button.style.top = `${centerY}px`;
    const normalized = { x: centerX / viewportWidth, y: centerY / viewportHeight };
    pendingPosition.current = normalized;
    return normalized;
  }, [clampCenter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => placeButton(position));
    return () => window.cancelAnimationFrame(frame);
  }, [placeButton, position]);

  useEffect(() => {
    const onResize = () => placeButton(pendingPosition.current);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [placeButton]);

  useEffect(() => () => clearHoldTimer(), []);

  const moveToPointer = (clientX: number, clientY: number) => {
    const button = buttonRef.current;
    if (!button) return;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const { x: centerX, y: centerY } = clampCenter(
      clientX - grabOffset.current.x,
      clientY - grabOffset.current.y,
    );
    button.style.left = `${centerX}px`;
    button.style.top = `${centerY}px`;
    pendingPosition.current = { x: centerX / viewportWidth, y: centerY / viewportHeight };
  };

  const goToTop = useCallback(async () => {
    document
      .querySelector<HTMLButtonElement>('.side-panel[data-open="true"] .side-panel-close')
      ?.click();
    await navigate({ to: "/world", hash: "top" });
    window.requestAnimationFrame(() => {
      document.getElementById("top")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }, [navigate]);

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (activePointer.current !== event.pointerId) return;
    clearHoldTimer();
    const wasHeld = held.current;
    activePointer.current = null;
    if (wasHeld && !cancelled) {
      moveToPointer(event.clientX, event.clientY);
      onPositionChange(pendingPosition.current);
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
    if (!cancelled && !wasHeld && !moved.current) void goToTop();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="zeus-button"
      data-dragging="false"
      aria-grabbed="false"
      aria-label="ゼウスボタン。押すとトップへ戻り、長押しすると移動できます"
      onPointerDown={(event) => {
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        activePointer.current = event.pointerId;
        start.current = { x: event.clientX, y: event.clientY };
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
          event.currentTarget.dataset.dragging = "true";
          event.currentTarget.setAttribute("aria-grabbed", "true");
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        if (activePointer.current !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
        if (!held.current) {
          if (distance > MOVE_TOLERANCE) {
            moved.current = true;
            clearHoldTimer();
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
        if (event.detail === 0) void goToTop();
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <span className="zeus-button-aura" aria-hidden="true" />
      <img src="/zeus-button.png" alt="" decoding="async" fetchPriority="high" draggable={false} />
      <span className="zeus-button-move" aria-hidden="true">MOVE</span>
    </button>
  );
}
