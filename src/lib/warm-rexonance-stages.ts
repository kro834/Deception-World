import { rexonanceImage } from "./rexonance-images.ts";

/** Warm only nearby alternate forms, one at a time; never gate navigation. */
export function warmRexonanceStages(target: Element, sources: readonly string[]) {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    !window.IntersectionObserver ||
    connection?.saveData ||
    ["slow-2g", "2g", "3g"].includes(connection?.effectiveType || "")
  )
    return () => {};
  let disposed = false;
  let near = false;
  let index = 0;
  let image: HTMLImageElement | null = null;
  let timeout = 0;
  let idle = 0;
  let fallback = 0;

  const advance = () => {
    idle = 0;
    fallback = 0;
    if (disposed || document.hidden || !near || image || index >= sources.length) return;
    const next = new Image();
    image = next;
    next.decoding = "async";
    next.fetchPriority = "low";
    const source = sources[index++];
    const responsive = rexonanceImage(source);
    if (responsive.srcSet) {
      next.sizes = responsive.sizes;
      next.srcset = responsive.srcSet;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      next.onload = null;
      next.onerror = null;
      image = null;
      schedule();
    };
    next.onload = () => {
      if (typeof next.decode === "function") void next.decode().then(finish, finish);
      else finish();
    };
    next.onerror = finish;
    timeout = window.setTimeout(() => {
      next.removeAttribute("srcset");
      next.removeAttribute("src");
      finish();
    }, 6000);
    next.src = source;
  };
  const schedule = () => {
    if (
      disposed ||
      document.hidden ||
      !near ||
      image ||
      idle ||
      fallback ||
      index >= sources.length
    )
      return;
    if (window.requestIdleCallback) idle = window.requestIdleCallback(advance, { timeout: 1200 });
    else fallback = window.setTimeout(advance, 120);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      near = entries.some((entry) => entry.isIntersecting);
      schedule();
    },
    { rootMargin: "400px 0px" },
  );
  observer.observe(target);
  document.addEventListener("visibilitychange", schedule);
  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener("visibilitychange", schedule);
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(fallback);
    window.clearTimeout(timeout);
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("srcset");
      image.removeAttribute("src");
      image = null;
    }
  };
}
