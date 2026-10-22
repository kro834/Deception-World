/* FAR FROM SAGA's entry transformation: the gate's two numbers (owner,
   2026-10-22: 「遷移画面の変身アニメーション」, as Rexonance's
   REXONANCE_ENTRY_TIMINGS in rexonance-calls.ts). Its own light module: the
   route transition screen (load-gate.tsx) reads these on every page, and
   the calls' full module (far-from-entry-calls.ts, with the record's words
   and the cascade) stays in the sequence's own chunk. */

/** The gate covers the page this long (the six beats, FAR FROM DEUS！ held
 * at the end), then reveals it over `reveal`. */
export const FAR_FROM_ENTRY_TIMINGS = { cover: 3240, reveal: 480 } as const;
/** The entry plays with the finished figure if its pieces are not decoded
 * when it starts; it switches to the build only while the scan runs. */
export const FAR_FROM_ENTRY_LATE_MS = 300;
