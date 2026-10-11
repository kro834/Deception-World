/** The suit's lights, held back until the whole suit is on (owner,
 * 2026-10-11): the armour's ice-cyan and pink light (the crystals, the
 * ribbons, the reactor) stands monochrome while it assembles, and lights
 * once the suit is complete. `splitLights(source, sx, sy, w, h)` reads a
 * region of a decoded picture and returns two canvases of its size: `unlit`
 * (the art with its lights turned to a cold, dim monochrome; gold, black
 * plates and everything else untouched) and `lights` (only the lit pixels,
 * the rest transparent), to be drawn back over the unlit art as it lights.
 * One pixel pass; callers run it in idle time. Null where the pixels
 * cannot be read (the suit then lights as it always did). */
export function splitLights(source, sx, sy, w, h, document = globalThis.document) {
  try {
    return split(source, sx, sy, w, h, document);
  } catch {
    return null;
  }
}

function split(source, sx, sy, w, h, document) {
  const make = () => Object.assign(document.createElement("canvas"), { width: w, height: h });
  // The pixels are read and written once on a scratch canvas (kept in main
  // memory for that). The results are ordinary canvases: drawn from on every
  // frame of the call, a main-memory canvas would be uploaded to the GPU at
  // each draw (Safari), which made the call heavy (owner, 2026-10-11).
  const scratch = make();
  const unlit = make();
  const lights = make();
  const uc = scratch.getContext("2d", { willReadFrequently: true });
  uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
  const art = uc.getImageData(0, 0, w, h);
  const glow = uc.createImageData(w, h);
  const a = art.data;
  const g = glow.data;
  for (let i = 0; i < a.length; i += 4) {
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
  uc.putImageData(art, 0, 0);
  unlit.getContext("2d").drawImage(scratch, 0, 0);
  uc.clearRect(0, 0, w, h);
  uc.putImageData(glow, 0, 0);
  lights.getContext("2d").drawImage(scratch, 0, 0);
  scratch.width = scratch.height = 0;
  return { unlit, lights };
}
