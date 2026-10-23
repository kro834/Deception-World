import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { WORLD_CAST_ROSTER } from "./world-annex-data";
import {
  createCastDirectoryNavigation,
  watchCastDirectoryHash,
  watchCastDirectoryRouter,
  type CastDirectoryFilter,
} from "./world-cast-directory-model";

export function useWorldCastDirectory() {
  const [filter, updateFilter] = useState<CastDirectoryFilter>("all");
  const filterRef = useRef(filter);
  const router = useRouter();
  const routerHash = useRouterState({ select: (state) => state.location.hash });
  const navigation = useMemo(
    () =>
      createCastDirectoryNavigation({
        entries: WORLD_CAST_ROSTER,
        getFilter: () => filterRef.current,
        revealAll: () => {
          filterRef.current = "all";
          updateFilter("all");
        },
        getHash: () => window.location.hash,
        getTarget: (id) => document.getElementById(id),
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (frame) => cancelAnimationFrame(frame),
      }),
    [],
  );
  const setFilter = useCallback(
    (next: CastDirectoryFilter) => {
      navigation.cancel();
      filterRef.current = next;
      updateFilter(next);
    },
    [navigation],
  );

  useLayoutEffect(() => navigation.navigate(routerHash), [navigation, routerHash]);
  useLayoutEffect(() => navigation.afterCommit(), [navigation, filter, routerHash]);
  useEffect(
    () =>
      watchCastDirectoryRouter(
        (navigate) =>
          router.subscribe("onBeforeNavigate", ({ toLocation }) => navigate(toLocation)),
        navigation,
      ),
    [navigation, router],
  );
  useEffect(() => {
    const stop = watchCastDirectoryHash(window, () => navigation.navigate(window.location.hash));
    return () => {
      stop();
      navigation.cancel();
    };
  }, [navigation]);
  return { filter, setFilter };
}
