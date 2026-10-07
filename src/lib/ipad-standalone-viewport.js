/** Reserve the native status area in installed iPad apps before first paint.
 * iPhone and ordinary browser tabs retain their existing edge-to-edge layout. */
export const IPAD_STANDALONE_VIEWPORT_SCRIPT = `(function () {
  var n = window.navigator;
  var ipad = /iPad/.test(n.userAgent || "") ||
    (/Macintosh/.test(n.userAgent || "") && n.maxTouchPoints > 1);
  var installed = n.standalone === true ||
    Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if (!ipad || !installed) return;
  function reserveStatusArea() {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    var content = viewport.getAttribute("content") || "";
    var contained = content.replace(/viewport-fit\\s*=\\s*cover/i, "viewport-fit=contain");
    if (contained !== content) viewport.setAttribute("content", contained);
  }
  reserveStatusArea();
  // The router may replace head metadata on soft navigation. Reapply in the
  // mutation microtask, without changing scroll positions or creating a loop.
  if (window.MutationObserver) {
    new window.MutationObserver(reserveStatusArea).observe(document.head, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["content"]
    });
  }
  document.documentElement.setAttribute("data-ipad-standalone-viewport", "contained");
})();`;
