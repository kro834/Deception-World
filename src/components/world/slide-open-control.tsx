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
// The liquid-glass lens (owner, 2026-10-31: 「長押ししたらリキッドグラスの様に
// 拡大」). A held thumb swells into a magnifying lens after this long, or at
// once when it starts to travel. The lens is a separate layer drawn only by
// the liquid-glass option's sheet (styles-liquid-glass.css); the thumb and
// the button keep their measured boxes, so the drag maths never sees it.
const LENS_SWELL_MS = 200;
const LENS_SWELL_TRAVEL = 3;
const LENS_SETTLE_MS = 460;
const LENS_STRETCH_DECAY_MS = 90;

type LensState = "off" | "on" | "settle";

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
  // The furthest the thumb press has wandered from where it started. A press
  // that slid out and came back is an abandoned slide, never a tap.
  const peakTravel = useRef(0);
  const dragMetrics = useRef<SlideMetrics | null>(null);
  const holdTimer = useRef<number | null>(null);
  const activateTimer = useRef<number | null>(null);
  const resetFrame = useRef<number | null>(null);
  const lensTimer = useRef<number | null>(null);
  const lensStretchTimer = useRef<number | null>(null);
  const lensState = useRef<LensState>("off");
  const completingRef = useRef(false);
  const suppressFocusRing = useRef(false);
  // A press that starts on the label or arrows rather than the thumb. The
  // browser's own click then decides whether it was a tap, so page panning
  // (which cancels the pointer and never clicks) keeps its native ownership.
  // `peak` is the furthest that press has wandered: a label press dragged out
  // and back is an abandoned gesture, like the thumb's, never a tap.
  const bodyTapStart = useRef<{ x: number; y: number; id: number; peak: number } | null>(null);

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
    if (resetFrame.current != null) window.cancelAnimationFrame(resetFrame.current);
    resetFrame.current = null;
  }, []);

  const clearLensTimers = useCallback(() => {
    if (lensTimer.current != null) window.clearTimeout(lensTimer.current);
    lensTimer.current = null;
    if (lensStretchTimer.current != null) window.clearTimeout(lensStretchTimer.current);
    lensStretchTimer.current = null;
  }, []);

  /* The lens's state is a data attribute only; the glass sheet draws it.
     "settle" is the release: the lens deflates with a gel spring where it
     is, then hands back to the thumb. */
  const setLens = useCallback(
    (next: LensState) => {
      const button = internalButtonRef.current;
      if (lensState.current === next) return;
      if (next === "settle" && lensState.current === "off") return;
      clearLensTimers();
      lensState.current = next;
      if (button) {
        button.dataset.lens = next;
        if (next !== "on") button.dataset.lensTravel = "false";
      }
      if (next === "settle") {
        button?.style.removeProperty("--slide-lens-sx");
        button?.style.removeProperty("--slide-lens-sy");
        lensTimer.current = window.setTimeout(() => {
          lensTimer.current = null;
          lensState.current = "off";
          if (internalButtonRef.current) internalButtonRef.current.dataset.lens = "off";
        }, LENS_SETTLE_MS);
      }
    },
    [clearLensTimers],
  );

  const reset = useCallback(() => {
    clearTimers();
    setLens("settle");
    activePointer.current = null;
    pointerIntent.current = "idle";
    pointerStart.current = { x: 0, y: 0 };
    latestPointer.current = { x: 0, y: 0 };
    peakTravel.current = 0;
    requiresHold.current = false;
    holdActivated.current = false;
    grabOffset.current = 0;
    motionSample.current = { offset: 0, at: 0 };
    dragMetrics.current = null;
    bodyTapStart.current = null;
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
  }, [clearTimers, setLens]);

  useEffect(() => {
    return () => {
      clearTimers();
      clearLensTimers();
    };
  }, [clearTimers, clearLensTimers]);

  /* Capture can fail in Android WebViews. A pointer released outside the
     element must still clear the drag state instead of leaving the thumb and
     page gesture ownership active. */
  useEffect(() => {
    const cancelDanglingDrag = (event?: PointerEvent) => {
      if (activePointer.current == null || (event && event.pointerId !== activePointer.current))
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
    const cancelOnBlur = () => {
      cancelDanglingDrag();
      reset();
    };
    const cancelWhenHidden = () => {
      if (document.hidden) cancelOnBlur();
    };
    let viewportWidth = window.innerWidth;
    const cancelAfterViewportChange = () => {
      if (window.innerWidth === viewportWidth) return;
      viewportWidth = window.innerWidth;
      // The cached track and thumb rectangles no longer describe the control
      // after rotation/split-view. A mobile toolbar height change keeps them.
      cancelOnBlur();
    };
    window.addEventListener("pointerup", cancelDanglingDrag);
    window.addEventListener("pointercancel", cancelDanglingDrag);
    window.addEventListener("blur", cancelOnBlur);
    window.addEventListener("pagehide", cancelOnBlur);
    window.addEventListener("orientationchange", cancelOnBlur);
    window.addEventListener("resize", cancelAfterViewportChange);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      window.removeEventListener("pointerup", cancelDanglingDrag);
      window.removeEventListener("pointercancel", cancelDanglingDrag);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("pagehide", cancelOnBlur);
      window.removeEventListener("orientationchange", cancelOnBlur);
      window.removeEventListener("resize", cancelAfterViewportChange);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
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
    // The lens is gel: it stretches along its travel and rounds up again as
    // soon as the finger rests (no pointer move resets it otherwise).
    if (next > LENS_SWELL_TRAVEL && !completingRef.current) {
      if (lensState.current !== "on") setLens("on");
      // Travelling, the lens shows what it magnifies; the glyph steps aside.
      if (button && button.dataset.lensTravel !== "true") button.dataset.lensTravel = "true";
    }
    if (lensState.current === "on" && button) {
      button.style.setProperty("--slide-lens-sx", (1 + energy * 0.14).toFixed(3));
      button.style.setProperty("--slide-lens-sy", (1 - energy * 0.08).toFixed(3));
      if (lensStretchTimer.current != null) window.clearTimeout(lensStretchTimer.current);
      lensStretchTimer.current = window.setTimeout(() => {
        lensStretchTimer.current = null;
        button.style.removeProperty("--slide-lens-sx");
        button.style.removeProperty("--slide-lens-sy");
      }, LENS_STRETCH_DECAY_MS);
    }
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
    setLens("settle");

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
        activateTimer.current = null;
        onOpen(source);
        // A route transition can spend a short time preloading before the
        // current page unmounts. Keep the thumb at the completed edge during
        // that interval so it never appears to spring back before navigation.
        // Dialog launchers stay on the same page, so reset them only after the
        // modal has had a frame to cover the control.
        if (opensDialog) resetFrame.current = window.requestAnimationFrame(reset);
      },
      reducedMotion ? 0 : COMPLETE_ANIMATION_MS,
    );
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    bodyTapStart.current = null;
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
    ) {
      // Only the thumb drags. Elsewhere the pill is an ordinary button: the
      // page keeps panning, and onClick opens it once the press ends in place.
      bodyTapStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId, peak: 0 };
      return;
    }

    activePointer.current = event.pointerId;
    pointerIntent.current = "pending";
    pointerStart.current = { x: event.clientX, y: event.clientY };
    latestPointer.current = { x: event.clientX, y: event.clientY };
    peakTravel.current = 0;
    requiresHold.current = event.pointerType !== "mouse";
    holdActivated.current = false;
    grabOffset.current = event.clientX - (metrics.thumbRect.left + metrics.thumbRect.width / 2);
    motionSample.current = { offset: 0, at: performance.now() };

    // The lens layer copies the thumb's resting box and the track's padding
    // box (its magnified view of the label and fill). Read once per press,
    // from the rectangles just measured; never per frame.
    const pressed = event.currentTarget;
    const borderLeft = pressed.clientLeft || 0;
    const borderTop = pressed.clientTop || 0;
    const restLeft = metrics.thumbRect.left - metrics.buttonRect.left - borderLeft;
    pressed.style.setProperty("--slide-lens-x", `${restLeft.toFixed(2)}px`);
    pressed.style.setProperty(
      "--slide-lens-y",
      `${(metrics.thumbRect.top - metrics.buttonRect.top - borderTop).toFixed(2)}px`,
    );
    pressed.style.setProperty("--slide-lens-w", `${metrics.thumbRect.width.toFixed(2)}px`);
    pressed.style.setProperty("--slide-lens-h", `${metrics.thumbRect.height.toFixed(2)}px`);
    if (pressed.clientWidth) {
      pressed.style.setProperty("--slide-track-w", `${pressed.clientWidth}px`);
      pressed.style.setProperty("--slide-track-h", `${pressed.clientHeight}px`);
    }
    clearLensTimers();
    const lensPointer = event.pointerId;
    lensTimer.current = window.setTimeout(() => {
      lensTimer.current = null;
      if (activePointer.current === lensPointer && !completingRef.current) setLens("on");
    }, LENS_SWELL_MS);

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
    const body = bodyTapStart.current;
    if (body && body.id === event.pointerId) {
      body.peak = Math.max(
        body.peak,
        Math.abs(event.clientX - body.x),
        Math.abs(event.clientY - body.y),
      );
    }
    if (activePointer.current !== event.pointerId) return;
    latestPointer.current = { x: event.clientX, y: event.clientY };
    peakTravel.current = Math.max(
      peakTravel.current,
      Math.abs(event.clientX - pointerStart.current.x),
      Math.abs(event.clientY - pointerStart.current.y),
    );

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
    // Sliding out and back is not stationary: that press never opens.
    const isThumbTap =
      deltaX < TAP_TOLERANCE && deltaY < TAP_TOLERANCE && peakTravel.current < TAP_TOLERANCE;
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
      data-lens="off"
      data-lens-travel="false"
      data-keyboard-focus="false"
      aria-haspopup={opensDialog ? "dialog" : undefined}
      aria-controls={ariaControls}
      aria-expanded={opensDialog ? expanded : undefined}
      aria-label={ariaLabel}
      aria-description="プラスをタップ、または長押ししてから右へスライドして開きます"
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onPointerLeave={(event) => {
        // A mouse label press that leaves the control has been dragged away.
        // (Touch and pen are captured to the control and leave only after
        // their release, so only the mouse is read here.)
        const body = bodyTapStart.current;
        if (body && body.id === event.pointerId && event.pointerType === "mouse")
          body.peak = Number.POSITIVE_INFINITY;
      }}
      onLostPointerCapture={(event) => {
        // A touch initially captures the thumb. Moving capture to the button
        // emits a bubbling loss from that child, not cancellation of our drag.
        if (event.target === event.currentTarget) cancelDrag(event);
      }}
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
        if (event.detail === 0) {
          complete("keyboard");
          return;
        }
        // Thumb gestures settle in finishDrag and leave no body press here. A
        // label press that travelled (a short mouse drag) is not a tap.
        const start = bodyTapStart.current;
        bodyTapStart.current = null;
        if (
          start &&
          !completingRef.current &&
          Math.abs(event.clientX - start.x) < TAP_TOLERANCE &&
          Math.abs(event.clientY - start.y) < TAP_TOLERANCE &&
          start.peak < TAP_TOLERANCE
        )
          complete("pointer");
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <span className="ios-slide-open-fill" aria-hidden="true" />
      {/* The thumb and its chevrons show the slide (and a tap opens it too):
          no instruction line (2026-10-23). The description keeps it for AT. */}
      <span className="ios-slide-open-label" aria-hidden="true">
        <b>{label}</b>
      </span>
      <span className="ios-slide-open-arrows" aria-hidden="true">
        <i />
        <i />
      </span>
      {/* The liquid-glass lens: decorative, drawn only by the glass option.
          A magnified copy of the track rides inside it. It sits before the
          thumb so the thumb stays the control's last child. */}
      <span className="ios-slide-open-lens" aria-hidden="true">
        <span className="ios-slide-open-lens-body">
          <span className="ios-slide-open-lens-view">
            <span className="ios-slide-open-fill" />
            <span className="ios-slide-open-label">
              <b>{label}</b>
            </span>
            <span className="ios-slide-open-arrows">
              <i />
              <i />
            </span>
          </span>
          <span className="ios-slide-open-lens-glyph">
            <UiVectorIcon kind="plus" size={22} />
          </span>
        </span>
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
          pointerEvents: "auto",
          touchAction: "none",
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
