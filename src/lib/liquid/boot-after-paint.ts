type BootLiquidGlass = typeof import("./boot.js").bootLiquidGlass;
let boot: BootLiquidGlass | undefined;

// Keep the renderer out of the initial module graph. A caller can cancel
// while the module loads, so it will never initialize a departed surface.
export function scheduleLiquidGlassBoot(mount: (boot: BootLiquidGlass) => void) {
  let active = true;
  const frame = window.requestAnimationFrame(() => {
    if (boot) {
      mount(boot);
      return;
    }
    void import("./boot.js").then(
      (module) => {
        boot = module.bootLiquidGlass;
        if (active) mount(boot);
      },
      () => {
        // The native controls and CSS fallback remain available.
      },
    );
  });
  return () => {
    active = false;
    window.cancelAnimationFrame(frame);
  };
}

export function bootLiquidGlassAfterPaint() {
  let dispose: (() => void) | undefined;
  const cancel = scheduleLiquidGlassBoot((boot) => {
    dispose = boot(document);
  });
  return () => {
    cancel();
    dispose?.();
  };
}
