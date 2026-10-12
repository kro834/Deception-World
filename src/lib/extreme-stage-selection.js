export const EXTREME_STAGE_CUT_GAP_MS = 1100;
export const EXTREME_STAGE_IMAGE_TIMEOUT_MS = 8000;

const LOAD_ERROR = "画像の読み込みに失敗しました。もう一度お試しください。";
const TIMEOUT_ERROR = "画像の読み込みに時間がかかっています。もう一度お試しください。";

/** Prepare only the requested form, then publish its image and copy together.
 * Latest intent wins; returning to the displayed form cancels the pending cut.
 * Keep the bright/dark cuts at least 1100ms apart, even with a warm cache. */
export function createExtremeStageSelection({
  initialStage = "middle",
  resolveImage,
  onDisplay,
  onPending,
  onError,
  environment = window,
}) {
  let displayed = initialStage;
  let lastCut = Number.NEGATIVE_INFINITY;
  let pending = false;
  let disposed = false;
  let current = null;
  const now = () => environment.performance?.now?.() ?? Date.now();
  const setPending = (value) => {
    if (disposed || value === pending) return;
    pending = value;
    onPending(value);
  };
  const release = (job, cancelRequest) => {
    environment.clearTimeout(job.deadline);
    environment.clearTimeout(job.cutTimer);
    if (job.image) {
      job.image.onload = null;
      job.image.onerror = null;
      if (cancelRequest) job.image.removeAttribute("src");
      job.image = null;
    }
  };
  const cancel = () => {
    const job = current;
    current = null;
    if (job) release(job, true);
  };
  const fail = (job, message = LOAD_ERROR) => {
    if (disposed || current !== job) return;
    cancel();
    setPending(false);
    if (!disposed) onError(message);
  };
  const commit = (job) => {
    if (disposed || current !== job) return;
    current = null;
    release(job, false);
    displayed = job.stage;
    lastCut = now();
    onDisplay(displayed);
    setPending(false);
  };
  const ready = (job) => {
    if (disposed || current !== job || job.decoded) return;
    if (!(job.image.naturalWidth > 0)) {
      fail(job);
      return;
    }
    job.decoded = true;
    // A decoded off-DOM Image is no longer needed: the visible image uses
    // the same URL/cache. Do not retain it through the remaining cut delay.
    release(job, false);
    const wait = lastCut + EXTREME_STAGE_CUT_GAP_MS - now();
    if (wait > 0) job.cutTimer = environment.setTimeout(() => commit(job), wait);
    else commit(job);
  };

  return {
    select(stage) {
      if (disposed || current?.stage === stage) return;
      cancel();
      onError("");
      if (disposed) return;
      if (stage === displayed) {
        setPending(false);
        return;
      }
      const job = { stage, image: null, deadline: 0, cutTimer: 0, decoded: false };
      current = job;
      setPending(true);
      if (disposed || current !== job) return;
      try {
        const source = resolveImage(stage);
        if (typeof source !== "string" || !source) {
          fail(job);
          return;
        }
        const image = new environment.Image();
        job.image = image;
        image.decoding = "async";
        image.fetchPriority = "high";
        image.onerror = () => fail(job);
        if (typeof image.decode !== "function") image.onload = () => ready(job);
        job.deadline = environment.setTimeout(
          () => fail(job, TIMEOUT_ERROR),
          EXTREME_STAGE_IMAGE_TIMEOUT_MS,
        );
        image.src = source;
        if (typeof image.decode === "function") {
          void Promise.resolve(image.decode()).then(
            () => ready(job),
            () => fail(job),
          );
        }
      } catch {
        fail(job);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
    },
  };
}
