import { useEffect, useState } from "react";

/** Keep the independent 3D room on its original-image SSR fallback until the
 * owning route has committed. This readiness is not a graphics-mode setting. */
export function useExhibitionArtworkReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
