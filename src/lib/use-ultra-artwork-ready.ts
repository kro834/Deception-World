import { useEffect, useState } from "react";

/** A portal must not insert children into a route's still-unhydrated SSR DOM.
 * Each artwork owner exposes this marker only after its own React commit. */
export function useUltraArtworkReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
