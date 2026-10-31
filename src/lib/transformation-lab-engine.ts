import type { LabRider } from "./transformation-lab-state.js";
import type { RexonanceAssemblyConfig } from "./rexonance-resonance.js";

export async function loadLabConfig(rider: LabRider): Promise<RexonanceAssemblyConfig> {
  switch (rider) {
    case "far-from":
      return (await import("./far-from-assembly-engine")).farFromAssemblyConfig();
    case "illusionculum": {
      const [engine, accents, suit] = await Promise.all([
        import("./illusionculum-assembly-engine"),
        import("./illusionculum-assembly-accents"),
        import("./illusionculum-suit"),
      ]);
      const config = engine.illusionculumAssemblyConfig();
      const compact = window.matchMedia("(any-pointer: coarse), (max-width: 767px)").matches;
      config.accents = accents.createIllusionculumAccents({
        size: suit.ILLUSIONCULUM_SUIT_SIZE,
        pieces: suit.ILLUSIONCULUM_SUIT_PIECES,
        core: suit.ILLUSIONCULUM_SUIT_MARKS.core,
        seams: suit.ILLUSIONCULUM_SUIT_SEAMS,
        budget: accents.illusionculumAccentBudget(window, { compact, entry: false }),
      });
      return config;
    }
    case "meta-unitas":
      return (await import("./meta-unitas-rx-engine")).metaUnitasAssemblyConfig();
    default:
      return (await import("./transformation-lab-rexonance")).rexonanceLabConfig();
  }
}
