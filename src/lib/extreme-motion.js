import { supportsIOS27Enhancements } from "./rendering-profile.js";

/** Follow the installed renderer and live preferences, not a one-time UA guess.
 * The page stays fully native-scrollable; only the decorative fallback is gated. */
export function mountExtremeMotion(page, setMotionReady, environment = window) {
  if (!page) return () => {};
  const document = page.ownerDocument;
  const html = document.documentElement;
  const device = environment.navigator;
  const reducedMotion = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = environment.matchMedia("(pointer: coarse)");
  const connection = device.connection;
  const nativeEligible = supportsIOS27Enhancements(device);
  // Where view timelines run, the motion sheet's recede already follows the
  // scroll on the compositor, so the per-frame property write is skipped as on
  // Rexonance (rx2 F4); it remains the fallback without timelines.
  const timelines = Boolean(
    environment.CSS?.supports?.("animation-timeline", "view()") &&
      environment.CSS.supports("animation-range", "entry 0% entry 100%"),
  );
  const previousProgress = page.style.getPropertyValue("--rxs-hero-progress");
  const previousPriority = page.style.getPropertyPriority("--rxs-hero-progress");
  let ready;
  let frame = 0;
  let listening = false;
  let disposed = false;
  let lastProgress = -1;
  const update = () => {
    frame = 0;
    if (disposed || document.hidden || !listening) return;
    const height = environment.visualViewport?.height || environment.innerHeight || 1;
    const progress = Math.min(1, Math.max(0, environment.scrollY / height));
    if (Math.abs(progress - lastProgress) < 0.002) return;
    lastProgress = progress;
    page.style.setProperty("--rxs-hero-progress", progress.toFixed(3));
  };
  const onScroll = () => {
    if (!disposed && !document.hidden && listening && !frame) {
      frame = environment.requestAnimationFrame(update);
    }
  };
  const detach = () => {
    environment.removeEventListener("scroll", onScroll);
    environment.visualViewport?.removeEventListener("resize", onScroll);
    if (frame) environment.cancelAnimationFrame(frame);
    frame = 0;
    listening = false;
  };
  const sync = () => {
    if (disposed) return;
    const constrained =
      connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    const allowed =
      !reducedMotion.matches && !constrained && html.dataset.worldEffects !== "economy";
    if (ready !== allowed) {
      ready = allowed;
      setMotionReady(allowed);
    }
    const native = timelines || (nativeEligible && html.dataset.ios27Enhanced === "true");
    if (!allowed || coarsePointer.matches || native || document.hidden) {
      detach();
      if (!document.hidden) {
        page.style.removeProperty("--rxs-hero-progress");
        lastProgress = -1;
      }
    } else if (!listening) {
      listening = true;
      update();
      environment.addEventListener("scroll", onScroll, { passive: true });
      environment.visualViewport?.addEventListener("resize", onScroll, { passive: true });
    }
  };
  const observer = new environment.MutationObserver(sync);
  observer.observe(html, {
    attributes: true,
    attributeFilter: nativeEligible
      ? ["data-world-effects", "data-ios27-enhanced"]
      : ["data-world-effects"],
  });
  reducedMotion.addEventListener?.("change", sync);
  coarsePointer.addEventListener?.("change", sync);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", detach);
  environment.addEventListener("pageshow", sync);
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    reducedMotion.removeEventListener?.("change", sync);
    coarsePointer.removeEventListener?.("change", sync);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", detach);
    environment.removeEventListener("pageshow", sync);
    detach();
    if (previousProgress)
      page.style.setProperty("--rxs-hero-progress", previousProgress, previousPriority);
    else page.style.removeProperty("--rxs-hero-progress");
  };
}

/** Rotation can deliver three resize sources together. Read nav layout once
 * in that frame, retaining the initial synchronous reserve for first paint. */
export function mountExtremeNavReserve(page, environment = window) {
  const nav = page?.querySelector(".rxs-local-nav");
  if (!nav) return () => {};
  const property = "--rxs-local-nav-reserve";
  const previous = page.style.getPropertyValue(property);
  const priority = page.style.getPropertyPriority(property);
  let frame = 0;
  let disposed = false;
  const measure = () => {
    const reserve = `${Math.ceil(nav.getBoundingClientRect().height)}px`;
    if (page.style.getPropertyValue(property) !== reserve)
      page.style.setProperty(property, reserve);
  };
  const queue = () => {
    if (disposed || frame) return;
    frame = environment.requestAnimationFrame(() => {
      frame = 0;
      if (!disposed) measure();
    });
  };
  const observer = environment.ResizeObserver ? new environment.ResizeObserver(queue) : null;
  observer?.observe(nav);
  environment.addEventListener("resize", queue, { passive: true });
  environment.visualViewport?.addEventListener("resize", queue, { passive: true });
  measure();
  return () => {
    disposed = true;
    observer?.disconnect();
    environment.removeEventListener("resize", queue);
    environment.visualViewport?.removeEventListener("resize", queue);
    if (frame) environment.cancelAnimationFrame(frame);
    if (previous) page.style.setProperty(property, previous, priority);
    else page.style.removeProperty(property);
  };
}
