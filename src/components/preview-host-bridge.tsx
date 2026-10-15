/**
 * Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
 * (and later receive registered routes). Noops when the app is not embedded.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { loadPreviewHostBridge } from "@/lib/preview-host-bridge-loader";

export function PreviewHostBridge() {
  const router = useRouter();

  useEffect(() => {
    return loadPreviewHostBridge({
      navigate: (path) => {
        router.history.push(path);
      },
      routeTree: router.routeTree,
    });
  }, [router]);

  return null;
}
