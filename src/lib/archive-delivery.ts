export const ARCHIVE_DELIVERY_REASONS = [
  "ok",
  "unconfigured",
  "rate_limited",
  "shared_limit_unavailable",
  "provider_timeout",
  "provider_unavailable",
  "provider_invalid_response",
  "client_network",
  "client_http_4xx",
  "client_http_5xx",
  "client_invalid_payload",
] as const;

export type ArchiveDeliveryReason = (typeof ARCHIVE_DELIVERY_REASONS)[number];

export type ArchiveDelivery = {
  channel: "online" | "local";
  reason: ArchiveDeliveryReason;
};

export const ONLINE_ARCHIVE_DELIVERY: ArchiveDelivery = { channel: "online", reason: "ok" };

export function localArchiveDelivery(reason: ArchiveDeliveryReason): ArchiveDelivery {
  return { channel: "local", reason };
}

export function isArchiveDelivery(value: unknown): value is ArchiveDelivery {
  if (!value || typeof value !== "object") return false;
  const delivery = value as Partial<ArchiveDelivery>;
  return (
    (delivery.channel === "online" || delivery.channel === "local") &&
    ARCHIVE_DELIVERY_REASONS.includes(delivery.reason as ArchiveDeliveryReason)
  );
}
