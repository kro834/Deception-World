// Test-only analysis of the real cached flame field (384x624), registered
// to the unchanged 571x1040 artwork. Pixel occupancy is deliberately kept
// separate from the screen composition's opacity and native nanite draws.
export const SPREAD_BODY_REGIONS = Object.freeze({
  head: [259, 104, 48, 60],
  chest: [250, 245, 70, 64],
  abdomen: [253, 348, 62, 56],
  armLeft: [111, 420, 31, 70],
  armRight: [429, 420, 31, 70],
  thighLeft: [185, 540, 40, 85],
  thighRight: [343, 540, 40, 85],
  shinLeft: [146, 760, 31, 90],
  shinRight: [393, 760, 31, 90],
  footLeft: [122, 955, 45, 45],
  footRight: [404, 955, 45, 45],
});

export function flameSpreadEvidence(data, width, height) {
  if (width !== 384 || height !== 624 || data.length !== width * height * 4)
    throw new RangeError("expect the actual 384x624 registered RGBA flame field");
  const bands = {
    crown: [-0.09, 0.15],
    chest: [0.15, 0.35],
    waist: [0.35, 0.55],
    thigh: [0.55, 0.7],
    shin: [0.7, 0.9],
    foot: [0.9, 1.04],
  };
  const counts = Object.fromEntries(Object.keys(bands).map((name) => [name, 0]));
  const green = new Uint8Array(width * height);
  let pixels = 0,
    top = Infinity,
    left = Infinity,
    right = -Infinity,
    armsLeft = 0,
    armsRight = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        data[i + 3] <= 24 ||
        data[i + 1] <= 28 ||
        data[i + 1] <= Math.max(data[i] * 1.2, data[i + 2] * 1.15)
      )
        continue;
      const bodyY = (y - 76) / 472,
        bodyX = (x - 96) / 192;
      green[y * width + x] = 1;
      pixels++;
      top = Math.min(top, bodyY);
      left = Math.min(left, bodyX);
      right = Math.max(right, bodyX);
      for (const [name, [from, to]] of Object.entries(bands))
        if (bodyY >= from && bodyY < to) counts[name]++;
      if (bodyY > 0.25 && bodyY < 0.57 && bodyX < 0.25) armsLeft++;
      if (bodyY > 0.25 && bodyY < 0.57 && bodyX > 0.75) armsRight++;
    }
  const regions = Object.fromEntries(
    Object.entries(SPREAD_BODY_REGIONS).map(([name, [x, y, w, h]]) => {
      const x0 = Math.floor(96 + (x / 571) * 192),
        x1 = Math.ceil(96 + ((x + w) / 571) * 192);
      const y0 = Math.floor(76 + (y / 1040) * 472),
        y1 = Math.ceil(76 + ((y + h) / 1040) * 472);
      let count = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) count += green[yy * width + xx];
      const total = (x1 - x0) * (y1 - y0);
      return [name, { green: count, pixels: total, ratio: count / total }];
    }),
  );
  return { burning: true, pixels, top, left, right, armsLeft, armsRight, bands: counts, regions };
}

export function assertSpreadSequence(assert, shots, { peak, kindle, minimum = 0.05, label }) {
  const peaks = shots.filter(peak),
    first = shots.find(kindle);
  assert.ok(
    first?.spread?.bands.foot > 0 && first.spread.bands.crown === 0,
    `${label}: ignition begins at the feet before reaching the crown`,
  );
  assert.ok(
    peaks.some((shot) => shot.spread && shot.spread.top < first.spread.top - 0.4),
    `${label}: the actual flame front climbs from the feet into the upper body`,
  );
  assert.ok(
    peaks.some(
      (shot) =>
        Object.values(shot.spread?.regions ?? {}).length === 11 &&
        Object.values(shot.spread.regions).every((region) => region.ratio >= minimum),
    ),
    `${label}: all eleven body patches burn together in one full/peak frame; ` +
      peaks
        .map(
          (shot) =>
            `${shot.target ?? shot.progress}:` +
            Object.entries(shot.spread?.regions ?? {})
              .sort(([, a], [, b]) => a.ratio - b.ratio)
              .slice(0, 2)
              .map(([name, region]) => `${name}=${(region.ratio * 100).toFixed(2)}%`)
              .join(","),
        )
        .join("; "),
  );
  assert.ok(
    peaks.some((shot) => shot.spread?.armsLeft > 5 && shot.spread?.armsRight > 5),
    `${label}: both lateral arm branches join the propagated fire`,
  );
}
