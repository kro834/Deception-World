import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLoadGate } from "@/components/load-gate";
import type { SearchResult } from "./search-engine";

/** Opens a result the way the site's own links do (load gate, transitions). */
export function useOpenResult() {
  const { go } = useLoadGate();
  const router = useRouter();
  return useCallback(
    (result: Pick<SearchResult, "document" | "hash">, fromKeyboard: boolean) => {
      const { document } = result;
      const hash = result.hash ?? document.hash;
      if (document.search) {
        void router.navigate({ to: document.to, search: document.search as never, hash });
        return;
      }
      void go({ to: document.to, hash, assets: [], focusDestination: fromKeyboard });
    },
    [go, router],
  );
}
