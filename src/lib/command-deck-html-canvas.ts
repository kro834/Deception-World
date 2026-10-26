/** Chrome 157 API, verified against the October 23, 2026 Chrome documentation.
 * https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts
 * This projection is decorative. Never move the deck's operative DOM into it.
 */
type DrawableCanvas = HTMLCanvasElement & { content?: string; requestPaint?: () => void };
type DrawableContext = CanvasRenderingContext2D & {
  drawElementImage?: (
    element: Element,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
};
export type CommandDeckHtmlCanvasContent = { title: string; subtitle?: string; accent?: string };

export function supportsCommandDeckHtmlCanvas(doc: Document): boolean {
  const probe = doc.createElement("canvas") as DrawableCanvas;
  probe.setAttribute("content", "drawable");
  return probe.content === "drawable" && typeof probe.requestPaint === "function";
}

export function mountCommandDeckHtmlCanvas(
  host: HTMLElement,
  initial: CommandDeckHtmlCanvasContent,
) {
  const noop = {
    update(_content: CommandDeckHtmlCanvasContent) {},
    setPaused(_paused: boolean) {},
    dispose() {},
  };
  const doc = host.ownerDocument,
    win = doc.defaultView;
  if (!win || !supportsCommandDeckHtmlCanvas(doc)) return noop;
  const canvas = doc.createElement("canvas") as DrawableCanvas;
  canvas.setAttribute("content", "drawable");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "command-deck-html-projection";
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
  let ctx: DrawableContext | null = null;
  try {
    ctx = canvas.getContext("2d", { alpha: true }) as DrawableContext | null;
  } catch {
    return noop;
  }
  if (!ctx || typeof ctx.drawElementImage !== "function") return noop;
  const context = ctx;
  const panel = doc.createElement("div");
  panel.setAttribute("drawable", "");
  panel.inert = true;
  panel.style.cssText =
    "box-sizing:border-box;width:320px;height:100px;padding:18px 22px;border:1px solid rgba(155,221,255,.42);border-left-width:3px;background:linear-gradient(115deg,rgba(12,26,46,.82),rgba(12,26,46,.12));font-family:system-ui,sans-serif;overflow:hidden";
  const title = doc.createElement("div");
  title.style.cssText =
    "font-size:23px;line-height:1.3;font-weight:650;letter-spacing:.16em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e6f7ff";
  const subtitle = doc.createElement("div");
  subtitle.style.cssText =
    "font-size:10px;line-height:1.6;letter-spacing:.2em;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#a3bbcf";
  panel.append(title, subtitle);
  canvas.append(panel);
  let disposed = false,
    paused = false,
    visible = true,
    timeout = 0,
    frame = 0,
    ready = false;
  let cssWidth = 1,
    cssHeight = 1;
  const active = () => !disposed && !paused && visible && !doc.hidden;
  const remove = () => {
    if (disposed) return;
    disposed = true;
    win.clearTimeout(timeout);
    win.cancelAnimationFrame(frame);
    canvas.removeEventListener("paint", paint);
    canvas.remove();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    win.removeEventListener("resize", resize);
    doc.removeEventListener("visibilitychange", request);
    delete host.dataset.htmlCanvas;
  };
  function paint() {
    if (!active()) return;
    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const scale = canvas.width / cssWidth;
      const panelScale = Math.min(0.9, (cssWidth * 0.62) / 320);
      context.save();
      context.setTransform(
        scale,
        0,
        -scale * 0.16,
        scale,
        canvas.width * 0.4,
        canvas.height * 0.72,
      );
      context.globalAlpha = 0.48;
      context.drawElementImage!(panel, 0, 0, 320 * panelScale, 100 * panelScale);
      context.restore();
      ready = true;
      win!.clearTimeout(timeout);
      host.dataset.htmlCanvas = "drawable";
    } catch {
      remove();
    }
  }
  function request() {
    if (doc.hidden && timeout) {
      win!.clearTimeout(timeout);
      timeout = 0;
    }
    if (!active() || frame) return;
    frame = win!.requestAnimationFrame(() => {
      frame = 0;
      if (!active()) return;
      try {
        canvas.requestPaint!();
      } catch {
        remove();
      }
      // A partial/flagged implementation must not leave an empty active layer.
      if (!ready && !timeout && !disposed) timeout = win!.setTimeout(remove, 1500);
    });
  }
  function resize() {
    if (disposed) return;
    const box = host.getBoundingClientRect();
    cssWidth = Math.max(1, box.width);
    cssHeight = Math.max(1, box.height);
    const scale = Math.min(
      win!.devicePixelRatio || 1,
      1.5,
      Math.sqrt(1_000_000 / (cssWidth * cssHeight)),
    );
    const width = Math.max(1, Math.round(cssWidth * scale)),
      height = Math.max(1, Math.round(cssHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    request();
  }
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  const intersectionObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? false;
          if (!visible && timeout) {
            win!.clearTimeout(timeout);
            timeout = 0;
          }
          request();
        })
      : null;
  const update = (content: CommandDeckHtmlCanvasContent) => {
    if (disposed) return;
    title.textContent = content.title;
    subtitle.textContent = content.subtitle ?? "";
    // CSS parses this value as a color; no HTML from the caller is interpreted.
    panel.style.borderColor = content.accent ?? "rgba(155,221,255,.42)";
    request();
  };
  canvas.addEventListener("paint", paint);
  host.append(canvas);
  resizeObserver?.observe(host);
  intersectionObserver?.observe(host);
  win.addEventListener("resize", resize, { passive: true });
  doc.addEventListener("visibilitychange", request);
  update(initial);
  resize();
  return {
    update,
    setPaused(value: boolean) {
      if (disposed) return;
      paused = value;
      if (paused && timeout) {
        win.clearTimeout(timeout);
        timeout = 0;
      }
      request();
    },
    dispose: remove,
  };
}
