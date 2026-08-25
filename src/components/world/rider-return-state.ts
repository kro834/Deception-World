const RIDER_RETURN_KEY = "deception-world:rider-return";

export function rememberRiderReturn(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RIDER_RETURN_KEY, id);
  } catch {
    /* Private browsing can deny storage; the normal first tab remains safe. */
  }
}

export function readRiderReturn() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(RIDER_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearRiderReturn() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RIDER_RETURN_KEY);
  } catch {
    /* Storage can disappear between render and commit. */
  }
}
