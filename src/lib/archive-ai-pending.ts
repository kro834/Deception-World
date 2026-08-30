export type ArchiveAiPendingRecord = {
  requestId: string;
  /** Ledger ownership identity captured before the POST and persisted with it. */
  sessionId?: string;
  url: "/api/archive-search" | "/api/archive-intelligence";
  client: "search-v1" | "persona-v1";
  contextId?: string;
  userMessageId?: string;
  startedAt: number;
  expiresAt: number;
};

const DB_NAME = "deception-world-ai";
const STORE_NAME = "pending-requests";
const SESSION_STORE_NAME = "session-identity";
const SESSION_RECORD_KEY = "current";
const DB_VERSION = 2;
const SESSION_KEY = "archive-ai-session-v1";
const FALLBACK_PENDING_KEY = "archive-ai-pending-v1";
const TTL_MS = 24 * 60 * 60 * 1_000;
const INDEXED_DB_DEADLINE_MS = 450;
const INDEXED_DB_COLD_START_WINDOWS_MS = [INDEXED_DB_DEADLINE_MS, 1_200, 2_400] as const;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
let memorySessionId: string | null = null;
let resolvingSessionId: Promise<string> | null = null;

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

function openPendingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "requestId" });
      }
      if (!database.objectStoreNames.contains(SESSION_STORE_NAME)) {
        database.createObjectStore(SESSION_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDB open blocked"));
    };
  });
}

async function readSessionIdIndexedDb(): Promise<string | null> {
  const database = await openPendingDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(SESSION_STORE_NAME, "readonly");
      const request = transaction.objectStore(SESSION_STORE_NAME).get(SESSION_RECORD_KEY);
      request.onsuccess = () => {
        const value = request.result as { sessionId?: unknown } | undefined;
        resolve(
          typeof value?.sessionId === "string" && SESSION_ID_PATTERN.test(value.sessionId)
            ? value.sessionId
            : null,
        );
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB session read failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB read aborted"));
    });
  } finally {
    database.close();
  }
}

async function writeSessionIdIndexedDb(sessionId: string): Promise<void> {
  const database = await openPendingDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SESSION_STORE_NAME, "readwrite");
      transaction.objectStore(SESSION_STORE_NAME).put({ key: SESSION_RECORD_KEY, sessionId });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB session write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
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

async function readSessionIdAfterColdStart(): Promise<string | null> {
  const operation = readSessionIdIndexedDb();
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

function localSessionId(): string | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value && SESSION_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function saveLocalSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    // IndexedDB is the durable owner identity when WebKit blocks localStorage.
  }
}

/**
 * Resolve the ledger ownership identity before any POST/GET. On storage-restricted
 * iOS, the v2 IndexedDB metadata store survives a WebKit process restart even when
 * localStorage is unavailable.
 */
export async function getArchiveAiSessionId(): Promise<string> {
  if (memorySessionId) return memorySessionId;
  if (resolvingSessionId) return resolvingSessionId;
  resolvingSessionId = (async () => {
    const local = localSessionId();
    if (local) {
      memorySessionId = local;
      try {
        await withDeadline(writeSessionIdIndexedDb(local));
      } catch {
        // localStorage remains durable; retry IndexedDB persistence on the next cold start.
      }
      return local;
    }
    try {
      const durable = await readSessionIdAfterColdStart();
      if (durable) {
        memorySessionId = durable;
        saveLocalSessionId(durable);
        return durable;
      }
    } catch {
      // Generate a secure identity when IndexedDB is genuinely unavailable.
    }
    const created = newUuid();
    memorySessionId = created;
    saveLocalSessionId(created);
    try {
      await withDeadline(writeSessionIdIndexedDb(created));
    } catch {
      // The pending record below also carries this identity and may finish writing later.
    }
    return created;
  })();
  try {
    return await withDeadline(resolvingSessionId, 1_200);
  } catch {
    if (memorySessionId) return memorySessionId;
    const created = newUuid();
    memorySessionId = created;
    saveLocalSessionId(created);
    return created;
  } finally {
    resolvingSessionId = null;
  }
}

export function subscribeArchiveAiRecoveryWake(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const wake = () => listener();
  const visibilityWake = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") wake();
  };
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", wake);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", visibilityWake);
  }
  return () => {
    window.removeEventListener("online", wake);
    window.removeEventListener("pageshow", wake);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityWake);
    }
  };
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
  const sessionId =
    record.sessionId && SESSION_ID_PATTERN.test(record.sessionId)
      ? record.sessionId
      : await getArchiveAiSessionId();
  const value: ArchiveAiPendingRecord = {
    ...record,
    sessionId,
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
