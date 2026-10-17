const DARK_MEAN = 0.05;
const DARK_STD = 0.012;
const DARK_P99 = 0.05;
const ZEUS_DETAIL_FRACTION = 0.005;

export function isFlatCoverFrame(frame, scenario) {
  const globallyFlat =
    frame.mean < DARK_MEAN && frame.std < DARK_STD && frame.p99 < DARK_P99;
  if (!globallyFlat) return false;
  if (scenario !== "world-zeus") return true;
  return !(frame.zeusDetailFraction >= ZEUS_DETAIL_FRACTION);
}
