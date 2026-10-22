/* FAR FROM SAGA — the entry transition's clock (2026-10-22).

   The seven transformation calls (FAR_FROM_SAGA.calls, verbatim) are the
   beats; the suit-up scene (far-from-assembly-scene.ts) plays along them,
   its progress a closed-form function of the elapsed time: the nanites
   gather on the first call, the legs form on REXONANCE！, the waist and
   arms on SUPER SPECIAL！, the chest and head on RIDER！FAR FROM！, the
   crystal and the core light through the chant, the bits dock one per
   FAR FROM！, and the halo closes on FAR FROM DEUS！. No fire: that is
   Rexonance's. Pure: no browser reads, so the component and the tests
   share it. */

import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";

export const FAR_FROM_ENTRY_CALLS: readonly string[] = FAR_FROM_SAGA.calls;

export type FarFromEntryBeat = {
  readonly call: string;
  readonly start: number;
  readonly duration: number;
  /** The scene's progress over the beat. */
  readonly from: number;
  readonly to: number;
  /** The call's units (a chant's repeats), lit one after another. */
  readonly units: readonly string[];
};

/** A call's units: a repeated chant splits into its repeats (the closing
 * marks stay on the last), anything else is one unit. Joined, the units
 * are the call, exactly. */
export function farFromCallUnits(call: string): readonly string[] {
  const repeats = call.match(/SA-GA！DEUS！|FAR FROM！/g);
  if (!repeats || repeats.length < 2) return [call];
  const body = repeats.join("");
  if (!call.startsWith(body)) return [call];
  const tail = call.slice(body.length);
  if (tail && !/^！+$/.test(tail)) return [call];
  const units = [...repeats];
  units[units.length - 1] += tail;
  return units;
}

const DURATIONS = [880, 620, 620, 900, 1680, 1480, 1120] as const;
const PROGRESS = [0.1, 0.3, 0.52, 0.7, 0.84, 0.92, 1] as const;

const beats: FarFromEntryBeat[] = [];
let clock = 0;
FAR_FROM_ENTRY_CALLS.forEach((call, index) => {
  const duration = DURATIONS[index] ?? 800;
  beats.push({
    call,
    start: clock,
    duration,
    from: index ? PROGRESS[index - 1] : 0,
    to: PROGRESS[index] ?? 1,
    units: farFromCallUnits(call),
  });
  clock += duration;
});

export const FAR_FROM_ENTRY_BEATS: readonly FarFromEntryBeat[] = beats;

export const FAR_FROM_ENTRY_TIMINGS = Object.freeze({
  /** The calls' whole length. */
  total: clock,
  /** The finished figure holds this long before the overlay leaves. */
  hold: 520,
  /** The overlay's fade (CSS: --ffs-entry-reveal). */
  reveal: 720,
  /** The overlay's fade-in. */
  cover: 360,
  /** How long the entry waits for its chunk and picture before it is
   * skipped; and for the route's cover to settle. */
  deadline: 2600,
  gate: 5000,
});

const smooth = (u: number) => u * u * (3 - 2 * u);

/** The scene's progress at `ms` on the entry's clock: each beat eases its
 * share in, so the figure forms call by call. Monotone, 0 before the first
 * beat, 1 from the last beat's end. */
export function farFromEntryProgress(ms: number): number {
  if (!(ms > 0)) return 0;
  for (const beat of FAR_FROM_ENTRY_BEATS) {
    if (ms < beat.start + beat.duration) {
      const local = (ms - beat.start) / beat.duration;
      return beat.from + (beat.to - beat.from) * smooth(local < 0 ? 0 : local);
    }
  }
  return 1;
}

/** Which beat and which of its units are live at `ms` (-1 before the
 * first; the last beat holds after the end). */
export function farFromEntryBeat(ms: number): { index: number; unit: number } {
  if (!(ms >= 0)) return { index: -1, unit: 0 };
  for (let index = 0; index < FAR_FROM_ENTRY_BEATS.length; index += 1) {
    const beat = FAR_FROM_ENTRY_BEATS[index];
    if (ms < beat.start + beat.duration) {
      const local = (ms - beat.start) / beat.duration;
      const unit = Math.min(beat.units.length - 1, Math.floor(local * beat.units.length));
      return { index, unit };
    }
  }
  const last = FAR_FROM_ENTRY_BEATS.length - 1;
  return { index: last, unit: FAR_FROM_ENTRY_BEATS[last].units.length - 1 };
}
