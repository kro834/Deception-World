/** The entry's fire clock: the undersuit scan ends at `ignite`, the 爆散 is at `burst` (ms). */
export const FAR_FROM_ENTRY_FIRE: Readonly<{ ignite: number; burst: number }>;
/** The shared fire's phase at entry `t` ms. */
export function farFromFlamePhase(t: number): number;
/** The entry ms at which the fire reaches `phase`. */
export function farFromFlameTime(phase: number): number;
/** The first fragments have cooled into chips (ms). */
export const FAR_FROM_ENTRY_MATERIAL: number;
/** The last of the fire is gone (ms). */
export const FAR_FROM_ENTRY_FLAME_END: number;
/** A tile's landing time with the earliest growth held until the material is there. */
export function farFromMaterialLanding(land: number, fit: number): number;
