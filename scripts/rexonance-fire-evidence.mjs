// Screenshot-only QA: the product renderer never imports this analyser.
// Count real green pixels; a tiny dilation may connect texture pinholes but
// cannot turn HUD rings or the empty leg gap into body-fire evidence.
export function connectedFireEvidence({
  pixels,
  width,
  height,
  bodyMask,
  regions,
  referenceWidth = width,
  referenceHeight = height,
  bodyPadding = 2,
  bridge = 1,
  exteriorPadding = 14,
}) {
  if (pixels.length !== width * height * 4 || bodyMask.length !== width * height)
    throw new RangeError("RGBA and body mask must share the sampling grid");
  const count = width * height;
  const dilate = (source, radius, fence) => {
    const result = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (!source[i]) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (
            dx * dx + dy * dy > radius * radius ||
            xx < 0 ||
            yy < 0 ||
            xx >= width ||
            yy >= height
          )
            continue;
          const at = yy * width + xx;
          if (!fence || fence[at]) result[at] = 1;
        }
    }
    return result;
  };
  const body = Uint8Array.from(bodyMask, (alpha) => (alpha > 16 ? 1 : 0));
  const allowed = dilate(body, bodyPadding);
  const exterior = dilate(body, exteriorPadding);
  const green = new Uint8Array(count);
  const rawGreen = new Uint8Array(count);
  let greenPixels = 0;
  let supportedPixels = 0;
  let energy = 0;
  let exteriorPixels = 0;
  let exteriorGreen = 0;
  let exteriorEnergy = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const excess = pixels[p + 1] - Math.max(pixels[p] * 1.2, pixels[p + 2] * 1.15);
    if (pixels[p + 3] > 24 && pixels[p + 1] > 28 && excess > 0) rawGreen[i] = 1;
    if (!allowed[i] && exterior[i]) {
      exteriorPixels++;
      if (pixels[p + 3] > 24 && pixels[p + 1] > 28 && excess > 0) {
        exteriorGreen++;
        exteriorEnergy += (excess / 255) * (pixels[p + 3] / 255);
      }
    }
    if (!allowed[i]) continue;
    supportedPixels++;
    if (pixels[p + 3] <= 24 || pixels[p + 1] <= 28 || excess <= 0) continue;
    green[i] = 1;
    greenPixels++;
    energy += (excess / 255) * (pixels[p + 3] / 255);
  }
  const connected = dilate(green, bridge, allowed);
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  const components = [];
  for (let start = 0; start < count; start++) {
    if (!connected[start] || labels[start]) continue;
    const id = components.length + 1;
    let first = 0;
    let last = 1;
    let actual = 0;
    queue[0] = start;
    labels[start] = id;
    while (first < last) {
      const at = queue[first++];
      actual += green[at];
      const x = at % width;
      const y = Math.floor(at / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const next = yy * width + xx;
          if (connected[next] && !labels[next]) {
            labels[next] = id;
            queue[last++] = next;
          }
        }
    }
    components.push({ id, greenPixels: actual });
  }
  const largest = components.reduce(
    (best, component) => (component.greenPixels > best.greenPixels ? component : best),
    { id: 0, greenPixels: 0 },
  );
  const regional = {};
  const largestRegional = {};
  for (const [name, [x, y, w, h]] of Object.entries(regions)) {
    const x0 = Math.max(0, Math.floor((x / referenceWidth) * width));
    const y0 = Math.max(0, Math.floor((y / referenceHeight) * height));
    const x1 = Math.min(width, Math.ceil(((x + w) / referenceWidth) * width));
    const y1 = Math.min(height, Math.ceil(((y + h) / referenceHeight) * height));
    let all = 0;
    let joined = 0;
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) {
        const at = yy * width + xx;
        all += green[at];
        if (largest.id && labels[at] === largest.id) joined += green[at];
      }
    const pixels = (x1 - x0) * (y1 - y0);
    regional[name] = { greenPixels: all, pixels, ratio: pixels ? all / pixels : 0 };
    largestRegional[name] = { greenPixels: joined, pixels, ratio: pixels ? joined / pixels : 0 };
  }
  // A hollow, depth-separated vortex need not paint the person's centre.
  // Measure actual flame just outside both real body boundaries instead:
  // all six anatomical levels must be wrapped in the same screenshot.
  const wrapRegions = {};
  const radius = Math.max(2, Math.round(width * 0.17));
  const gap = Math.max(1, Math.round(width * 0.012));
  for (const [band, key] of [
    ["head", "head"],
    ["chest", "chest"],
    ["waist", "abdomen"],
    ["thigh", "thighLeft"],
    ["shin", "shinLeft"],
    ["foot", "footLeft"],
  ]) {
    const region = regions[key];
    if (!region) continue;
    const y0 = Math.max(0, Math.floor((region[1] / referenceHeight) * height));
    const y1 = Math.min(height, Math.ceil(((region[1] + region[3]) / referenceHeight) * height));
    const sums = [
      [0, 0],
      [0, 0],
    ];
    for (let y = y0; y < y1; y++) {
      let left = width,
        right = -1;
      for (let x = 0; x < width; x++)
        if (body[y * width + x]) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      if (right < left) continue;
      for (const [side, a, b] of [
        [0, Math.max(0, left - radius), Math.max(0, left - gap)],
        [1, Math.min(width, right + gap + 1), Math.min(width, right + radius + 1)],
      ]) {
        for (let x = a; x < b; x++) {
          sums[side][0]++;
          sums[side][1] += rawGreen[y * width + x];
        }
      }
    }
    for (const [side, label] of [
      [0, "left"],
      [1, "right"],
    ])
      wrapRegions[`${band}-${label}`] = {
        pixels: sums[side][0],
        greenPixels: sums[side][1],
        ratio: sums[side][0] ? sums[side][1] / sums[side][0] : 0,
      };
  }
  let centerPixels = 0,
    centerGreen = 0;
  for (let y = Math.floor(height * 0.15); y < Math.ceil(height * 0.85); y++)
    for (let x = Math.floor(width * 0.35); x < Math.ceil(width * 0.65); x++) {
      centerPixels++;
      centerGreen += rawGreen[y * width + x];
    }
  return {
    width,
    height,
    bodyPadding,
    bridge,
    greenPixels,
    supportedPixels,
    meanGreenExcess: supportedPixels ? energy / supportedPixels : 0,
    componentCount: components.length,
    wrap: {
      radius,
      gap,
      regions: wrapRegions,
      minimum: Math.min(...Object.values(wrapRegions).map((r) => r.ratio)),
    },
    center: {
      pixels: centerPixels,
      greenPixels: centerGreen,
      ratio: centerPixels ? centerGreen / centerPixels : 0,
    },
    exterior: {
      padding: exteriorPadding,
      pixels: exteriorPixels,
      greenPixels: exteriorGreen,
      ratio: exteriorPixels ? exteriorGreen / exteriorPixels : 0,
      relativeToBody: greenPixels ? exteriorGreen / greenPixels : 0,
      meanGreenExcess: exteriorPixels ? exteriorEnergy / exteriorPixels : 0,
    },
    regional,
    largest: {
      greenPixels: largest.greenPixels,
      fractionOfGreen: greenPixels ? largest.greenPixels / greenPixels : 0,
      regional: largestRegional,
    },
  };
}
