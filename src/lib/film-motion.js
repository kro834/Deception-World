/** One-shot chapter entrances. Content stays visible without JS, observers or
 * animation support. Never touch document scrolling or control hit targets. */
export function mountFilmMotion(root, environment = globalThis) {
  const media = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!root || !environment.IntersectionObserver || !media || media.matches) return () => {};
  const document = root.ownerDocument;
  if (document.documentElement.dataset.worldEffects === "economy") return () => {};
  const animations = new Set();
  const pending = new Set(root.querySelectorAll("[data-film-reveal]"));
  let disposed = false;
  const remember = (animation) => {
    animations.add(animation);
    animation.finished.then(
      () => animations.delete(animation),
      () => animations.delete(animation),
    );
  };
  const observer = new environment.IntersectionObserver(
    (entries) => {
      if (disposed) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        if (media.matches || document.hidden || !pending.has(node)) continue;
        pending.delete(node);
        observer.unobserve(node);
        if (!node.animate) continue;
        // The opacity floor deliberately leaves headings readable throughout.
        remember(
          node.animate(
            [
              { opacity: 0.65, transform: "translate3d(0, 14px, 0)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 480, easing: "cubic-bezier(.2,.75,.2,1)" },
          ),
        );
        const line = node.querySelector(".film-boundary-line");
        if (line?.animate)
          remember(
            line.animate([{ transform: "scaleX(0.08)" }, { transform: "scaleX(1)" }], {
              duration: 700,
              easing: "cubic-bezier(.16,1,.3,1)",
            }),
          );
      }
    },
    { threshold: 0.12 },
  );
  pending.forEach((node) => observer.observe(node));
  const cancelAnimations = () => {
    animations.forEach((animation) => animation.cancel());
    animations.clear();
  };
  const syncPreference = () => {
    if (media.matches) {
      observer.disconnect();
      cancelAnimations();
    } else {
      pending.forEach((node) => observer.observe(node));
    }
  };
  const syncVisibility = () => {
    if (document.hidden) cancelAnimations();
    else if (!media.matches)
      pending.forEach((node) => {
        observer.unobserve(node);
        observer.observe(node);
      });
  };
  media.addEventListener?.("change", syncPreference);
  document.addEventListener("visibilitychange", syncVisibility);
  return () => {
    disposed = true;
    observer.disconnect();
    pending.clear();
    cancelAnimations();
    media.removeEventListener?.("change", syncPreference);
    document.removeEventListener("visibilitychange", syncVisibility);
  };
}
