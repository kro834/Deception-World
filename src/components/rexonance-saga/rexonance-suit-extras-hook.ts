import type { SuitExtras, SuitExtrasEnv } from "./rexonance-suit-extras";

/* Round 3 (review 33): the call's extras (rexonance-suit-extras, with the
   nanite kit's warm-up) are their own chunk, loaded only by the kit's
   warm-up (rexonance-nanites-warmup), and register here once loaded. The
   call's engine (rexonance-suit-nanites) reaches them through this hook
   alone, so the call's chunk never imports them: a still tier (reduced
   motion, economy, Save-Data) never downloads the kit's code. Until they
   register, the call plays its classic engine. */
export type SuitExtrasApi = {
  /** Prepared, and every kit sheet decoded. */
  ready: () => boolean;
  create: (env: SuitExtrasEnv) => SuitExtras | null;
  /** After a call: give back the prepared sheets (the next route's warm
   * prepares them again). */
  release: () => void;
};

let api: SuitExtrasApi | null = null;

export function registerSuitExtras(hooks: SuitExtrasApi) {
  api = hooks;
}

export const suitExtrasApi = () => api;
