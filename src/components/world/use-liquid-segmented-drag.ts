import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

const TOUCH_HOLD_MS = 260;
const PEN_HOLD_MS = 180;
const PRE_HOLD_TOLERANCE_PX = 9;

export function liquidSegmentIndexFromPointer(
  clientX: number,
  left: number,
  width: number,
  count: number,
): number {
  if (count <= 1 || width <= 0) return 0;
  const progress = Math.min(0.999_999, Math.max(0, (clientX - left) / width));
  return Math.min(count - 1, Math.floor(progress * count));
}

export function shouldCancelLiquidHold(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) > PRE_HOLD_TOLERANCE_PX;
}

export function useLiquidSegmentedDrag<T extends string>({
  values,
  value,
  onCommit,
}: {
  values: readonly T[];
  value: T;
  onCommit: (value: T) => void;
}) {
  const activeIndex = Math.max(0, values.indexOf(value));
  const [previewIndex, setPreviewIndex] = useState(activeIndex);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const previewRef = useRef(activeIndex);
  const heldRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      clearTimer();
      const root = rootRef.current;
      const pointerId = pointerIdRef.current;
      if (root && pointerId !== null && root.hasPointerCapture(pointerId)) {
        try {
          root.releasePointerCapture(pointerId);
        } catch {
          // WebKit can release capture before React receives pointercancel.
        }
      }
      if (heldRef.current) {
        suppressClickUntilRef.current = performance.now() + 420;
        if (commit) onCommit(values[previewRef.current] ?? value);
      }
      heldRef.current = false;
      pointerIdRef.current = null;
      rootRef.current = null;
      setDragging(false);
      setPreviewIndex(activeIndex);
      previewRef.current = activeIndex;
    },
    [activeIndex, clearTimer, onCommit, value, values],
  );

  useEffect(() => {
    if (dragging) return;
    previewRef.current = activeIndex;
    setPreviewIndex(activeIndex);
  }, [activeIndex, dragging]);

  useEffect(() => {
    const cancel = () => finish(false);
    const handleVisibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("orientationchange", cancel);
    window.visualViewport?.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("orientationchange", cancel);
      window.visualViewport?.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [finish]);

  const updatePreview = useCallback(
    (clientX: number) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = liquidSegmentIndexFromPointer(clientX, rect.left, rect.width, values.length);
      if (next === previewRef.current) return;
      previewRef.current = next;
      setPreviewIndex(next);
      navigator.vibrate?.(6);
    },
    [values.length],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      finish(false);
      const root = event.currentTarget;
      rootRef.current = root;
      pointerIdRef.current = event.pointerId;
      startRef.current = { x: event.clientX, y: event.clientY };
      previewRef.current = activeIndex;
      setPreviewIndex(activeIndex);
      const delay = event.pointerType === "pen" ? PEN_HOLD_MS : TOUCH_HOLD_MS;
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (pointerIdRef.current !== event.pointerId || rootRef.current !== root) return;
        heldRef.current = true;
        setDragging(true);
        try {
          root.setPointerCapture(event.pointerId);
        } catch {
          // Capture is an enhancement; window-level cleanup still prevents a stuck rail.
        }
        navigator.vibrate?.(9);
        updatePreview(event.clientX);
      }, delay);
    },
    [activeIndex, finish, updatePreview],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      if (!heldRef.current) {
        const deltaX = event.clientX - startRef.current.x;
        const deltaY = event.clientY - startRef.current.y;
        if (shouldCancelLiquidHold(deltaX, deltaY)) finish(false);
        return;
      }
      event.preventDefault();
      updatePreview(event.clientX);
    },
    [finish, updatePreview],
  );

  const style = {
    "--liquid-segment-index": previewIndex,
    "--liquid-segment-count": values.length,
  } as CSSProperties;

  return {
    railProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerId !== pointerIdRef.current) return;
        if (heldRef.current) event.preventDefault();
        updatePreview(event.clientX);
        finish(heldRef.current);
      },
      onPointerCancel: () => finish(false),
      onLostPointerCapture: () => {
        if (heldRef.current) finish(false);
      },
      "data-liquid-dragging": dragging || undefined,
      style,
    },
    shouldSuppressClick: () => performance.now() < suppressClickUntilRef.current,
  };
}
