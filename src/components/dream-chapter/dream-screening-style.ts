import stylesheet from "./dream-screening-room.css?url";

let ready: Promise<void> | null = null;

/** Load on explicit entry, without suspending (and hiding) the whole programme.
 * The one namespaced sheet is cached for subsequent visits; failed loads retry. */
export function prepareScreeningStyle(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet;
    link.dataset.dreamScreeningStyle = "true";
    const finish = (loaded: boolean) => {
      window.clearTimeout(timer);
      link.onload = null;
      link.onerror = null;
      if (loaded) resolve();
      else {
        link.remove();
        ready = null;
        reject(new Error("Screening stylesheet unavailable"));
      }
    };
    const timer = window.setTimeout(() => finish(false), 12000);
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.append(link);
  });
  return ready;
}
