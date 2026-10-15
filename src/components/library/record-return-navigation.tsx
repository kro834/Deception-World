import { useEffect, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { getInquiryGuide, getInquiryStop } from "@/lib/inquiry-guides";
import {
  beginRecordReturn,
  clearRecordReturn,
  getRecordReturn,
  getServerRecordReturn,
  matchesRecordReturnTarget,
  reconcileRecordReturn,
  RECORD_RETURN_LIFETIME,
  RECORD_RETURN_PENDING,
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
  const createdAt = context?.createdAt;
  const phase = context?.phase;

  useEffect(() => {
    const restore = reconcileRecordReturn(location);
    return restore ? watchRecordReturnArrival(restore.source, restore.scroll) : undefined;
  }, [location, createdAt]);

  useEffect(() => {
    if (createdAt === undefined) return;
    const lifetime = phase === "leaving" ? RECORD_RETURN_PENDING : RECORD_RETURN_LIFETIME;
    const timer = window.setTimeout(
      clearRecordReturn,
      Math.max(0, createdAt + lifetime - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [createdAt, phase]);

  const guide = getInquiryGuide((location.search as Record<string, unknown>).guide);
  if (
    !context ||
    (phase !== "reading" && phase !== "returning") ||
    !matchesRecordReturnTarget(context, location) ||
    getInquiryStop(guide, location.pathname)
  )
    return null;

  const label = context.source.pathname === "/search" ? "検索結果へ戻る" : "資料一覧へ戻る";
  return (
    <>
      <link rel="stylesheet" href={cssUrl} precedence="default" />
      <nav className="record-return-navigation" aria-label="開いた資料の一覧に戻る">
        <GuardedLink
          to={context.source.pathname}
          search={context.source.search}
          hash={context.source.cardId}
          assets={[]}
          beforeNavigate={beginRecordReturn}
          aria-label={context.source.search.q ? `${label}：${context.source.search.q}` : label}
        >
          <span aria-hidden="true">←</span>
          {label}
        </GuardedLink>
        <button type="button" aria-label="一覧への戻る案内を閉じる" onClick={clearRecordReturn}>
          ×
        </button>
      </nav>
    </>
  );
}
