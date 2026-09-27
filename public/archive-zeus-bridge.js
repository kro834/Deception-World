/* Zeus bridge. The form archive runs in a sandboxed frame the page cannot
   read, so the page's floating Zeus button could not see its titles and sat
   on them. The archive reports where its own words and fixed controls are,
   and the button keeps off them as it does on every other page
   (src/components/zeus-button.tsx reads "deception-world:frame-avoid").

   Only boxes inside the frame's viewport are sent: once scrolling settles,
   on resize, after a tap changes the record, and when the page asks. The
   selectors mirror the button's own: titles and control labels always,
   display figures from 24px, and any text once the archive is scrolled to
   its end (nothing more scrolls out from under the button there). */
(() => {
  if (window.parent === window) return;

  const WORDS = 'h1, h2, h3, h4, [role="heading"], a[href], button, [role="tab"], summary, label';
  const DISPLAY = "strong, b";
  const DISPLAY_MIN_PX = 24;
  const END = "p, li, dt, dd, small, span, em, q, blockquote, figcaption, time";
  // Controls that never scroll away: the phone dock and anything in an open
  // sheet or dialog. The button never rests on these, even partly.
  const CONTROLS = '.mobile-dock button, dialog[open] button, [aria-modal="true"] button';
  const MAX_BOXES = 480;

  let timer = 0;
  let pendingReason = "load";

  const box = (rect) => [
    Math.round(rect.left * 10) / 10,
    Math.round(rect.top * 10) / 10,
    Math.round(rect.right * 10) / 10,
    Math.round(rect.bottom * 10) / 10,
  ];
  const inView = (rect, width, height) =>
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < width &&
    rect.top < height;
  const shown = (element) => {
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.opacity !== "0";
  };

  const report = () => {
    timer = 0;
    const reason = pendingReason;
    pendingReason = "change";
    const width = window.innerWidth;
    const height = window.innerHeight;
    const words = [];
    const controls = [];
    const walked = new Set();
    const range = document.createRange();
    const collect = (selector, accept) => {
      for (const element of document.querySelectorAll(selector)) {
        if (words.length >= MAX_BOXES) return;
        if (!inView(element.getBoundingClientRect(), width, height)) continue;
        // A title inside a card link is walked once, with the link.
        if (walked.has(element) || element.parentElement?.closest(selector)) continue;
        if (!shown(element) || (accept && !accept(element))) continue;
        walked.add(element);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.nodeValue?.trim()) continue;
          // Words kept for screen readers only overflow a clipped 1px box.
          const holder = node.parentElement?.getBoundingClientRect();
          if (holder && (holder.width < 2 || holder.height < 2)) continue;
          range.selectNodeContents(node);
          for (const rect of Array.from(range.getClientRects())) {
            if (words.length < MAX_BOXES && inView(rect, width, height)) words.push(box(rect));
          }
        }
      }
    };
    collect(WORDS);
    collect(
      DISPLAY,
      (element) => Number.parseFloat(window.getComputedStyle(element).fontSize) >= DISPLAY_MIN_PX,
    );
    const scroller = document.scrollingElement ?? document.documentElement;
    if (scroller.scrollTop + height >= scroller.scrollHeight - 2) collect(END);
    for (const control of document.querySelectorAll(CONTROLS)) {
      const rect = control.getBoundingClientRect();
      if (controls.length < MAX_BOXES && inView(rect, width, height) && shown(control)) {
        controls.push(box(rect));
      }
    }
    window.parent.postMessage(
      { type: "deception-world:frame-avoid", reason, words, controls },
      "*",
    );
  };

  const schedule = (reason, delay) => {
    // A scroll outranks a tap or a resize: it lets words count again.
    if (reason === "scroll" || pendingReason !== "scroll") pendingReason = reason;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(report, delay);
  };

  window.addEventListener("scroll", () => schedule("scroll", 90), { capture: true, passive: true });
  window.addEventListener("resize", () => schedule("resize", 120), { passive: true });
  window.addEventListener("click", () => schedule("change", 260), { capture: true, passive: true });
  window.addEventListener("message", (event) => {
    if (
      event.source === window.parent &&
      event.data?.type === "deception-world:frame-avoid-request"
    ) {
      schedule("change", 0);
    }
  });
  if (document.readyState === "complete") schedule("load", 300);
  else window.addEventListener("load", () => schedule("load", 300), { once: true });
})();
