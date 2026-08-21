import { useEffect } from "react";

const SELECTOR = "[data-liquid-pointer]";

type LiquidTarget = HTMLElement & {
  dataset: DOMStringMap & {
    liquidPointerActive?: string;
    liquidPointerPressed?: string;
  };
};

export function useLiquidPointerLight() {
  useEffect(() => {
    let active: LiquidTarget | null = null;
    let pressed: LiquidTarget | null = null;
    let pointerId: number | null = null;
    let frame = 0;
    let nextPoint: { target: LiquidTarget; x: number; y: number } | null = null;

    const findTarget = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest(SELECTOR) as LiquidTarget | null) : null;

    const setActive = (target: LiquidTarget | null, value: boolean) => {
      if (!target) return;
      if (value) target.dataset.liquidPointerActive = "true";
      else delete target.dataset.liquidPointerActive;
    };

    const setPressed = (target: LiquidTarget | null, value: boolean) => {
      if (!target) return;
      if (value) target.dataset.liquidPointerPressed = "true";
      else delete target.dataset.liquidPointerPressed;
    };

    const flush = () => {
      frame = 0;
      if (!nextPoint) return;
      const { target, x, y } = nextPoint;
      nextPoint = null;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--liquid-pointer-x", `${x - rect.left}px`);
      target.style.setProperty("--liquid-pointer-y", `${y - rect.top}px`);
    };

    const place = (target: LiquidTarget, x: number, y: number) => {
      nextPoint = { target, x, y };
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    const activate = (target: LiquidTarget, x: number, y: number) => {
      if (active && active !== target) setActive(active, false);
      active = target;
      setActive(target, true);
      place(target, x, y);
    };

    const release = (target: LiquidTarget | null, pointerType = "") => {
      setPressed(target, false);
      if (pressed === target) pressed = null;
      pointerId = null;
      if (pointerType !== "mouse") {
        setActive(target, false);
        if (active === target) active = null;
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = findTarget(event.target);
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      activate(target, event.clientX, event.clientY);
    };
    const onPointerMove = (event: PointerEvent) => {
      const target = findTarget(event.target) ?? (pointerId === event.pointerId ? pressed : null);
      if (target) activate(target, event.clientX, event.clientY);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = findTarget(event.target);
      if (!target || !event.isPrimary) return;
      pressed = target;
      pointerId = event.pointerId;
      setPressed(target, true);
      activate(target, event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== null && event.pointerId !== pointerId) return;
      release(pressed ?? findTarget(event.target), event.pointerType);
    };
    const onPointerOut = (event: PointerEvent) => {
      const target = findTarget(event.target);
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) || target === pressed) return;
      setActive(target, false);
      if (active === target) active = null;
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = findTarget(event.target);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      activate(target, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = findTarget(event.target);
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      setActive(target, false);
      if (active === target) active = null;
    };
    const reset = () => {
      setPressed(pressed, false);
      setActive(active, false);
      pressed = null;
      active = null;
      pointerId = null;
    };

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("blur", reset);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("blur", reset);
      if (frame) window.cancelAnimationFrame(frame);
      reset();
    };
  }, []);
}
