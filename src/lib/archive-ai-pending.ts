export type ArchiveAiPendingRecord = {
  requestId: string;
  url: "/api/archive-search" | "/api/archive-intelligence";
  client: "search-v1" | "persona-v1";
  contextId?: string;
  userMessageId?: string;
  startedAt: number;
  expiresAt: number;
};

const DB_NAME = "deception-world-ai";
const STORE_NAME = "pending-requests";
const SESSION_KEY = "archive-ai-session-v1";
const FALLBACK_PENDING_KEY = "archive-ai-pending-v1";
const TTL_MS = 24 * 60 * 60 * 1_000;
const INDEXED_DB_DEADLINE_MS = 450;
const INDEXED_DB_COLD_START_WINDOWS_MS = [INDEXED_DB_DEADLINE_MS, 1_200, 2_400] as const;
let memorySessionId: string | null = null;

class IndexedDbDeadlineError extends Error {
  constructor() {
    super("IndexedDB operation timed out");
    this.name = "IndexedDbDeadlineError";
  }
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("Secure UUID generation is unavailable");
}

export function createArchiveAiRequestId(): string {
  return newUuid();
}

export function getArchiveAiSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return (memorySessionId = existing);
    const created = newUuid();
    localStorage.setItem(SESSION_KEY, created);
    return (memorySessionId = created);
  } catch {
    return (memorySessionId ??= newUuid());
  }
}

function openPendingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "requestId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

function withDeadline<T>(operation: Promise<T>, timeoutMs = INDEXED_DB_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new IndexedDbDeadlineError()), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function writeIndexedDb(value: ArchiveAiPendingRecord): Promise<void> {
  const database = await openPendingDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
}

async function deleteIndexedDb(requestId: string): Promise<void> {
  const database = await openPendingDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(requestId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB delete aborted"));
    });
  } finally {
    database.close();
  }
}

async function readIndexedDb(): Promise<ArchiveAiPendingRecord[]> {
  const database = await openPendingDatabase();
  try {
    return await new Promise<ArchiveAiPendingRecord[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as ArchiveAiPendingRecord[]);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB read aborted"));
    });
  } finally {
    database.close();
  }
}

async function readIndexedDbAfterColdStart(): Promise<ArchiveAiPendingRecord[]> {
  // Safari can take longer than the normal operation deadline to wake IndexedDB after a
  // process restore. Keep awaiting the *same* read so we never create duplicate transactions
  // or abandon a request that only exists in durable storage.
  const operation = readIndexedDb();
  let deadlineError: IndexedDbDeadlineError | null = null;
  for (const timeoutMs of INDEXED_DB_COLD_START_WINDOWS_MS) {
    try {
      return await withDeadline(operation, timeoutMs);
    } catch (error) {
      if (!(error instanceof IndexedDbDeadlineError)) throw error;
      deadlineError = error;
    }
  }
  throw deadlineError ?? new IndexedDbDeadlineError();
}

function fallbackRecords(): ArchiveAiPendingRecord[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(FALLBACK_PENDING_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as ArchiveAiPendingRecord[]) : [];
  } catch {
    return [];
  }
}

function saveFallbackRecords(records: ArchiveAiPendingRecord[]): void {
  try {
    sessionStorage.setItem(FALLBACK_PENDING_KEY, JSON.stringify(records));
  } catch {
    // Persistence is best-effort; the in-flight promise remains authoritative.
  }
}

export async function rememberArchiveAiPending(
  record: Omit<ArchiveAiPendingRecord, "expiresAt"> & { expiresAt?: number },
): Promise<void> {
  const value: ArchiveAiPendingRecord = {
    ...record,
    expiresAt: record.expiresAt ?? record.startedAt + TTL_MS,
  };
  const fallback = fallbackRecords().filter((item) => item.requestId !== value.requestId);
  saveFallbackRecords([...fallback, value]);
  try {
    await withDeadline(writeIndexedDb(value));
  } catch {
    // sessionStorage already contains a synchronous recovery record.
  }
}

export async function forgetArchiveAiPending(requestId: string): Promise<void> {
  saveFallbackRecords(fallbackRecords().filter((item) => item.requestId !== requestId));
  try {
    await withDeadline(deleteIndexedDb(requestId));
  } catch {
    // The synchronous fallback record is already gone; stale IDB entries expire by TTL.
  }
}

export async function listArchiveAiPending(now = Date.now()): Promise<ArchiveAiPendingRecord[]> {
  const fallback = fallbackRecords().filter((record) => record.expiresAt > now);
  saveFallbackRecords(fallback);
  try {
    const records = (await readIndexedDbAfterColdStart()).filter(
      (record) => record.expiresAt > now,
    );
    const merged = new Map<string, ArchiveAiPendingRecord>();
    for (const record of [...records, ...fallback]) merged.set(record.requestId, record);
    return [...merged.values()];
  } catch {
    return fallback;
  }
}
