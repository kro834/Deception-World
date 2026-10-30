/** Shared physical motion for compact iPad and landscape iPhone launchers. */
/** Exact damped-spring step: refresh-rate independent, and a retarget keeps
 * both position and velocity. Damping 0.84 limits a resting step's overshoot
 * to 0.77%; the 17 rad/s frequency seats a normal flight within 900 ms.
 * @param {{pose:Record<string,number>,velocity:Record<string,number>}} state
 * @param {Record<string,number>} target @param {number} elapsedMs
 */
export function advanceCompactMenuSpring(state, target, elapsedMs) {
  const dt = Math.max(0, Math.min(64, Number.isFinite(elapsedMs) ? elapsedMs : 0)) / 1000;
  const frequency = 17;
  const damping = 0.84 * frequency;
  const oscillation = frequency * Math.sqrt(1 - 0.84 ** 2);
  const decay = Math.exp(-damping * dt);
  const cosine = Math.cos(oscillation * dt);
  const sine = Math.sin(oscillation * dt);
  const pose = {};
  const velocity = {};
  for (const key of Object.keys(target)) {
    const displacement = state.pose[key] - target[key];
    const speed = state.velocity[key] || 0;
    pose[key] =
      target[key] +
      decay * (displacement * cosine + ((speed + damping * displacement) / oscillation) * sine);
    velocity[key] =
      decay *
      (speed * cosine - ((damping * speed + frequency ** 2 * displacement) / oscillation) * sine);
  }
  return { pose, velocity };
}

export function getCompactMenuPose(rect, folded) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
    fold: folded ? 1 : 0,
  };
}

const PAINT_PROPERTIES = ["transform", "opacity", "borderRadius", "width", "height", "boxShadow"];
export function captureCompactMenuStyles(element) {
  // cssText preserves priorities as well as absent declarations exactly.
  if (typeof element.style.cssText === "string") return { cssText: element.style.cssText };
  return Object.fromEntries(PAINT_PROPERTIES.map((key) => [key, element.style[key] || ""]));
}
export function restoreCompactMenuStyles(element, styles) {
  for (const [property, value] of Object.entries(styles)) element.style[property] = value;
}

export function paintCompactMenuShell(element, state, host) {
  const { pose, velocity } = state;
  const fold = Math.max(0, Math.min(1, pose.fold));
  const width = Math.max(1, pose.width);
  const height = Math.max(1, pose.height);
  // A subtle bank communicates momentum without flattening the menu glyph.
  const bank = Math.max(-4, Math.min(4, (velocity.x || 0) * 0.003));
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.transform = `translate3d(${pose.x - host.x - width / 2}px, ${pose.y - host.y - height / 2}px, 0) rotate(${bank}deg)`;
  element.style.borderRadius = `${8 + (Math.min(width, height) / 2 - 8) * fold}px`;
  element.style.opacity = "1";
  element.style.boxShadow = `inset 0 1px #ffffff20, 0 ${3 + fold * 3}px ${12 + fold * 12}px #0008`;
}
