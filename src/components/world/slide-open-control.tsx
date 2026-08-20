import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from "react";
import { UiVectorIcon } from "./ui-vector-icon";

type SlideOpenControlProps = {
  ariaControls?: string;
  ariaLabel: string;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  expanded?: boolean;
  label?: string;
  onOpen: () => void;
};

const OPEN_THRESHOLD = 0.68;

export function SlideOpenControl({
  ariaControls,
  ariaLabel,
  buttonRef,
  className = "",
  expanded,
  label = "詳細を開く",
  onOpen,
}: SlideOpenControlProps) {
  const internalButtonRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const activePointer = useRef<number | null>(null);
  const grabOffset = useRef(0);
  const travel = useRef(0);
  const activateTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);
  const completingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completing, setCompleting] = useState(false);

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
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    activateTimer.current = null;
    resetTimer.current = null;
  };

  const reset = () => {
    activePointer.current = null;
    grabOffset.current = 0;
    completingRef.current = false;
    setDragging(false);
    setCompleting(false);
    setOffset(0);
    setProgress(0);
  };

  useEffect(() => {
    return () => clearTimers();
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
    const metrics = getMetrics();
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
    setOffset(next);
    setProgress(ratio);
    return ratio;
  };

  const complete = (source: "keyboard" | "pointer") => {
    if (completingRef.current) return;
    const metrics = getMetrics();
    completingRef.current = true;
    setDragging(false);
    setCompleting(true);
    setOffset(metrics?.distance ?? travel.current);
    setProgress(1);
    clearTimers();

    // A pointer drag must not become the dialog's focus-return target. If the
    // button stays focused, closing the dialog restores focus here and the
    // focus-visible halo makes the completed slider look selected. Keyboard
    // activation keeps the focus return for accessible navigation.
    if (source === "pointer") internalButtonRef.current?.blur();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activateTimer.current = window.setTimeout(
      () => {
        onOpen();
        resetTimer.current = window.setTimeout(reset, reducedMotion ? 0 : 360);
      },
      reducedMotion ? 0 : 140,
    );
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (completingRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const metrics = getMetrics();
    if (!metrics) return;
    const hitPadding = 10;
    if (
      event.clientX < metrics.thumbRect.left - hitPadding ||
      event.clientX > metrics.thumbRect.right + hitPadding
    )
      return;

    event.preventDefault();
    event.stopPropagation();
    activePointer.current = event.pointerId;
    grabOffset.current = event.clientX - (metrics.thumbRect.left + metrics.thumbRect.width / 2);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (ratio >= OPEN_THRESHOLD) complete("pointer");
    else reset();
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    reset();
  };

  const style = {
    "--slide-offset": `${offset}px`,
    "--slide-fill": `${offset + 50}px`,
    "--slide-label-opacity": String(Math.max(0.2, 1 - progress * 0.8)),
  } as CSSProperties;

  return (
    <button
      ref={setButtonRef}
      type="button"
      className={`${className} ios-slide-open`.trim()}
      style={style}
      data-dragging={dragging}
      data-completing={completing}
      aria-haspopup="dialog"
      aria-controls={ariaControls}
      aria-expanded={expanded}
      aria-label={`${ariaLabel}。右へスライドして開きます`}
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
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
