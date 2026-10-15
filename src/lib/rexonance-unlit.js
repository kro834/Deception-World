/** The suit's lights, held back until the whole suit is on (owner,
 * 2026-10-11): the armour's ice-cyan and pink light (the crystals, the
 * ribbons, the reactor) stands monochrome while it assembles, and lights
 * once the suit is complete. `splitLights(source, sx, sy, w, h)` reads a
 * region of a decoded picture and returns two canvases of its size: `unlit`
 * (the art with its lights turned to a cold, dim monochrome; gold, black
 * plates and everything else untouched) and `lights` (only the lit pixels,
 * the rest transparent), to be drawn back over the unlit art as it lights.
 * One pixel pass. The synchronous API remains for suit-plan consumers;
 * RESONANCE preparation uses createSplitLightsJob to run the same pass in
 * short row slices. Null
 * where the pixels cannot be read (the suit then lights as it always did). */
export function splitLights(source, sx, sy, w, h, document = globalThis.document, options) {
  const job = createSplitLightsJob(source, sx, sy, w, h, document, options);
  if (!job) return null;
  job.step(Infinity);
  return job.commit();
}

/** Setup borrows the decoded source and takes one snapshot. A caller can
 * schedule setup, row slices, and commit separately; partial pixels never
 * escape this job. A short deadline still advances one row, so a busy host
 * cannot starve preparation forever. Native readback/put operations and one
 * row are indivisible: the deadline bounds cooperative work, not those
 * native operations' wall time.
 *
 * `options.motes` (the call's nanite engine; owner, 2026-10-15): a third
 * canvas, `motes`, from the same pass — the art in nanite light (each pixel
 * pushed to pink or ice, the darker the more) with the art's own alpha, so a
 * tile streaming in as a mote keeps the artwork's edge. */
export function createSplitLightsJob(
  source,
  sx,
  sy,
  w,
  h,
  document = globalThis.document,
  options = {},
) {
  let unlit;
  let lights;
  let motes;
  let scratch;
  try {
    const make = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
    scratch = make();
    unlit = make();
    lights = make();
    if (options.motes) motes = make();
    const uc = scratch.getContext("2d", { willReadFrequently: true });
    if (!uc) throw new Error("unavailable light separation context");
    uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
    let art = uc.getImageData(0, 0, w, h);
    let glow = uc.createImageData(w, h);
    let heat = motes ? uc.createImageData(w, h) : null;
    let a = art.data;
    let g = glow.data;
    let m = heat ? heat.data : null;
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
      art = glow = heat = a = g = m = null;
      unlit.width = unlit.height = lights.width = lights.height = 0;
      if (motes) motes.width = motes.height = 0;
      scratch.width = scratch.height = 0;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || result || at >= a.length) return true;
        try {
          do {
            const end = Math.min(at + rowBytes, a.length);
            separate(a, g, m, at, end);
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
          if (motes) {
            const mc = motes.getContext("2d");
            if (!mc) throw new Error("unavailable mote layer context");
            uc.clearRect(0, 0, w, h);
            uc.putImageData(heat, 0, 0);
            mc.drawImage(scratch, 0, 0);
          }
          scratch.width = scratch.height = 0;
          result = motes ? { unlit, lights, motes } : { unlit, lights };
          art = glow = heat = a = g = m = null;
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
    if (unlit) unlit.width = unlit.height = 0;
    if (lights) lights.width = lights.height = 0;
    if (motes) motes.width = motes.height = 0;
    if (scratch) scratch.width = scratch.height = 0;
    return null;
  }
}

// The motes' nanite light: ice for most of the art (the black plates and
// the gold trims too — the gold forms later, from its own nanites), pink
// for its magenta and pink pixels.
const ICE = [140, 239, 255];
const PINK = [255, 143, 216];

// Keep the original per-pixel arithmetic and rounding order: splitting rows
// only changes when pixels are visited, never their resulting bytes. `m`
// (the mote bytes) is filled from the untouched art, or null.
function separate(a, g, m, from, to) {
  for (let i = from; i < to; i += 4) {
    if (!a[i + 3]) continue;
    const r = a[i];
    const gr = a[i + 1];
    const b = a[i + 2];
    const max = Math.max(r, gr, b);
    const min = Math.min(r, gr, b);
    const chroma = max - min;
    let hue = -1;
    if (chroma) {
      if (max === r) hue = ((gr - b) / chroma + 6) % 6;
      else if (max === gr) hue = (b - r) / chroma + 2;
      else hue = (r - gr) / chroma + 4;
      hue *= 60;
    }
    if (m) {
      // The pixel in nanite light, the darker the more (a black plate's
      // mote is a cold spark, a crystal's keeps its own light), a touch
      // brighter than the art; the art's alpha.
      const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      const tint = chroma >= 0.25 * max && (hue >= 285 || hue < 12) ? PINK : ICE;
      const lift = 0.56 + 0.26 * (1 - luma / 255);
      m[i] = Math.min(255, Math.round((r + (tint[0] - r) * lift) * 1.12));
      m[i + 1] = Math.min(255, Math.round((gr + (tint[1] - gr) * lift) * 1.12));
      m[i + 2] = Math.min(255, Math.round((b + (tint[2] - b) * lift) * 1.12));
      m[i + 3] = a[i + 3];
    }
    if (max < 70 || chroma < 0.3 * max) continue;
    // Hue: gold and bronze (red-orange to yellow) keep their colour.
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
