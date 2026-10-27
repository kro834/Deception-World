// Give an existing route cover two painted frames before destination work.
// The title's original 96ms fail-safe also releases a backgrounded or frozen tab.
export function waitForVisualPaint() {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.setTimeout(finish, 96);
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
  });
}
