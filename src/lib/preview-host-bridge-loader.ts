import { resolveParentEmbedderOrigin } from "./preview-embedder-origin.ts";

type BridgeModule = typeof import("./preview-host-bridge");
type BridgeOptions = {
  navigate: (path: string) => void;
  routeTree: unknown;
};

/** The preview's validator is only needed inside an accepted preview frame. */
export function loadPreviewHostBridge(
  options: BridgeOptions,
  load: () => Promise<BridgeModule> = () => import("./preview-host-bridge"),
): () => void {
  if (typeof window === "undefined") return () => {};
  const parentOrigin = resolveParentEmbedderOrigin(
    window.parent === window,
    document.referrer,
    window.location.ancestorOrigins?.[0],
    window.location.hostname,
  );
  if (parentOrigin === null) return () => {};

  let disposed = false;
  let disposeBridge: (() => void) | undefined;
  const pending: MessageEvent[] = [];
  // Keep the parent's handshake and commands during the chunk fetch. Replaying
  // their original source/origin/data through the installed listener preserves
  // its existing schema, version and safe-path validation without a second
  // implementation of the protocol here.
  const remember = (event: MessageEvent) => {
    if (
      event.source === window.parent &&
      event.origin === parentOrigin &&
      event.data?.channel === "grok-preview-bridge"
    ) {
      pending.push(event);
    }
  };
  window.addEventListener("message", remember);

  void Promise.resolve()
    .then(load)
    .then((bridge) => {
      if (disposed) return;
      window.removeEventListener("message", remember);
      disposeBridge = bridge.installPreviewHostBridge({
        navigate: options.navigate,
        getRoutePaths: () => bridge.collectRoutePathsFromTree(options.routeTree),
      });
      if (disposed) {
        disposeBridge();
        return;
      }
      for (const event of pending.splice(0)) {
        if (disposed) break;
        window.dispatchEvent(event);
      }
    })
    .catch(() => {
      window.removeEventListener("message", remember);
      pending.length = 0;
    });

  return () => {
    disposed = true;
    window.removeEventListener("message", remember);
    pending.length = 0;
    disposeBridge?.();
  };
}
