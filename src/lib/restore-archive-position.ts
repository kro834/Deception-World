/** Restore after releasing a fixed-body modal, using the current layout.
 * WebKit's native scrollIntoView can use pre-release geometry after resize.
 * Keep correction synchronous so it cannot fight a later swipe/navigation. */
export function restoreArchivePosition(section: HTMLElement, environment: Window = window) {
  const header = section.ownerDocument.querySelector<HTMLElement>(".site-shell .topbar");
  for (let pass = 0; pass < 2; pass += 1) {
    const top = section.getBoundingClientRect().top;
    const inset = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
    const delta = top - inset;
    if (Math.abs(delta) <= 1) break;
    environment.scrollTo({
      top: environment.scrollY + delta,
      left: environment.scrollX,
      behavior: "instant",
    });
  }
}
