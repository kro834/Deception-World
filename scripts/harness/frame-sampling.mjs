// Self-contained so Playwright can serialize it directly into page.evaluate.
// The observation window starts at the first rAF; the wall deadline includes
// startup delay and never extends when rendering is stalled or suspended.
export async function sampleFrames() {
  return new Promise((resolve) => {
    const started = performance.now();
    const intervals = [];
    let firstTimestamp;
    let previousTimestamp;
    let firstFrameDelayMs = null;
    let callbackCount = 0;
    let pendingFrame;
    let timer;
    let finished = false;

    function finish(completionReason) {
      if (finished) return;
      finished = true;
      if (pendingFrame != null) cancelAnimationFrame(pendingFrame);
      clearTimeout(timer);
      const sorted = intervals.sort((a, b) => a - b);
      resolve({
        count: sorted.length,
        meanMs: sorted.length
          ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
          : null,
        p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
        maxMs: sorted.at(-1) ?? null,
        callbackCount,
        firstFrameDelayMs,
        elapsedMs: performance.now() - started,
        completionReason,
        visibilityState: document.visibilityState,
      });
    }

    function frame(timestamp) {
      pendingFrame = undefined;
      if (finished) return;
      callbackCount++;
      if (firstTimestamp === undefined) {
        firstTimestamp = timestamp;
        firstFrameDelayMs = performance.now() - started;
      }
      // Timers can be queued behind rendering work; never let a late rAF turn
      // an expired wall deadline into a successful observation window.
      if (performance.now() - started >= 3500) {
        finish("timeout");
        return;
      }
      if (previousTimestamp !== undefined) intervals.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (timestamp - firstTimestamp >= 1500) finish("window-complete");
      else pendingFrame = requestAnimationFrame(frame);
    }

    timer = setTimeout(() => finish("timeout"), 3500);
    pendingFrame = requestAnimationFrame(frame);
  });
}
