import { useEffect, useRef } from "react";

export type FormTheme = "rexonance" | "explom" | "kemonohen";
export const isSignatureForm = (theme?: FormTheme) => theme === "explom" || theme === "kemonohen";

/** A single, local entrance; never a scroll loop or a gate on opening the record. */
export function useFormSignatureArrival(theme?: FormTheme) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !isSignatureForm(theme)) return;
    if (!("IntersectionObserver" in window)) {
      node.dataset.signatureArrived = "true";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        node.dataset.signatureArrived = "true";
        observer.disconnect();
      },
      // Tall cards also arrive in a short landscape viewport.
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [theme]);
  return ref;
}
