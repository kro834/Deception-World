/**
 * A stable React 19 ref for lazy `sizes="auto, …"` images. Chromium can otherwise
 * keep its viewport-size listener (and the entire detached page) alive. Release
 * the attribute synchronously, before React removes the host node. Restore it
 * on every attach, including StrictMode's setup → cleanup → setup rehearsal.
 */
export function autoSizedImageRef(sizes: string) {
  return (image: HTMLImageElement | null) => {
    if (!image) return;
    image.setAttribute("sizes", sizes);
    return () => image.removeAttribute("sizes");
  };
}
