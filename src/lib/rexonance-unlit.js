/** The suit's lights, held back until the whole suit is on (owner,
 * 2026-10-11): the armour's ice-cyan and pink light (the crystals, the
 * ribbons, the reactor) stands monochrome while it assembles, and lights
 * once the suit is complete. `splitLights(source, sx, sy, w, h)` reads a
 * region of a decoded picture and returns two canvases of its size: `unlit`
 * (the art with its lights turned to a cold, dim monochrome; gold, black
 * plates and everything else untouched) and `lights` (only the lit pixels,
 * the rest transparent), to be drawn back over the unlit art as it lights.
 * One pixel pass. The synchronous API remains for ZENITH; preparation can
 * run the same pass in short row slices with createSplitLightsJob. Null
 * where the pixels cannot be read (the suit then lights as it always did). */
export function splitLights(source, sx, sy, w, h, document = globalThis.document) {
  const job = createSplitLightsJob(source, sx, sy, w, h, document);
  if (!job) return null;
  job.step(Infinity);
  return job.commit();
}

/** Setup borrows the decoded source and takes one snapshot. A caller can
 * schedule setup, row slices, and commit separately; partial pixels never
 * escape this job. A short deadline still advances one row, so a busy host
 * cannot starve preparation forever. Native readback/put operations and one
 * row are indivisible: the deadline bounds cooperative work, not those
 * native operations' wall time. */
export function createSplitLightsJob(source, sx, sy, w, h, document = globalThis.document) {
  let unlit;
  let lights;
  let scratch;
  try {
    const make = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
    scratch = make();
    unlit = make();
    lights = make();
    const uc = scratch.getContext("2d", { willReadFrequently: true });
    if (!uc) throw new Error("unavailable light separation context");
    uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
    let art = uc.getImageData(0, 0, w, h);
    let glow = uc.createImageData(w, h);
    let a = art.data;
    let g = glow.data;
    // Native ImageData has width. Lightweight callers/tests may only expose
    // its bytes, so use the requested region rather than creating a NaN
    // cursor that could strand the synchronous compatibility pass forever.
    const widthInBytes = Math.floor(art.width ?? w) * 4;
    if (!Number.isFinite(widthInBytes)) throw new Error("invalid light separation row width");
    const rowBytes = Math.max(4, widthInBytes);
    let at = 0;
    let cancelled = false;
    let result = null;
    const release = () => {
      art = glow = a = g = null;
      unlit.width = lights.width = 0;
      scratch.width = scratch.height = 0;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || result || at >= a.length) return true;
        try {
          do {
            const end = Math.min(at + rowBytes, a.length);
            separate(a, g, at, end);
            at = end;
            if (at >= a.length) return true;
          } while (
            (until === Infinity || globalThis.performance.now() < until) &&
            (!idleDeadline || idleDeadline.timeRemaining() >= 2)
          );
          return false;
        } catch {
          cancelled = true;
          release();
          return true;
        }
      },
      commit() {
        if (result) return result;
        if (cancelled || at < a.length) return null;
        try {
          uc.putImageData(art, 0, 0);
          const output = unlit.getContext("2d");
          if (!output) throw new Error("unavailable unlit output context");
          output.drawImage(scratch, 0, 0);
          const lc = lights.getContext("2d");
          if (!lc) throw new Error("unavailable light overlay context");
          uc.clearRect(0, 0, w, h);
          uc.putImageData(glow, 0, 0);
          lc.drawImage(scratch, 0, 0);
          scratch.width = scratch.height = 0;
          result = { unlit, lights };
          art = glow = a = g = null;
          return result;
        } catch {
          cancelled = true;
          release();
          return null;
        }
      },
      cancel() {
        if (cancelled || result) return;
        cancelled = true;
        release();
      },
    };
  } catch {
    // Releasing owned canvases never closes a borrowed image or bitmap.
    if (unlit) unlit.width = 0;
    if (lights) lights.width = 0;
    if (scratch) scratch.width = scratch.height = 0;
    return null;
  }
}

// Keep the original per-pixel arithmetic and rounding order: splitting rows
// only changes when pixels are visited, never their resulting bytes.
function separate(a, g, from, to) {
  for (let i = from; i < to; i += 4) {
    if (!a[i + 3]) continue;
    const r = a[i];
    const gr = a[i + 1];
    const b = a[i + 2];
    const max = Math.max(r, gr, b);
    const min = Math.min(r, gr, b);
    const chroma = max - min;
    if (max < 70 || chroma < 0.3 * max) continue;
    // Hue: gold and bronze (red-orange to yellow) keep their colour.
    let hue;
    if (max === r) hue = ((gr - b) / chroma + 6) % 6;
    else if (max === gr) hue = (b - r) / chroma + 2;
    else hue = (r - gr) / chroma + 4;
    hue *= 60;
    if (hue >= 12 && hue < 70) continue;
    // A lit pixel: cyan, blue, violet or pink. Its share of the light.
    const k = Math.min(1, (chroma / max - 0.3) / 0.25) * Math.min(1, (max - 70) / 60);
    g[i] = r;
    g[i + 1] = gr;
    g[i + 2] = b;
    // Opaque: drawn back over the unlit art it restores the art exactly.
    g[i + 3] = k > 0 ? a[i + 3] : 0;
    // Unlit: a cold monochrome, dimmed.
    const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    const grey = luma * 0.62;
    a[i] = Math.round(r + (grey * 0.92 - r) * k);
    a[i + 1] = Math.round(gr + (grey * 0.97 - gr) * k);
    a[i + 2] = Math.round(b + (grey * 1.1 - b) * k);
  }
}
