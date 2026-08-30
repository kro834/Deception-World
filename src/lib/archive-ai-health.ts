import type { ArchiveDeliveryReason } from "./archive-delivery.ts";

export type ArchiveHealthSurface = "search" | "persona";
export type ArchiveHealthAction = "send" | "edit_resend" | "retry";
export type ArchiveLatencyBucket = "under_3s" | "3_to_8s" | "8_to_20s" | "over_20s";

export type ArchiveAiHealthEvent = {
  surface: ArchiveHealthSurface;
  action: ArchiveHealthAction;
  channel: "online" | "local" | "failed";
  reason: ArchiveDeliveryReason;
  latency: ArchiveLatencyBucket;
  turns: "1_to_4" | "5_to_8" | "9_to_12" | "over_12";
  context: "low" | "medium" | "high";
  trimmed: boolean;
  minute: number;
};

export type ArchiveAiHealthSummary = {
  online: number;
  local: number;
  failed: number;
  transitions: number;
  successRate: number;
  lastChannel: "online" | "local" | "failed" | "ready";
  lastReason?: ArchiveDeliveryReason;
  lastLatency?: ArchiveLatencyBucket;
  highContext: boolean;
};

const STORAGE_KEY = "deception-world:archive-ai-health:v1";
const MAX_EVENTS = 48;
let memoryEvents: ArchiveAiHealthEvent[] = [];

function isHealthEvent(value: unknown): value is ArchiveAiHealthEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ArchiveAiHealthEvent>;
  return (
    (event.surface === "search" || event.surface === "persona") &&
    (event.action === "send" || event.action === "edit_resend" || event.action === "retry") &&
    (event.channel === "online" || event.channel === "local" || event.channel === "failed") &&
    typeof event.reason === "string" &&
    typeof event.latency === "string" &&
    typeof event.turns === "string" &&
    typeof event.context === "string" &&
    typeof event.trimmed === "boolean" &&
    typeof event.minute === "number"
  );
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readArchiveAiHealthEvents(): ArchiveAiHealthEvent[] {
  const target = storage();
  if (!target) return memoryEvents;
  try {
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHealthEvent).slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

function writeEvents(events: ArchiveAiHealthEvent[]): void {
  const bounded = events.slice(-MAX_EVENTS);
  memoryEvents = bounded;
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Private browsing can deny sessionStorage. The in-memory ring remains active.
  }
}

export function archiveLatencyBucket(milliseconds: number): ArchiveLatencyBucket {
  if (milliseconds < 3_000) return "under_3s";
  if (milliseconds < 8_000) return "3_to_8s";
  if (milliseconds < 20_000) return "8_to_20s";
  return "over_20s";
}

export function archiveTurnsBucket(turns: number): ArchiveAiHealthEvent["turns"] {
  if (turns <= 4) return "1_to_4";
  if (turns <= 8) return "5_to_8";
  if (turns <= 12) return "9_to_12";
  return "over_12";
}

export function summarizeArchiveAiHealth(
  surface: ArchiveHealthSurface,
  events = readArchiveAiHealthEvents(),
): ArchiveAiHealthSummary {
  const filtered = events.filter((event) => event.surface === surface);
  const online = filtered.filter((event) => event.channel === "online").length;
  const local = filtered.filter((event) => event.channel === "local").length;
  const failed = filtered.filter((event) => event.channel === "failed").length;
  const transitions = filtered.reduce(
    (count, event, index) =>
      index > 0 && filtered[index - 1].channel !== event.channel ? count + 1 : count,
    0,
  );
  const latest = filtered.at(-1);
  return {
    online,
    local,
    failed,
    transitions,
    successRate: filtered.length ? Math.round((online / filtered.length) * 100) : 100,
    lastChannel: latest?.channel ?? "ready",
    lastReason: latest?.reason,
    lastLatency: latest?.latency,
    highContext: filtered.some((event) => event.context === "high"),
  };
}

export function recordArchiveAiHealth(
  event: Omit<ArchiveAiHealthEvent, "latency" | "turns" | "minute"> & {
    latencyMs: number;
    turnCount: number;
  },
): ArchiveAiHealthSummary {
  const next: ArchiveAiHealthEvent = {
    surface: event.surface,
    action: event.action,
    channel: event.channel,
    reason: event.reason,
    latency: archiveLatencyBucket(event.latencyMs),
    turns: archiveTurnsBucket(event.turnCount),
    context: event.context,
    trimmed: event.trimmed,
    minute: Math.floor(Date.now() / 60_000),
  };
  const events = [...readArchiveAiHealthEvents(), next].slice(-MAX_EVENTS);
  writeEvents(events);
  return summarizeArchiveAiHealth(event.surface, events);
}

export function resetArchiveAiHealth(surface: ArchiveHealthSurface): ArchiveAiHealthSummary {
  writeEvents(readArchiveAiHealthEvents().filter((event) => event.surface !== surface));
  return summarizeArchiveAiHealth(surface);
}
