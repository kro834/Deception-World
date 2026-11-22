/* Archive ring bridge (2026-11-23). The /form-archive page does not scroll:
   this sandboxed document does. The page's topbar ring shows how far down
   the archive the reader is, so this deferred script reports the document's
   scroll progress (0..1, in steps of 0.01) to the page, at most once a frame
   and only when the step changes. It reads layout once per frame, writes nothing here and
   never blocks input (passive listeners). Only the page's own frame is
   answered by the page (it checks the sender). */
(() => {
  "use strict";

  if (window.parent === window) return;

  const PROGRESS_MESSAGE = "deception-world:archive-progress";
  const html = document.documentElement;
  const kind = html.dataset.archiveKind || "";
  let frame = 0;
  let last = -1;

  const report = () => {
    frame = 0;
    const scroller = document.scrollingElement || html;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const progress =
      max > 0 ? Math.round(Math.min(1, Math.max(0, scroller.scrollTop / max)) * 100) / 100 : 0;
    if (progress === last) return;
    last = progress;
    window.parent.postMessage({ type: PROGRESS_MESSAGE, kind, progress }, "*");
  };
  const queue = () => {
    if (!frame) frame = window.requestAnimationFrame(report);
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue, { passive: true });
  queue();
})();
