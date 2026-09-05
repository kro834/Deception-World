import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";
import { UiVectorIcon } from "./ui-vector-icon";

type SlideOpenControlProps = {
  ariaControls?: string;
  ariaLabel: string;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  expanded?: boolean;
  label?: string;
  opensDialog?: boolean;
  onOpen: (source: "keyboard" | "pointer") => void;
};

const OPEN_THRESHOLD = 0.4;
const POINTER_INTENT_THRESHOLD = 10;
const TAP_TOLERANCE = 12;
const HOLD_MOVE_TOLERANCE = 28;
const HOLD_ACTIVATION_MS = 60;
const COMPLETE_ANIMATION_MS = 260;
const HORIZONTAL_INTENT_RATIO = 1.08;
const COARSE_HIT_PADDING = 36;

type PointerIntent = "idle" | "pending" | "horizontal";

type SlideMetrics = {
  buttonRect: DOMRect;
  thumbRect: DOMRect;
  inset: number;
  distance: number;
};

export function SlideOpenControl({
  ariaControls,
  ariaLabel,
  buttonRef,
  className = "",
  expanded,
  label = "詳細を開く",
  opensDialog = true,
  onOpen,
}: SlideOpenControlProps) {
  const internalButtonRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const activePointer = useRef<number | null>(null);
  const pointerIntent = useRef<PointerIntent>("idle");
  const pointerStart = useRef({ x: 0, y: 0 });
  const latestPointer = useRef({ x: 0, y: 0 });
  const requiresHold = useRef(false);
  const holdActivated = useRef(false);
  const grabOffset = useRef(0);
  const motionSample = useRef({ offset: 0, at: 0 });
  const travel = useRef(0);
  const dragMetrics = useRef<SlideMetrics | null>(null);
  const holdTimer = useRef<number | null>(null);
  const activateTimer = useRef<number | null>(null);
  const completingRef = useRef(false);
  const suppressFocusRing = useRef(false);

  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      internalButtonRef.current = node;
      if (typeof buttonRef === "function") buttonRef(node);
      else if (buttonRef) buttonRef.current = node;
    },
    [buttonRef],
  );

  const clearTimers = useCallback(() => {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (activateTimer.current != null) window.clearTimeout(activateTimer.current);
    activateTimer.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    activePointer.current = null;
    pointerIntent.current = "idle";
    pointerStart.current = { x: 0, y: 0 };
    latestPointer.current = { x: 0, y: 0 };
    requiresHold.current = false;
    holdActivated.current = false;
    grabOffset.current = 0;
    motionSample.current = { offset: 0, at: 0 };
    dragMetrics.current = null;
    completingRef.current = false;
    const button = internalButtonRef.current;
    if (button) {
      button.dataset.holding = "false";
      button.dataset.dragging = "false";
      button.dataset.completing = "false";
    }
    button?.style.setProperty("--slide-offset", "0px");
    const thumbWidth = thumbRef.current?.getBoundingClientRect().width ?? 50;
    button?.style.setProperty("--slide-fill", `${thumbWidth}px`);
    button?.style.setProperty("--slide-label-opacity", "1");
    button?.style.removeProperty("--slide-thumb-scale-x");
    button?.style.removeProperty("--slide-thumb-scale-y");
    button?.style.removeProperty("--slide-thumb-tilt");
  }, [clearTimers]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  /* Capture can fail in Android WebViews. A pointer released outside the
     element must still clear the drag state instead of leaving the thumb and
     page gesture ownership active. */
  useEffect(() => {
    const cancelDanglingDrag = (event?: PointerEvent) => {
      if (
        activePointer.current == null ||
        (event && event.pointerId !== activePointer.current)
      )
        return;
      const button = internalButtonRef.current;
      const pointerId = activePointer.current;
      try {
        if (button?.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      } catch {
        /* Native gesture takeover already released capture. */
      }
      reset();
    };
    const cancelOnBlur = () => cancelDanglingDrag();
    window.addEventListener("pointerup", cancelDanglingDrag);
    window.addEventListener("pointercancel", cancelDanglingDrag);
    window.addEventListener("blur", cancelOnBlur);
    window.addEventListener("pagehide", cancelOnBlur);
    return () => {
      window.removeEventListener("pointerup", cancelDanglingDrag);
      window.removeEventListener("pointercancel", cancelDanglingDrag);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("pagehide", cancelOnBlur);
    };
  }, [reset]);

  useEffect(() => {
    const enableKeyboardFocus = () => {
      suppressFocusRing.current = false;
    };
    document.addEventListener("keydown", enableKeyboardFocus, true);
    return () => document.removeEventListener("keydown", enableKeyboardFocus, true);
  }, []);

  const getMetrics = () => {
    const button = internalButtonRef.current;
    const thumb = thumbRef.current;
    if (!button || !thumb) return null;
    const buttonRect = button.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const inset = Math.max(0, (buttonRect.height - thumbRect.height) / 2);
    const distance = Math.max(0, buttonRect.width - thumbRect.width - inset * 2);
    travel.current = distance;
    return { buttonRect, thumbRect, inset, distance };
  };

  const moveToPointer = (clientX: number) => {
    const metrics = dragMetrics.current ?? getMetrics();
    if (!metrics) return 0;
    const next = Math.max(
      0,
      Math.min(
        metrics.distance,
        clientX -
          metrics.buttonRect.left -
          metrics.inset -
          metrics.thumbRect.width / 2 -
          grabOffset.current,
      ),
    );
    const ratio = metrics.distance > 0 ? next / metrics.distance : 0;
    const button = internalButtonRef.current;
    const now = performance.now();
    const previous = motionSample.current;
    const elapsed = previous.at > 0 ? Math.max(16, now - previous.at) : 16;
    const velocity = (next - previous.offset) / elapsed;
    const energy = Math.min(1, Math.abs(velocity) / 1.25);
    const direction = Math.sign(velocity || 1);
    motionSample.current = { offset: next, at: now };
    button?.style.setProperty("--slide-offset", `${next}px`);
    button?.style.setProperty("--slide-fill", `${next + metrics.thumbRect.width}px`);
    button?.style.setProperty("--slide-label-opacity", String(Math.max(0.2, 1 - ratio * 0.8)));
    button?.style.setProperty("--slide-thumb-scale-x", String(1 + energy * 0.09));
    button?.style.setProperty("--slide-thumb-scale-y", String(1 - energy * 0.055));
    button?.style.setProperty("--slide-thumb-tilt", `${direction * energy * 3.2}deg`);
    return ratio;
  };

  const complete = (source: "keyboard" | "pointer") => {
    if (completingRef.current) return;
    const metrics = getMetrics();
    completingRef.current = true;
    const completedOffset = metrics?.distance ?? travel.current;
    const button = internalButtonRef.current;
    if (button) {
      button.dataset.holding = "false";
      button.dataset.dragging = "false";
      button.dataset.completing = "true";
    }
    button?.style.setProperty("--slide-offset", `${completedOffset}px`);
    button?.style.setProperty(
      "--slide-fill",
      `${completedOffset + (metrics?.thumbRect.width ?? 50)}px`,
    );
    button?.style.setProperty("--slide-label-opacity", "0.2");
    button?.style.removeProperty("--slide-thumb-scale-x");
    button?.style.removeProperty("--slide-thumb-scale-y");
    button?.style.removeProperty("--slide-thumb-tilt");
    clearTimers();

    // A pointer drag must not become the dialog's focus-return target. If the
    // button stays focused, closing the dialog restores focus here and the
    // focus-visible halo makes the completed slider look selected. Keyboard
    // activation keeps the focus return for accessible navigation.
    if (source === "pointer") {
      suppressFocusRing.current = true;
      if (button) button.dataset.keyboardFocus = "false";
      button?.blur();
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activateTimer.current = window.setTimeout(
      () => {
        onOpen(source);
        // A route transition can spend a short time preloading before the
        // current page unmounts. Keep the thumb at the completed edge during
        // that interval so it never appears to spring back before navigation.
        // Dialog launchers stay on the same page, so reset them only after the
        // modal has had a frame to cover the control.
        if (opensDialog) window.requestAnimationFrame(reset);
      },
      reducedMotion ? 0 : COMPLETE_ANIMATION_MS,
    );
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      completingRef.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    suppressFocusRing.current = true;
    event.currentTarget.dataset.keyboardFocus = "false";
    const metrics = getMetrics();
    if (!metrics) return;
    dragMetrics.current = metrics;
    // A finger obscures the glass thumb on compact screens. Give coarse
    // pointers a larger pickup area while keeping mouse targeting precise.
    const hitPadding = event.pointerType === "mouse" ? 10 : COARSE_HIT_PADDING;
    if (
      event.clientX < metrics.thumbRect.left - hitPadding ||
      event.clientX > metrics.thumbRect.right + hitPadding
    )
      return;

    activePointer.current = event.pointerId;
    pointerIntent.current = "pending";
    pointerStart.current = { x: event.clientX, y: event.clientY };
    latestPointer.current = { x: event.clientX, y: event.clientY };
    requiresHold.current = event.pointerType !== "mouse";
    holdActivated.current = false;
    grabOffset.current = event.clientX - (metrics.thumbRect.left + metrics.thumbRect.width / 2);
    motionSample.current = { offset: 0, at: performance.now() };

    if (requiresHold.current) {
      const button = event.currentTarget;
      const pointerId = event.pointerId;
      button.dataset.holding = "true";
      holdTimer.current = window.setTimeout(() => {
        if (
          activePointer.current !== pointerId ||
          pointerIntent.current !== "pending" ||
          !dragMetrics.current
        )
          return;
        holdActivated.current = true;
        pointerIntent.current = "horizontal";
        button.dataset.holding = "false";
        button.dataset.dragging = "true";
        try {
          button.setPointerCapture(pointerId);
        } catch {
          // The window-level cleanup still terminates an uncaptured hold.
        }
        // Preserve the distance already travelled during the short hold. A
        // finger can begin easing right before activation without losing that
        // movement or seeing the thumb jump back under it.
        moveToPointer(latestPointer.current.x);
      }, HOLD_ACTIVATION_MS);
    }
  };

  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;
    latestPointer.current = { x: event.clientX, y: event.clientY };

    if (pointerIntent.current === "pending") {
      const deltaX = event.clientX - pointerStart.current.x;
      const deltaY = event.clientY - pointerStart.current.y;
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (
        horizontalDistance < POINTER_INTENT_THRESHOLD &&
        verticalDistance < POINTER_INTENT_THRESHOLD
      ) {
        return;
      }

      // Touch and pen input deliberately require a brief hold before the
      // thumb captures the gesture. Tolerate natural horizontal finger drift
      // during that shorter hold, while yielding as soon as vertical scrolling
      // clearly wins.
      if (requiresHold.current) {
        if (
          (verticalDistance >= POINTER_INTENT_THRESHOLD &&
            verticalDistance >= horizontalDistance) ||
          horizontalDistance >= HOLD_MOVE_TOLERANCE
        ) {
          reset();
        }
        return;
      }

      // Once vertical movement wins, abandon the slider without cancelling
      // the pointer event. The browser remains responsible for native page
      // scrolling on pointer-capable desktop devices.
      if (verticalDistance >= horizontalDistance) {
        reset();
        return;
      }

      // Diagonal movement stays undecided until horizontal intent is clear.
      if (horizontalDistance < verticalDistance * HORIZONTAL_INTENT_RATIO) return;

      pointerIntent.current = "horizontal";
      event.currentTarget.dataset.dragging = "true";
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some Android WebViews keep delivering the pointer without capture.
        // The window-level cleanup still prevents a dangling drag state.
      }
    }

    if (pointerIntent.current !== "horizontal") return;
    event.preventDefault();
    event.stopPropagation();
    moveToPointer(event.clientX);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;

    if (pointerIntent.current !== "horizontal") {
      const deltaX = event.clientX - pointerStart.current.x;
      const deltaY = event.clientY - pointerStart.current.y;
      const isThumbTap =
        pointerIntent.current === "pending" &&
        Math.abs(deltaX) < TAP_TOLERANCE &&
        Math.abs(deltaY) < TAP_TOLERANCE;

      activePointer.current = null;
      if (isThumbTap) {
        event.preventDefault();
        event.stopPropagation();
        complete("pointer");
      } else {
        reset();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const ratio = moveToPointer(event.clientX);
    const deltaX = Math.abs(event.clientX - pointerStart.current.x);
    const deltaY = Math.abs(event.clientY - pointerStart.current.y);
    // Holding arms a drag; it must not cancel a stationary, deliberate tap.
    const isThumbTap = deltaX < TAP_TOLERANCE && deltaY < TAP_TOLERANCE;
    activePointer.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture can already be gone after an Android compositor handoff.
    }
    if (ratio >= OPEN_THRESHOLD || isThumbTap) complete("pointer");
    else reset();
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Treat a missing capture as a normal cancellation.
    }
    reset();
  };

  return (
    <button
      ref={setButtonRef}
      type="button"
      className={`${className} ios-slide-open`.trim()}
      data-holding="false"
      data-dragging="false"
      data-completing="false"
      data-keyboard-focus="false"
      aria-haspopup={opensDialog ? "dialog" : undefined}
      aria-controls={ariaControls}
      aria-expanded={opensDialog ? expanded : undefined}
      aria-label={`${ariaLabel}。プラスをタップ、または長押ししてから右へスライドして開きます`}
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible") && !suppressFocusRing.current) {
          event.currentTarget.dataset.keyboardFocus = "true";
        }
      }}
      onBlur={(event) => {
        event.currentTarget.dataset.keyboardFocus = "false";
      }}
      onKeyDown={(event) => {
        suppressFocusRing.current = false;
        event.currentTarget.dataset.keyboardFocus = "true";
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail === 0) complete("keyboard");
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <span className="ios-slide-open-fill" aria-hidden="true" />
      <span className="ios-slide-open-label" aria-hidden="true">
        <small>HOLD + SLIDE</small>
        <b>{label}</b>
      </span>
      <span className="ios-slide-open-arrows" aria-hidden="true">
        <i />
        <i />
      </span>
      <span
        ref={thumbRef}
        className="ios-slide-open-thumb"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "3px",
          right: "auto",
          bottom: "3px",
          left: "4px",
          height: "auto",
          transform: "translate3d(var(--slide-offset, 0px), 0, 0)",
        }}
      >
        <i />
        <b>
          <UiVectorIcon kind="plus" size={22} />
        </b>
      </span>
    </button>
  );
}
