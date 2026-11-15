import { useEffect, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { getInquiryGuide, getInquiryStop } from "@/lib/inquiry-guides";
import {
  beginRecordReturn,
  clearRecordReturn,
  expireRecordReturn,
  getRecordReturn,
  getServerRecordReturn,
  matchesRecordReturnTarget,
  reconcileRecordReturn,
  recordReturnExpiresAt,
  subscribeRecordReturn,
} from "@/lib/record-return-state";
import { watchRecordReturnArrival } from "@/lib/record-return-arrival";
import cssUrl from "@/styles-record-return.css?url";

export function RecordReturnNavigation() {
  const location = useRouterState({ select: (state) => state.location });
  const context = useSyncExternalStore(
    subscribeRecordReturn,
    getRecordReturn,
    getServerRecordReturn,
  );
  const source = context?.source;
  const phase = context?.phase;

  useEffect(() => {
    const restore = reconcileRecordReturn(location);
    return restore ? watchRecordReturnArrival(restore.source, restore.scroll) : undefined;
  }, [location, source]);

  useEffect(() => {
    if (!context) return;
    const timer = window.setTimeout(
      () => expireRecordReturn(context),
      Math.max(0, recordReturnExpiresAt(context) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [context]);

  const guide = getInquiryGuide((location.search as Record<string, unknown>).guide);
  if (
    !context ||
    (phase !== "reading" && phase !== "returning") ||
    !matchesRecordReturnTarget(context, location) ||
    getInquiryStop(guide, location.pathname)
  )
    return null;

  const isSearch = context.source.pathname === "/search";
  const label = isSearch ? "検索結果へ戻る" : "資料一覧へ戻る";
  return (
    <>
      <link rel="stylesheet" href={cssUrl} precedence="default" />
      <nav
        className="record-return-navigation"
        aria-label="開いた資料の一覧に戻る"
        data-return-source={isSearch ? "search" : "library"}
        data-return-phase={phase}
      >
        <GuardedLink
          to={context.source.pathname}
          search={context.source.search}
          hash={context.source.cardId}
          assets={[]}
          beforeNavigate={beginRecordReturn}
          aria-label={context.source.search.q ? `${label}：${context.source.search.q}` : label}
        >
          <span
            aria-hidden="true"
            style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <circle
                cx="8"
                cy="8"
                r="6.2"
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeWidth="1"
                strokeDasharray="2.6 1.8"
              />
              <path
                d="M10.8 8H5.2M7.5 5.5 5 8l2.5 2.5"
                stroke="currentColor"
                strokeWidth="1.45"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {label}
        </GuardedLink>
        <button type="button" aria-label="一覧への戻る案内を閉じる" onClick={clearRecordReturn}>
          <span
            aria-hidden="true"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </span>
        </button>
      </nav>
    </>
  );
}
