import { useCallback, useEffect, useRef } from "react";
import { defaultParseSearch, useRouter } from "@tanstack/react-router";
import { useLoadGate } from "@/components/load-gate";
import type { SearchResult } from "./search-engine";
import { watchRecordArrival } from "@/lib/record-arrival";
import {
  captureRecordReturn,
  clearRecordReturn,
  finishRecordReturnOpening,
  makeRecordReturn,
  matchesRecordReturnSource,
  type RecordReturnInput,
  type RecordReturnContext,
} from "@/lib/record-return-state";

/** Opens a result the way the site's own links do (load gate, transitions). */
export function useOpenResult() {
  const { go } = useLoadGate();
  const router = useRouter();
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  return useCallback(
    async (
      result: Pick<SearchResult, "document" | "hash">,
      fromKeyboard: boolean,
      source?: RecordReturnInput["source"],
    ) => {
      const { document } = result;
      const hash = result.hash ?? document.hash;
      const request = ++sequence.current;
      const target = { pathname: document.to, search: document.search, hash };
      const context = source ? makeRecordReturn({ source, target }) : null;
      let captured: RecordReturnContext | null = null;
      if (context) {
        // Commit the live draft to this history entry before leaving. The
        // debounced field write may not have run yet when a result is opened.
        try {
          await router.navigate({
            to: context.source.pathname,
            search: context.source.search as never,
            replace: true,
            resetScroll: false,
          });
        } catch {
          if (request === sequence.current) clearRecordReturn();
          return;
        }
        if (request !== sequence.current) return;
        // Back can change only the query while this component remains mounted.
        // A resolved replace must not reopen a result from that older search.
        if (
          !matchesRecordReturnSource(context.source, {
            pathname: window.location.pathname,
            search: defaultParseSearch(window.location.search),
          })
        )
          return;
        captured = captureRecordReturn({ source: context.source, target }, true);
      } else clearRecordReturn();
      try {
        watchRecordArrival(document.to, hash);
        if (document.search) {
          await router.navigate({ to: document.to, search: document.search as never, hash });
        } else {
          await go({ to: document.to, hash, assets: [], focusDestination: fromKeyboard });
        }
      } catch {
        // The router/load gate owns its error and retry UI. Event handlers
        // intentionally do not await this hook, so consume the rejection here.
      } finally {
        if (captured)
          finishRecordReturnOpening(captured, {
            pathname: window.location.pathname,
            search: defaultParseSearch(window.location.search),
            hash: window.location.hash,
          });
      }
    },
    [go, router],
  );
}
