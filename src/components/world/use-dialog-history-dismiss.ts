import { useEffect, useRef, type RefObject } from "react";
import { useRouter } from "@tanstack/react-router";

/** Hash history can leave the route mounted, but not its departing record. */
export function useDialogHistoryDismiss(
  dialogRef: RefObject<HTMLDialogElement | null>,
  dismiss: () => void,
) {
  const router = useRouter();
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        if (action.type !== "BACK" && action.type !== "FORWARD" && action.type !== "GO") return;
        if (!dialogRef.current?.open) return;
        // Each viewer cancels its own settling/closing work before releasing
        // the native dialog. Nothing delayed may pull the restored page back.
        dismissRef.current();
        // Native close returns focus to the old opener. History has a different
        // destination; ordinary Escape/close still keeps native focus return.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    [dialogRef, router],
  );
}
