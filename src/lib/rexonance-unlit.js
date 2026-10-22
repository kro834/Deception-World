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
 * short phased slices. Null
 * where the pixels cannot be read (the suit then lights as it always did). */
export function splitLights(source, sx, sy, w, h, document = globalThis.document, options) {
  const job = createSplitLightsJob(source, sx, sy, w, h, document, options);
  if (!job) return null;
  job.step(Infinity);
  return job.commit();
}

// Rows shaded and uploaded a strip at a time (round 4: the nanite kit's
// phased jobs' READ_STRIP, rexonance-suit-extras): the light and mote bytes
// are one strip of this many rows, reused strip to strip, and every upload
// is one strip of one canvas, so no step allocates or uploads a whole layer.
const SPLIT_STRIP = 248;

/** Setup only makes the job's canvases; the work is phased so that no
 * slice holds a whole layer (round 4: setup and commit were 7–9 ms each).
 * Every readback is a native round trip to the GPU (sweep 2, F02): with a
 * GPU-backed source (the scene's driver sheet) each read waits for the GPU
 * to drain, whatever its size, and one read a strip had made the driver's
 * split the preparation's longest phase while the reader scrolled (0.9 s,
 * up to 260 ms a read). So the first step takes the one snapshot (one
 * drawImage of the borrowed source) and reads it back once, whole; the
 * strips are then shaded from that memory, rows to the deadline, and each
 * strip of each output canvas (unlit, lights, motes) is uploaded in a step
 * of its own, straight into its canvas, as the assembly's layer job does.
 * commit() then only publishes; partial pixels never escape this job. A
 * short deadline still advances one phase (or one row), so a busy host
 * cannot starve preparation forever; step(Infinity) without an expired idle
 * deadline runs the whole pass. Native readback/put operations and one row
 * are indivisible: the deadline bounds cooperative work, not those native
 * operations' wall time. The bytes are those of the one-pass split, whatever
 * the slices.
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
    // The requested region's row, in bytes (native ImageData has the same
    // width; lightweight callers/tests may only expose its bytes). A
    // non-finite or empty region cannot be read: null, rather than a NaN
    // cursor that could strand the synchronous compatibility pass forever.
    const rowBytes = Math.floor(w) * 4;
    const height = Math.floor(h);
    if (!Number.isFinite(rowBytes) || rowBytes < 4 || !Number.isFinite(height) || height < 1)
      throw new Error("invalid light separation region");
    const make = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
    scratch = make();
    unlit = make();
    lights = make();
    if (options.motes) motes = make();
    const uc = scratch.getContext("2d", { willReadFrequently: true });
    if (!uc) throw new Error("unavailable light separation context");
    const count = Math.ceil(height / SPLIT_STRIP);
    const targets = motes ? [unlit, lights, motes] : [unlit, lights];
    // Each output's context, taken at its first upload.
    const contexts = targets.map(() => null);
    let read = false;
    // The region's pixels, read back once (turned unlit in place, so they
    // are the unlit canvas's), and the current strip's light and mote bytes.
    let art = null;
    let glow = null;
    let heat = null;
    let view = null; // the current strip's rows of the art
    let strip = 0; // the current strip, its row cursor (a byte) and uploads
    let at = 0;
    let uploaded = 0;
    let done = false;
    let cancelled = false;
    let result = null;
    const release = () => {
      art = glow = heat = view = null;
      unlit.width = unlit.height = lights.width = lights.height = 0;
      if (motes) motes.width = motes.height = 0;
      scratch.width = scratch.height = 0;
    };
    // One phase: the snapshot and its one read-back, rows to the deadline,
    // or one strip of one canvas's upload. True once the last is uploaded.
    const advance = (until, idleDeadline) => {
      if (!read) {
        uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
        art = uc.getImageData(0, 0, w, h);
        const rows = Math.min(SPLIT_STRIP, height);
        glow = uc.createImageData(w, rows);
        if (motes) heat = uc.createImageData(w, rows);
        const short = (image, size) => !(image?.data?.length >= size);
        if (
          short(art, height * rowBytes) ||
          short(glow, rows * rowBytes) ||
          (motes && short(heat, rows * rowBytes))
        )
          throw new Error("invalid light separation pixels");
        // (Its canvas is not needed once the region is in memory.)
        scratch.width = scratch.height = 0;
        read = true;
        return false;
      }
      const top = strip * SPLIT_STRIP;
      const rows = Math.min(SPLIT_STRIP, height - top);
      const length = rows * rowBytes;
      if (at < length) {
        if (!view) {
          view = art.data.subarray(top * rowBytes, top * rowBytes + length);
          // The strip's bytes again, from nothing (the last strip's lights
          // and motes are uploaded).
          if (strip) {
            glow.data.fill(0, 0, length);
            if (heat) heat.data.fill(0, 0, length);
          }
        }
        do {
          const end = Math.min(at + rowBytes, length);
          separate(view, glow.data, heat ? heat.data : null, at, end);
          at = end;
        } while (
          at < length &&
          (until === Infinity || globalThis.performance.now() < until) &&
          (!idleDeadline || idleDeadline.timeRemaining() >= 2)
        );
        return false;
      }
      // The strip's rows, one canvas a step: unlit (the art's own rows),
      // lights, motes.
      let output = contexts[uploaded];
      if (!output) {
        output = contexts[uploaded] = targets[uploaded].getContext("2d");
        if (!output)
          throw new Error(
            uploaded === 0
              ? "unavailable unlit output context"
              : uploaded === 1
                ? "unavailable light overlay context"
                : "unavailable mote layer context",
          );
      }
      if (uploaded === 0) output.putImageData(art, 0, 0, 0, top, w, rows);
      else output.putImageData(uploaded === 1 ? glow : heat, 0, top, 0, 0, w, rows);
      uploaded += 1;
      if (uploaded < targets.length) return false;
      strip += 1;
      at = 0;
      uploaded = 0;
      view = null;
      if (strip < count) return false;
      art = glow = heat = null;
      done = true;
      return true;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || done) return true;
        try {
          let finished;
          do finished = advance(until, idleDeadline);
          while (
            !finished &&
            until === Infinity &&
            (!idleDeadline || idleDeadline.timeRemaining() >= 2)
          );
          return finished;
        } catch {
          cancelled = true;
          release();
          return true;
        }
      },
      commit() {
        if (result) return result;
        if (cancelled || !done) return null;
        result = motes ? { unlit, lights, motes } : { unlit, lights };
        return result;
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

// --- The nanite kit's derived layers (owner, 2026-10-16: 「超大幅な改善で。」) ---
// Shared with the offline loading-driver baker; the pixel algorithm is unchanged.
export function separateDriverPixels(data) {
  separate(data, new Uint8ClampedArray(data.length), null, 0, data.length);
}
// Asset-free pixel jobs with the same contract as createSplitLightsJob: one
// snapshot at setup, row slices (byte-identical whatever their sizes), an
// idempotent commit that publishes only a completed pass, cancel() releasing
// unpublished canvases; no composite operations; null when pixels cannot be
// read.

// The hex micro-relief: a pointy-top hex lattice of `pitch` px between
// centres. `naniteHexEdge` writes the distance (px) from (x, y) to its hex's
// nearest edge and that edge's outward normal into `NANITE_HEX` (one shared
// buffer, so the per-pixel passes allocate nothing).
const NANITE_HEX = new Float64Array(3);
const NANITE_ROOT3 = Math.sqrt(3);
function naniteHexEdge(x, y, pitch) {
  const size = pitch / NANITE_ROOT3;
  const q = ((NANITE_ROOT3 / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs + q + r);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  const dx = x - size * NANITE_ROOT3 * (rq + rr / 2);
  const dy = y - size * 1.5 * rr;
  // The three edge normals of a pointy-top hex: 0°, 60°, 120°.
  const p0 = dx;
  const p1 = 0.5 * dx + (NANITE_ROOT3 / 2) * dy;
  const p2 = -0.5 * dx + (NANITE_ROOT3 / 2) * dy;
  let m = p0;
  let nx = 1;
  let ny = 0;
  if (Math.abs(p1) > Math.abs(m)) {
    m = p1;
    nx = 0.5;
    ny = NANITE_ROOT3 / 2;
  }
  if (Math.abs(p2) > Math.abs(m)) {
    m = p2;
    nx = -0.5;
    ny = NANITE_ROOT3 / 2;
  }
  const sign = m < 0 ? -1 : 1;
  NANITE_HEX[0] = pitch / 2 - Math.abs(m);
  NANITE_HEX[1] = nx * sign;
  NANITE_HEX[2] = ny * sign;
}

const naniteUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Pure: the hex micro-relief's height at (x, y) (px; sample a pixel at its
 * centre, x + 0.5): 1 on a hex's top, 0 in the 0.8 px groove between hexes
 * (a half-pixel ramp at the groove's walls). Pointy-top lattice, `pitch` px
 * between centres. */
export function naniteHexHeight(x, y, pitch = 4.6) {
  naniteHexEdge(x, y, pitch);
  return naniteUnit(2 * NANITE_HEX[0] - 0.3);
}

/** Pure: the hex bevel's light at (x, y): +1 on the 0.8 px rim of a hex top
 * along its upper-left edges (lit), -1 along its lower-right edges, 0 on the
 * flat top and in the groove (half-pixel ramps). */
export function naniteHexLight(x, y, pitch = 4.6) {
  naniteHexEdge(x, y, pitch);
  const edge = NANITE_HEX[0];
  const band = naniteUnit(2 * edge - 0.3) - naniteUnit(2 * edge - 1.9);
  if (!band) return 0;
  return NANITE_HEX[1] + NANITE_HEX[2] < 0 ? band : -band;
}

// The shared job: `reads` are [source, sx, sy] regions of w x h snapshotted
// once; `names` the output canvases; `shade(row, inputs, outputs)` fills one
// row of every output from the inputs.
function createNanitePixelJob(document, w, h, reads, names, shade) {
  const owned = [];
  try {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0)
      throw new Error("invalid nanite layer size");
    const make = () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      owned.push(canvas);
      return canvas;
    };
    const scratch = make();
    const outputs = names.map(make);
    const uc = scratch.getContext("2d", { willReadFrequently: true });
    if (!uc) throw new Error("unavailable nanite layer context");
    let inputs = reads.map(([source, sx, sy], index) => {
      if (index) uc.clearRect(0, 0, w, h);
      uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
      return uc.getImageData(0, 0, w, h).data;
    });
    let images = outputs.map(() => uc.createImageData(w, h));
    let bytes = images.map((image) => image.data);
    for (const data of [...inputs, ...bytes])
      if (!data || data.length < w * h * 4) throw new Error("invalid nanite layer pixels");
    let row = 0;
    let cancelled = false;
    let result = null;
    const release = () => {
      inputs = images = bytes = null;
      for (const canvas of owned) canvas.width = canvas.height = 0;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || result || row >= h) return true;
        try {
          do {
            shade(row, inputs, bytes);
            row += 1;
            if (row >= h) return true;
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
        if (cancelled || row < h) return null;
        try {
          const published = {};
          outputs.forEach((canvas, index) => {
            const context = canvas.getContext("2d");
            if (!context) throw new Error("unavailable nanite output context");
            context.putImageData(images[index], 0, 0);
            published[names[index]] = canvas;
          });
          scratch.width = scratch.height = 0;
          inputs = images = bytes = null;
          result = published;
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
    for (const canvas of owned) canvas.width = canvas.height = 0;
    return null;
  }
}

const naniteByte = (value) => (value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value));

/** The raw nanite metal (armour A3): a region of the (unlit) art as
 * gunmetal with the art's own values, the 4.6 px hex micro-relief, a lit
 * upper-left hex bevel and the silhouette's rim (the alpha gradient: its
 * lower-right edges catch the ice rim light, its upper-left edges darken),
 * and the art's exact alpha. Per pixel with alpha A > 0: L the luminance;
 * v = (26 + 150L)(0.74 + 0.26 hgt) + 34 lit + 70 rim; rgb = v (0.92, 0.97,
 * 1.06) + (0, 4, 10) hgt. `options.silhouette`: a second canvas, rgb
 * (6, 10, 18) with the alpha A (contact shadows and walls).
 * Result: { metal, silhouette? }, each w x h. */
export function createNaniteMetalJob(
  source,
  sx,
  sy,
  w,
  h,
  document = globalThis.document,
  options = {},
) {
  const pitch = options.pitch ?? 4.6;
  const silhouette = Boolean(options.silhouette);
  const names = silhouette ? ["metal", "silhouette"] : ["metal"];
  return createNanitePixelJob(document, w, h, [[source, sx, sy]], names, (y, [a], [m, s]) =>
    naniteMetalRow(y, w, h, a, m, s, pitch),
  );
}

/** One row `y` of createNaniteMetalJob's formula, from the region's bytes
 * `a` (w x h, RGBA) into `m` (and the silhouette's `s`, or null). Shared
 * with the call's own phased job (round 3, rexonance-suit-extras), so the
 * formula lives here alone. */
export function naniteMetalRow(y, w, h, a, m, s, pitch = 4.6) {
  const stride = w * 4;
  for (let x = 0, i = y * stride; x < w; x += 1, i += 4) {
    const alpha = a[i + 3];
    if (!alpha) continue;
    const L = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
    const hgt = naniteHexHeight(x + 0.5, y + 0.5, pitch);
    const lit = naniteHexLight(x + 0.5, y + 0.5, pitch);
    const right = x + 1 < w ? a[i + 7] : 0;
    const left = x > 0 ? a[i - 1] : 0;
    const below = y + 1 < h ? a[i + stride + 3] : 0;
    const above = y > 0 ? a[i - stride + 3] : 0;
    const rim = Math.max(-1, Math.min(1, ((-(right - left) - (below - above)) / 255) * 0.9));
    const v = (26 + 150 * L) * (0.74 + 0.26 * hgt) + 34 * lit + 70 * rim;
    m[i] = naniteByte(v * 0.92);
    m[i + 1] = naniteByte(v * 0.97 + 4 * hgt);
    m[i + 2] = naniteByte(v * 1.06 + 10 * hgt);
    m[i + 3] = alpha;
    if (s) {
      s[i] = 6;
      s[i + 1] = 10;
      s[i + 2] = 18;
      s[i + 3] = alpha;
    }
  }
}

/** The guideway's derived layers (gold G1/G5), from the decoded guide sheet
 * (REXONANCE_NANITE_GUIDE, atlas space), each the guide's size. L the face's
 * luminance / 255. `holo`: the ice hologram of the conduit, rgb
 * mix((40, 150, 200), (226, 250, 255), L), alpha A (0.35 + 0.65 L), every
 * third row (y mod 3 = 2) at 22% — scan lines. `options.walls`: the rails'
 * walls for the parallax, rgb (92, 60, 22), alpha A clamp((L - 0.30) / 0.25)
 * where A > 160, else 0. Result: { holo, walls? }. */
export function createNaniteGuideJob(guide, document = globalThis.document, options = {}) {
  const w = guide ? (guide.naturalWidth ?? guide.width) : NaN;
  const h = guide ? (guide.naturalHeight ?? guide.height) : NaN;
  const names = options.walls ? ["holo", "walls"] : ["holo"];
  return createNanitePixelJob(document, w, h, [[guide, 0, 0]], names, (y, [a], [o, wl]) =>
    naniteGuideRow(y, w, a, o, wl),
  );
}

/** One row `y` of createNaniteGuideJob's formula, from the guide's bytes
 * `a` (w wide) into the hologram `o` (and the walls' `wl`, or null). Shared
 * with the call's own phased job (round 3). */
export function naniteGuideRow(y, w, a, o, wl) {
  const scan = y % 3 === 2 ? 0.22 : 1;
  for (let x = 0, i = y * w * 4; x < w; x += 1, i += 4) {
    const alpha = a[i + 3];
    if (!alpha) continue;
    const L = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
    o[i] = naniteByte(40 + 186 * L);
    o[i + 1] = naniteByte(150 + 100 * L);
    o[i + 2] = naniteByte(200 + 55 * L);
    o[i + 3] = naniteByte(alpha * (0.35 + 0.65 * L) * scan);
    if (wl && alpha > 160) {
      const k = naniteUnit((L - 0.3) / 0.25);
      if (k > 0) {
        wl[i] = 92;
        wl[i + 1] = 60;
        wl[i + 2] = 22;
        wl[i + 3] = naniteByte(alpha * k);
      }
    }
  }
}

// Molten gold, white-hot to amber: the ramp's stops (t, r, g, b).
const NANITE_MOLTEN = [0, 120, 52, 10, 0.4, 236, 140, 40, 0.7, 255, 210, 120, 1, 255, 250, 236];

/** Molten gold (gold G6/G7): a region of the gold art, its luminance L
 * mapped by t = clamp(0.25 + 0.85 L) through the ramp (120, 52, 10) →
 * (236, 140, 40) at .4 → (255, 210, 120) at .7 → (255, 250, 236); alpha the
 * source's, times `options.mask`'s alpha / 255 at the same region when
 * given. Result: { molten }, w x h. */
export function createNaniteMoltenJob(
  source,
  sx,
  sy,
  w,
  h,
  document = globalThis.document,
  options = {},
) {
  const reads = options.mask ? [[source, sx, sy], [options.mask, sx, sy]] : [[source, sx, sy]];
  return createNanitePixelJob(document, w, h, reads, ["molten"], (y, [a, mask], [o]) =>
    naniteMoltenRow(y, w, a, mask ?? null, o, 0),
  );
}

/** The molten ramp's colour at `t` (0..1, clamped) into out[i..i + 2]. */
export function naniteMoltenRamp(t, out, i) {
  const v = naniteUnit(t);
  let k = 4;
  while (k < 12 && v > NANITE_MOLTEN[k]) k += 4;
  const u = (v - NANITE_MOLTEN[k - 4]) / (NANITE_MOLTEN[k] - NANITE_MOLTEN[k - 4]);
  for (let c = 1; c < 4; c += 1)
    out[i + c - 1] = naniteByte(
      NANITE_MOLTEN[k - 4 + c] + (NANITE_MOLTEN[k + c] - NANITE_MOLTEN[k - 4 + c]) * u,
    );
}

/** One row `y` of createNaniteMoltenJob's formula (t = clamp(0.25 + 0.85
 * L), alpha the source's times the mask's), its ramp shifted `shift`
 * toward white (0: the molten gold itself). Shared with the call's own
 * phased job (round 3, review 9: its white-hot head is the shift 0.3). */
export function naniteMoltenRow(y, w, a, mask, o, shift) {
  for (let x = 0, i = y * w * 4; x < w; x += 1, i += 4) {
    const alpha = a[i + 3];
    if (!alpha) continue;
    const L = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
    naniteMoltenRamp(naniteUnit(0.25 + 0.85 * L) + shift, o, i);
    o[i + 3] = mask ? naniteByte((alpha * mask[i + 3]) / 255) : alpha;
  }
}
