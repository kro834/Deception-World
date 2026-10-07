import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getUltraModeServerSnapshot,
  getUltraModeSnapshot,
  subscribeUltraMode,
} from "@/lib/ultra-mode.js";
import { watchUltraSceneVisibility } from "@/lib/ultra-mode-visibility.js";
import {
  getUltraQualityServerSnapshot,
  getUltraQualitySnapshot,
  subscribeUltraQuality,
  type UltraQuality,
} from "@/lib/ultra-quality.js";

// Neither this chunk nor the shader code is requested during ordinary browsing.
const UltraEffects = lazy(() =>
  import("./ultra-effects").then((module) => ({ default: module.UltraEffects })),
);

class UltraRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    document.documentElement.setAttribute("data-ultra-renderer", "error");
  }
  render() {
    // Static CSS materials remain available after a renderer/import failure.
    return this.state.failed ? null : this.props.children;
  }
}

function UltraModeSession({
  motionAllowed,
  quality,
}: {
  motionAllowed: boolean;
  quality: UltraQuality;
}) {
  const [blocked, setBlocked] = useState(true);
  const [activated, setActivated] = useState(false);
  useEffect(() => watchUltraSceneVisibility(setBlocked), []);
  useEffect(() => {
    const root = document.documentElement;
    if (blocked || !motionAllowed) root.setAttribute("data-ultra-paused", "true");
    else {
      root.removeAttribute("data-ultra-paused");
      setActivated(true);
    }
  }, [blocked, motionAllowed]);
  useEffect(
    () => () => {
      const root = document.documentElement;
      root.removeAttribute("data-ultra-paused");
      root.removeAttribute("data-ultra-renderer");
    },
    [],
  );
  if (!activated || !motionAllowed) return null;
  return (
    <UltraRenderBoundary>
      <Suspense fallback={null}>
        {/* The renderer independently checks live gates, including after lazy import.
            Temporary UI locks pause; only OFF/accessibility changes dispose. */}
        <UltraEffects enabled motionAllowed={motionAllowed} quality={quality} />
      </Suspense>
    </UltraRenderBoundary>
  );
}

export function UltraModeRuntime() {
  const snapshot = useSyncExternalStore(
    subscribeUltraMode,
    getUltraModeSnapshot,
    getUltraModeServerSnapshot,
  );
  const quality = useSyncExternalStore(
    subscribeUltraQuality,
    getUltraQualitySnapshot,
    getUltraQualityServerSnapshot,
  );
  return snapshot.ready && snapshot.enabled && quality.ready ? (
    <UltraModeSession motionAllowed={snapshot.motionAllowed} quality={quality.quality} />
  ) : null;
}
