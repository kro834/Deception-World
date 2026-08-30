import { useState } from "react";
import type { ArchiveAiHealthSummary } from "@/lib/archive-ai-health";

const LATENCY_LABELS = {
  under_3s: "3秒未満",
  "3_to_8s": "3〜8秒",
  "8_to_20s": "8〜20秒",
  over_20s: "20秒以上",
} as const;

const REASON_LABELS = {
  ok: "正常",
  unconfigured: "AI接続未設定",
  rate_limited: "利用集中",
  shared_state_unavailable: "共有状態を確認できません",
  provider_timeout: "AI応答待ち時間超過",
  provider_unavailable: "AI回線を一時利用できません",
  provider_invalid_response: "AI応答の再検証に失敗",
  provider_authentication: "AI認証エラー",
  provider_permission: "AI権限エラー",
  provider_model_unavailable: "指定モデルを利用できません",
  provider_quota: "AI利用枠を確認してください",
  provider_rate_limited: "AI回線が混み合っています",
  provider_model_mismatch: "実モデルの検証不一致",
  request_expired: "回答の保持期限切れ",
  request_cancelled: "回答生成を停止",
  client_network: "端末側の通信中断",
  client_http_4xx: "送信内容の検証不一致",
  client_http_5xx: "サイト回線の一時エラー",
  client_invalid_payload: "受信内容の検証不一致",
} as const;

export function ArchiveConnectionHealth({
  summary,
  pending,
  turnCount,
  turnLimit,
  onReset,
}: {
  summary: ArchiveAiHealthSummary;
  pending: boolean;
  turnCount: number;
  turnLimit: number;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = pending
    ? "CONNECTING"
    : summary.lastChannel === "online"
      ? "NEURAL ONLINE"
      : summary.lastChannel === "local"
        ? "LOCAL CORE"
        : summary.lastChannel === "failed"
          ? "RECONNECT NEEDED"
          : "HYBRID READY";
  return (
    <div className="archive-connection-health" data-open={open || undefined}>
      <button
        type="button"
        className="archive-connection-health-trigger"
        aria-expanded={open}
        aria-label={`${label}。回線診断を${open ? "閉じる" : "開く"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <i aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open ? (
        <section className="archive-connection-health-panel" aria-label="このタブの回線診断">
          <header>
            <small>CONNECTION HEALTH</small>
            <b>{summary.successRate}% ONLINE</b>
          </header>
          <dl>
            <div>
              <dt>ONLINE</dt>
              <dd>{summary.online}</dd>
            </div>
            <div>
              <dt>LOCAL</dt>
              <dd>{summary.local}</dd>
            </div>
            <div>
              <dt>ERROR</dt>
              <dd>{summary.failed}</dd>
            </div>
            <div>
              <dt>CONTEXT</dt>
              <dd>
                {Math.min(turnCount, turnLimit)}/{turnLimit}
              </dd>
            </div>
          </dl>
          <p>
            直近の応答: {summary.lastLatency ? LATENCY_LABELS[summary.lastLatency] : "未計測"}
            {summary.lastReason ? ` ／ ${REASON_LABELS[summary.lastReason]}` : ""}
            {summary.highContext ? " ／ 長い会話を自動で圧縮済み" : ""}
          </p>
          <footer>
            <span>本文を保存せず、このタブ内だけで計測します。</span>
            <button type="button" onClick={onReset}>
              診断をリセット
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
