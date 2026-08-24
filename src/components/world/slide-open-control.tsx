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

const OPEN_THRESHOLD = 0.68;

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
  const grabOffset = useRef(0);
  const travel = useRef(0);
  const dragMetrics = useRef<SlideMetrics | null>(null);
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

  const clearTimers = () => {
    if (activateTimer.current != null) window.clearTimeout(activateTimer.current);
    activateTimer.current = null;
  };

  const reset = () => {
    activePointer.current = null;
    grabOffset.current = 0;
    dragMetrics.current = null;
    completingRef.current = false;
    const button = internalButtonRef.current;
    if (button) {
      button.dataset.dragging = "false";
      button.dataset.completing = "false";
    }
    button?.style.setProperty("--slide-offset", "0px");
    const thumbWidth = thumbRef.current?.getBoundingClientRect().width ?? 50;
    button?.style.setProperty("--slide-fill", `${thumbWidth}px`);
    button?.style.setProperty("--slide-label-opacity", "1");
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

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
  });

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
    button?.style.setProperty("--slide-offset", `${next}px`);
    button?.style.setProperty("--slide-fill", `${next + metrics.thumbRect.width}px`);
    button?.style.setProperty("--slide-label-opacity", String(Math.max(0.2, 1 - ratio * 0.8)));
    return ratio;
  };

  const complete = (source: "keyboard" | "pointer") => {
    if (completingRef.current) return;
    const metrics = getMetrics();
    completingRef.current = true;
    const completedOffset = metrics?.distance ?? travel.current;
    const button = internalButtonRef.current;
    if (button) {
      button.dataset.dragging = "false";
      button.dataset.completing = "true";
    }
    button?.style.setProperty("--slide-offset", `${completedOffset}px`);
    button?.style.setProperty(
      "--slide-fill",
      `${completedOffset + (metrics?.thumbRect.width ?? 50)}px`,
    );
    button?.style.setProperty("--slide-label-opacity", "0.2");
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
      reducedMotion ? 0 : 140,
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
    const hitPadding = event.pointerType === "mouse" ? 10 : 24;
    if (
      event.clientX < metrics.thumbRect.left - hitPadding ||
      event.clientX > metrics.thumbRect.right + hitPadding
    )
      return;

    event.preventDefault();
    event.stopPropagation();
    activePointer.current = event.pointerId;
    grabOffset.current = event.clientX - (metrics.thumbRect.left + metrics.thumbRect.width / 2);
    event.currentTarget.dataset.dragging = "true";
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some Android WebViews keep delivering the pointer without capture.
      // The drag remains usable through the normal bubbling event stream.
    }
    moveToPointer(event.clientX);
  };

  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    moveToPointer(event.clientX);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const ratio = moveToPointer(event.clientX);
    activePointer.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture can already be gone after an Android compositor handoff.
    }
    if (ratio >= OPEN_THRESHOLD) complete("pointer");
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
      data-dragging="false"
      data-completing="false"
      data-keyboard-focus="false"
      aria-haspopup={opensDialog ? "dialog" : undefined}
      aria-controls={ariaControls}
      aria-expanded={opensDialog ? expanded : undefined}
      aria-label={`${ariaLabel}。右へスライドして開きます`}
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
        <small>SLIDE TO OPEN</small>
        <b>{label}</b>
      </span>
      <span className="ios-slide-open-arrows" aria-hidden="true">
        <i />
        <i />
      </span>
      <span ref={thumbRef} className="ios-slide-open-thumb" aria-hidden="true">
        <i />
        <b>
          <UiVectorIcon kind="plus" size={22} />
        </b>
      </span>
    </button>
  );
}
