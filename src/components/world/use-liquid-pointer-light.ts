import { useEffect } from "react";
import { prefersLightweightRendering } from "@/lib/rendering-profile";

const SELECTOR = "[data-liquid-pointer]";

type LiquidTarget = HTMLElement & {
  dataset: DOMStringMap & {
    liquidPointerActive?: string;
    liquidPointerPressed?: string;
  };
};

export function useLiquidPointerLight() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    if (reducedMotion.matches || reducedTransparency.matches || prefersLightweightRendering(navigator)) return;

    let active: LiquidTarget | null = null;
    let pressed: LiquidTarget | null = null;
    let pointerId: number | null = null;
    let frame = 0;
    let nextPoint: { target: LiquidTarget; x: number; y: number } | null = null;

    const findTarget = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest(SELECTOR) as LiquidTarget | null) : null;

    const setActive = (target: LiquidTarget | null, value: boolean) => {
      if (!target) return;
      if (value) {
        if (target.dataset.liquidPointerActive !== "true") target.dataset.liquidPointerActive = "true";
      } else if (target.dataset.liquidPointerActive) {
        delete target.dataset.liquidPointerActive;
      }
    };

    const setPressed = (target: LiquidTarget | null, value: boolean) => {
      if (!target) return;
      if (value) {
        if (target.dataset.liquidPointerPressed !== "true") target.dataset.liquidPointerPressed = "true";
      } else if (target.dataset.liquidPointerPressed) {
        delete target.dataset.liquidPointerPressed;
      }
    };

    const flush = () => {
      frame = 0;
      if (!nextPoint || document.hidden) return;
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
      if (!event.isPrimary) return;
      // `pointerover` already activates an eligible control. Avoid a DOM
      // `closest()` lookup for every mouse movement elsewhere on the page.
      if (!active && pointerId === null) return;
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
      nextPoint = null;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      setPressed(pressed, false);
      setActive(active, false);
      pressed = null;
      active = null;
      pointerId = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) reset();
    };

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibilityChange);
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, []);
}
