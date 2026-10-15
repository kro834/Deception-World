import stylesheet from "./dream-reading-room.css?url";

let ready: Promise<void> | null = null;

/** Native stylesheet loading avoids suspending the surrounding long page. */
export function prepareReadingStyle(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet;
    link.dataset.dreamReadingStyle = "true";
    const finish = (loaded: boolean) => {
      window.clearTimeout(timer);
      link.onload = null;
      link.onerror = null;
      if (loaded) resolve();
      else {
        link.remove();
        ready = null;
        reject(new Error("Reading stylesheet unavailable"));
      }
    };
    const timer = window.setTimeout(() => finish(false), 12000);
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.append(link);
  });
  return ready;
}
