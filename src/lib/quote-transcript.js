const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function transcriptGraphemes(text) {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

/** Finite, deterministic pacing. Pauses belong to the facsimile, not the record. */
export function transcriptTimeline(glyphs, order = 0) {
  let time = 0;
  const times = glyphs.map((glyph, index) => {
    time += 30 + ((index + order) % 4) * 6;
    if (/[。！？?]/u.test(glyph)) time += 180;
    else if (/[、，,…]/u.test(glyph)) time += 92;
    return time;
  });
  const scale = Math.min(1, 3600 / Math.max(1, time));
  return times.map((deadline) => Math.round(deadline * scale));
}

/** One observer, RAF and policy subscription for the whole quote rail.
 * Leaving view pauses a record; completion is permanent until manual replay. */
export function mountQuoteTranscript(root, { disabled = false } = {}) {
  if (!root) return () => {};
  const doc = root.ownerDocument;
  const env = doc.defaultView;
  const nodes = Array.from(root.querySelectorAll("[data-quote-transcript]"));
  const entries = nodes.map((node, index) => {
    const glyphs = Array.from(node.querySelectorAll(".wa-transcript-glyph"));
    return {
      node,
      glyphs,
      times: transcriptTimeline(
        glyphs.map((glyph) => glyph.textContent ?? ""),
        index,
      ),
      delay: (index % 3) * 180,
      elapsed: 0,
      written: 0,
      visible: false,
      done: false,
    };
  });
  const plain = (entry) => {
    entry.node.removeAttribute("data-transcript-phase");
    entry.node.removeAttribute("data-transcript-fault");
    entry.glyphs.forEach((glyph) => glyph.classList.remove("is-written", "is-cursor"));
  };
  const writing = (entry) => {
    entry.node.setAttribute("data-transcript-phase", "writing");
    entry.glyphs.slice(0, entry.written).forEach((glyph) => glyph.classList.add("is-written"));
  };
  entries.forEach(plain);
  if (disabled || !env?.IntersectionObserver || !env.requestAnimationFrame || !env.matchMedia) {
    return () => {};
  }

  const motion = env.matchMedia("(prefers-reduced-motion: reduce)");
  const colors = env.matchMedia("(forced-colors: active)");
  let stopped = false;
  let frame = 0;
  let last = null;
  const policyAllows = () =>
    !motion.matches && !colors.matches && doc.documentElement.dataset.worldEffects !== "economy";
  const overlaysOpen = () =>
    ["data-side-menu-open", "data-dialog-open", "data-loading"].some((attribute) =>
      doc.documentElement.hasAttribute(attribute),
    );
  const hasWork = () =>
    !stopped &&
    !doc.hidden &&
    policyAllows() &&
    !overlaysOpen() &&
    entries.some((entry) => entry.visible && !entry.done);
  const cancelFrame = () => {
    if (frame) env.cancelAnimationFrame(frame);
    frame = 0;
    last = null;
  };
  const schedule = () => {
    if (!frame && hasWork()) frame = env.requestAnimationFrame(tick);
  };
  const tick = (now) => {
    frame = 0;
    if (!hasWork()) {
      last = null;
      return;
    }
    const delta = last === null ? 0 : Math.min(80, Math.max(0, now - last));
    last = now;
    for (const entry of entries) {
      if (!entry.visible || entry.done) continue;
      entry.elapsed += delta;
      if (entry.elapsed < entry.delay) continue;
      const elapsed = entry.elapsed - entry.delay;
      if (!entry.node.hasAttribute("data-transcript-phase")) {
        writing(entry);
      }
      const end = (entry.times.at(-1) ?? 0) + 240;
      const faultAt = Math.min(920, end * 0.34);
      const fault = elapsed >= faultAt && elapsed < faultAt + 180;
      // A single brief offset and interrupted run, never a repeating flash.
      if (fault) entry.node.setAttribute("data-transcript-fault", "interference");
      else entry.node.removeAttribute("data-transcript-fault");
      if (!fault) {
        if (entry.written) entry.glyphs[entry.written - 1].classList.remove("is-cursor");
        while (entry.written < entry.times.length && entry.times[entry.written] <= elapsed) {
          entry.glyphs[entry.written].classList.add("is-written");
          entry.written += 1;
        }
        if (entry.written && entry.written < entry.glyphs.length) {
          entry.glyphs[entry.written - 1].classList.add("is-cursor");
        }
      }
      if (elapsed >= end) {
        entry.done = true;
        plain(entry);
      }
    }
    schedule();
  };

  const observer = new env.IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const entry = entries.find((item) => item.node === change.target);
        if (entry) {
          entry.visible = change.isIntersecting && change.intersectionRatio >= 0.15;
          // Offscreen records revert to readable source, retaining their clock.
          if (!entry.visible) plain(entry);
          else if (entry.elapsed > 0 && !entry.done && policyAllows() && !overlaysOpen()) {
            writing(entry);
          }
        }
      }
      if (!hasWork()) cancelFrame();
      else schedule();
    },
    { root: null, threshold: [0, 0.15, 0.5] },
  );
  entries.forEach((entry) => observer.observe(entry.node));

  const onPolicy = () => {
    if (!policyAllows()) {
      cancelFrame();
      entries.forEach((entry) => {
        if (entry.elapsed > 0) entry.done = true;
        plain(entry);
      });
    } else if (overlaysOpen()) {
      cancelFrame();
      entries.forEach(plain);
    } else schedule();
  };
  const onVisibility = () => {
    cancelFrame();
    if (doc.hidden) entries.forEach((entry) => entry.node.removeAttribute("data-transcript-fault"));
    else schedule();
  };
  const onSelection = () => {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed || !root.contains(selection.anchorNode)) return;
    entries.forEach((entry) => {
      entry.done = true;
      plain(entry);
    });
    cancelFrame();
  };
  const onFind = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      entries.forEach((entry) => {
        entry.done = true;
        plain(entry);
      });
      cancelFrame();
    }
  };
  const policyObserver = env.MutationObserver ? new env.MutationObserver(onPolicy) : null;
  policyObserver?.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: [
      "data-world-effects",
      "data-side-menu-open",
      "data-dialog-open",
      "data-loading",
    ],
  });
  motion.addEventListener("change", onPolicy);
  colors.addEventListener("change", onPolicy);
  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("selectionchange", onSelection);
  doc.addEventListener("keydown", onFind);

  return () => {
    stopped = true;
    cancelFrame();
    observer.disconnect();
    policyObserver?.disconnect();
    motion.removeEventListener("change", onPolicy);
    colors.removeEventListener("change", onPolicy);
    doc.removeEventListener("visibilitychange", onVisibility);
    doc.removeEventListener("selectionchange", onSelection);
    doc.removeEventListener("keydown", onFind);
    entries.forEach(plain);
  };
}
