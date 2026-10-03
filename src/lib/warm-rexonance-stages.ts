import { rexonanceImage } from "./rexonance-images.ts";

type ImageCandidates = { srcSet?: string; sizes?: string };

/** Warm only nearby alternate forms, one at a time; never gate navigation.
 * `resolve` must give the candidates the visible image element uses, so the
 * warm-up fetches and decodes the very file it will paint (Final Stage's
 * portraits pass the dossier delivery as well). */
export function warmRexonanceStages(
  target: Element,
  sources: readonly string[],
  resolve: (source: string) => ImageCandidates = rexonanceImage,
) {
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
    const responsive = resolve(source);
    if (responsive.srcSet) {
      if (responsive.sizes) next.sizes = responsive.sizes;
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
