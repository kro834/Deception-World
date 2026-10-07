import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Link, useRouter } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock";
import { GALLERY_ARTWORKS, GALLERY_CATEGORIES } from "./gallery-data";
import {
  communityPostToArtwork,
  createGalleryAuthClient,
  deleteCommunityGalleryImage,
  ensureGalleryWriteSession,
  GalleryRequestError,
  galleryNumberFor as numberFor,
  isCommunityGalleryId,
  postCommunityGalleryImage,
  prepareCommunityUpload,
  readCommunityGallery,
  readCommunityGalleryConfig,
  restoreCommunityGalleryImage,
  subscribeGallerySession,
  updateCommunityGalleryTitle,
  type CommunityGalleryPost,
  type CommunityGalleryTitle,
  type CommunityGalleryTitles,
  type GalleryCollectionArtwork,
} from "./gallery-community-client";
import {
  filterGalleryArtworks,
  GALLERY_FAVORITES_KEY,
  readGalleryFavorites,
  toggleGalleryFavorite,
  type GalleryFavorites,
} from "./gallery-discovery";
import { GalleryCurtain } from "./gallery-curtain";
import { GalleryViewerImage } from "./gallery-viewer-image";
import { GalleryShareControl } from "./gallery-share-control";
import { GallerySearchControls } from "./gallery-search-controls";
import { GalleryBackgroundControl, GalleryDisplaySettings } from "./gallery-display-settings";
import { useGalleryDisplayPreferences } from "./use-gallery-display-preferences";
import {
  galleryArtworkHref,
  galleryWithoutArtwork,
  planGalleryArtworkEntry,
  readGalleryArtworkLink,
} from "./gallery-artwork-link";
import {
  galleryAdjacentId,
  galleryLayoutTop,
  galleryRevealDelta,
  galleryViewerSequence,
  readGalleryViewerRecord,
  settleGalleryViewerReturn,
} from "./gallery-viewer-state";
import { GALLERY_FEATURE_KEY, readGalleryFeature, saveGalleryFeature } from "./gallery-feature";
import {
  GALLERY_TITLE_LIMIT,
  GALLERY_TITLES_KEY,
  readGalleryTitles,
  type GalleryTitles,
} from "./gallery-titles";

const imageSizes = "(max-width: 640px) 46vw, (max-width: 1000px) 30vw, 22vw";

function revealGalleryControl(control: HTMLElement | null) {
  const header = control?.closest<HTMLElement>(".gallery-viewer-header");
  if (!header || !control) return;
  const top = galleryRevealDelta(control.getBoundingClientRect(), header.getBoundingClientRect());
  if (top) header.scrollBy({ top, behavior: "instant" });
}

export function GalleryPage() {
  useWorldMode();
  const router = useRouter();
  const display = useGalleryDisplayPreferences();
  // The history entry the open viewer adds, so Back closes it in place.
  const viewerEntryRef = useRef(false);
  const readingAtRef = useRef({ top: 0, left: 0 });
  const openerTopRef = useRef<number | null>(null);
  const finishReturnRef = useRef<(() => void) | null>(null);
  const viewerActiveRef = useRef(false);
  const viewerIdRef = useRef<string | null>(null);
  const preparingLinkRef = useRef(false);
  const backdropPointerRef = useRef(false);
  const [linkNotice, setLinkNotice] = useState<"waiting" | "error" | "missing" | "invalid" | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<(typeof GALLERY_CATEGORIES)[number]["id"] | "community">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"number" | "newest">("number");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<GalleryFavorites>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [featureMessage, setFeatureMessage] = useState("");
  const [featureError, setFeatureError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharedTitles, setSharedTitles] = useState<CommunityGalleryTitles>({});
  const [legacyTitles, setLegacyTitles] = useState<GalleryTitles>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [arriving, setArriving] = useState(true);
  const [communityPosts, setCommunityPosts] = useState<CommunityGalleryPost[]>([]);
  const [deletedPosts, setDeletedPosts] = useState<CommunityGalleryPost[]>([]);
  const [communityReady, setCommunityReady] = useState(false);
  const [communityConfigChecked, setCommunityConfigChecked] = useState(false);
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [communityBusy, setCommunityBusy] = useState(false);
  const [communityMessage, setCommunityMessage] = useState("");
  const [communityError, setCommunityError] = useState("");
  const [communityLoadError, setCommunityLoadError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [editingVersion, setEditingVersion] = useState(0);
  const [titleConflict, setTitleConflict] = useState<CommunityGalleryTitle | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const communityInputRef = useRef<HTMLInputElement>(null);
  const communityReloadRef = useRef<(() => Promise<boolean>) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState("");
  const [justRefreshed, setJustRefreshed] = useState(false);
  const communityBusyRef = useRef(false);
  const authClientRef = useRef<SupabaseClient | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocusRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);
  const viewerWorksRef = useRef<GalleryCollectionArtwork[]>([]);
  const allArtworksRef = useRef<GalleryCollectionArtwork[]>([]);
  const communityWorks = useMemo(
    () => communityPosts.map(communityPostToArtwork),
    [communityPosts],
  );
  const allArtworks = useMemo(() => [...GALLERY_ARTWORKS, ...communityWorks], [communityWorks]);
  const titles = useMemo(
    () => Object.fromEntries(Object.entries(sharedTitles).map(([id, entry]) => [id, entry.title])),
    [sharedTitles],
  );
  const allArtworkIds = useMemo(() => allArtworks.map((work) => work.id), [allArtworks]);
  const works = useMemo(() => {
    const filtered = filterGalleryArtworks(allArtworks, {
      category,
      query,
      favoritesOnly,
      favorites,
      titles,
    });
    return order === "newest" ? filtered.reverse() : filtered;
  }, [allArtworks, category, query, favoritesOnly, favorites, titles, order]);
  const selected =
    GALLERY_ARTWORKS.find((work) => work.id === selectedId) ??
    communityWorks.find((work) => work.id === selectedId) ??
    null;
  const navigationSnapshot = viewerWorksRef.current
    .map((work) => allArtworks.find((current) => current.id === work.id))
    .filter((work): work is GalleryCollectionArtwork => Boolean(work));
  const viewerWorks = navigationSnapshot.length ? navigationSnapshot : works;
  const selectedIndex = viewerWorks.findIndex((work) => work.id === selectedId);
  const viewerOpen = selected !== null;
  const neighbors = useMemo(() => {
    if (viewerWorksRef.current.length < 2 || !selectedId) return [];
    const ids = viewerWorksRef.current.map((work) => work.id);
    const adjacent = new Set([
      galleryAdjacentId(ids, selectedId, -1),
      galleryAdjacentId(ids, selectedId, 1),
    ]);
    return allArtworks.filter((work) => adjacent.has(work.id));
    // The sequence is a session snapshot; only its IDs and the selected work matter.
  }, [selectedId, allArtworks]);
  const featured = allArtworks.find((work) => work.id === featuredId) ?? GALLERY_ARTWORKS[2];
  const selectedPost = communityPosts.find((post) => post.id === selectedId);
  const canDeleteSelected = Boolean(session && selectedPost?.canDelete);

  useEffect(() => {
    allArtworksRef.current = allArtworks;
  }, [allArtworks]);

  useEffect(() => {
    setMounted(true);
    const load = () => {
      try {
        setLegacyTitles(readGalleryTitles(window.localStorage));
      } catch {
        setSaveError("このブラウザーでは保存領域を利用できません。");
      }
    };
    const loadFavorites = () => {
      try {
        setFavorites(
          readGalleryFavorites(
            window.localStorage,
            GALLERY_ARTWORKS.map((work) => work.id),
            true,
          ),
        );
      } catch {
        setSaveError("このブラウザーでは保存領域を利用できません。");
      }
    };
    load();
    loadFavorites();
    const loadFeature = () => {
      try {
        setFeaturedId(
          readGalleryFeature(
            window.localStorage,
            GALLERY_ARTWORKS.map((work) => work.id),
          ),
        );
      } catch {
        setFeatureError("このブラウザーではトップ作品の保存領域を利用できません。");
      }
    };
    loadFeature();
    if (document.documentElement.dataset.routeCover) setArriving(false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === GALLERY_TITLES_KEY || event.key === null) load();
      if (event.key === GALLERY_FAVORITES_KEY || event.key === null) loadFavorites();
      if (event.key === GALLERY_FEATURE_KEY || event.key === null) loadFeature();
    };
    window.addEventListener("storage", onStorage);
    // A direct visit opens the cloth too; a managed route entry already owns its curtain.
    const timer = window.setTimeout(() => setArriving(false), 1400);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const connect = async () => {
      try {
        const config = await readCommunityGalleryConfig();
        if (disposed) return;
        if (!config.ready) {
          setCommunityError(
            "共有ギャラリーの接続準備が完了していないため、投稿とタイトル編集は現在利用できません。",
          );
          return;
        }
        const client = await createGalleryAuthClient(config);
        if (disposed) {
          void client.auth.stopAutoRefresh();
          return;
        }
        authClientRef.current = client;
        void client.auth.startAutoRefresh();
        const subscription = subscribeGallerySession(client, setSession);
        unsubscribe = subscription.unsubscribe;
        await subscription.loaded;
        if (disposed) return;
        setCommunityReady(true);
      } catch {
        if (!disposed)
          setCommunityError(
            "共有ギャラリーの接続に失敗しました。ページを再読み込みしてお試しください。",
          );
      } finally {
        if (!disposed) setCommunityConfigChecked(true);
      }
    };
    void connect();
    return () => {
      disposed = true;
      unsubscribe?.();
      void authClientRef.current?.auth.stopAutoRefresh();
      authClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try {
        const collection = await readCommunityGallery(session?.access_token);
        if (disposed || current !== generation) return false;
        setCommunityPosts(collection.posts);
        setDeletedPosts(collection.deletedPosts ?? []);
        setSharedTitles(collection.titles);
        setCommunityLoaded(true);
        setCommunityLoadError("");
        return true;
      } catch (error) {
        if (!disposed && current === generation)
          setCommunityLoadError(
            error instanceof Error ? error.message : "共有作品を読み込めませんでした。",
          );
        return false;
      }
    };
    communityReloadRef.current = refresh;
    const onFocus = () => {
      if (!communityBusyRef.current && !viewerActiveRef.current) void refresh();
    };
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        !communityBusyRef.current &&
        !viewerActiveRef.current
      )
        void refresh();
    };
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !communityBusyRef.current &&
        !viewerActiveRef.current
      )
        void refresh();
    }, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      disposed = true;
      generation++;
      communityReloadRef.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (confirmDelete) {
      confirmDeleteRef.current?.focus({ preventScroll: true });
      revealGalleryControl(confirmDeleteRef.current);
    }
  }, [confirmDelete]);

  useEffect(() => {
    if (editing) {
      titleInputRef.current?.focus({ preventScroll: true });
      revealGalleryControl(titleInputRef.current);
    } else if (restoreEditFocusRef.current) {
      editButtonRef.current?.focus({ preventScroll: true });
      revealGalleryControl(editButtonRef.current);
      restoreEditFocusRef.current = false;
    }
  }, [editing]);

  const resetEditor = () => {
    setEditing(false);
    setSaveMessage("");
    setSaveError("");
    setConfirmDelete(false);
    setTitleConflict(null);
  };
  const cancelEditor = () => {
    restoreEditFocusRef.current = true;
    resetEditor();
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The server-rendered exhibition is always visible. Animation starts only
    // on entry; an unavailable observer never leaves an artwork hidden.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          entry.target.dataset.galleryEnter = "true";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    grid
      .querySelectorAll("[data-gallery-artwork]:not([data-gallery-enter])")
      .forEach((work) => observer.observe(work));
    return () => observer.disconnect();
  }, [works]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!viewerOpen || !dialog) return;
    // Capture before native modal focus can scroll Safari's page.
    const readingAt = readingAtRef.current;
    finishReturnRef.current?.();
    finishReturnRef.current = null;
    viewerActiveRef.current = true;
    document.body.dataset.galleryViewerLock = "true";
    const release = acquireViewportScrollLock({ freezeBody: true });
    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      release();
      delete document.body.dataset.galleryViewerLock;
      viewerActiveRef.current = false;
      setSelectedId(null);
      return;
    }
    dialog.focus({ preventScroll: true });
    const cycleFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      restoreFocusRef.current = true;
      // Listen on the DOM dialog: the shared world button is portalled here
      // from a different React tree, so its events do not bubble through JSX.
      // Explicit cycling also respects button focus on WebKit installations
      // whose native Tab preference skips buttons.
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (node) =>
          node.tabIndex >= 0 &&
          node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== "hidden",
      );
      if (!controls.length) return;
      const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        activeIndex < 0
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (activeIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[nextIndex].focus({ preventScroll: true });
      revealGalleryControl(controls[nextIndex]);
    };
    dialog.addEventListener("keydown", cycleFocus);
    // Freeze the page where the reader left it and put it back exactly on
    // close: an unfrozen page could come back at the top (iOS Safari), and
    // the router's reset for the entry below lands on the frozen body.
    // One history entry per open viewer: a Back gesture closes the artwork
    // and stays in the gallery instead of leaving it (and returning later at
    // the top). Moving between works adds none.
    const viewerId = viewerIdRef.current;
    if (!viewerEntryRef.current && viewerId) {
      const here = router.history.location;
      router.history.push(galleryArtworkHref(here.href, viewerId), {
        ...here.state,
        galleryViewer: {
          id: viewerIdRef.current,
          ids: viewerWorksRef.current.map((work) => work.id),
          position: readingAt,
        },
      });
      viewerEntryRef.current = true;
    }
    return () => {
      dialog.removeEventListener("keydown", cycleFocus);
      if (dialog.open) dialog.close();
      const ownEntry = viewerEntryRef.current;
      viewerEntryRef.current = false;
      const opener = openerRef.current;
      const restoreFocus = restoreFocusRef.current;
      const originalTop = openerTopRef.current;
      restoreFocusRef.current = false;
      const finish = () => {
        // Hero aspect changes and favorite filtering can move the originating card.
        const shiftedTop =
          opener?.isConnected && originalTop !== null
            ? readingAt.top + galleryLayoutTop(opener) - originalTop
            : readingAt.top;
        release();
        delete document.body.dataset.galleryViewerLock;
        viewerActiveRef.current = false;
        finishReturnRef.current = null;
        if (router.history.location.pathname !== "/gallery") return;
        if (Math.abs(window.scrollY - shiftedTop) > 2)
          window.scrollTo({
            top: Math.max(0, shiftedTop),
            left: readingAt.left,
            behavior: "instant",
          });
        if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
        else if (document.activeElement === opener) opener?.blur();
      };
      if (router.history.location.pathname !== "/gallery") {
        finish();
        return;
      }
      finishReturnRef.current = settleGalleryViewerReturn({
        subscribeRendered: (done) => router.subscribe("onRendered", done),
        schedule: (done) => {
          const timer = window.setTimeout(done, 800);
          return () => window.clearTimeout(timer);
        },
        leaveEntry: () => {
          if (
            ownEntry &&
            readGalleryViewerRecord(
              (router.history.location.state as { galleryViewer?: unknown }).galleryViewer,
            )
          )
            router.history.back();
        },
        finish,
      });
    };
    // Changing artworks must not release/reacquire the session's page lock.
  }, [viewerOpen, router]);

  useEffect(() => {
    if (!viewerOpen) return;
    const synchronizePosition = () => {
      const here = router.history.location;
      const record = readGalleryViewerRecord(
        (here.state as { galleryViewer?: unknown }).galleryViewer,
      );
      if (!viewerActiveRef.current || !viewerEntryRef.current || !record) return;
      const opener = openerRef.current;
      const originalTop = openerTopRef.current;
      const top =
        opener?.isConnected && originalTop !== null
          ? Math.max(0, readingAtRef.current.top + galleryLayoutTop(opener) - originalTop)
          : readingAtRef.current.top;
      // Keep Forward's saved position aligned with the same layout correction
      // used on close, including late shared titles and a different hero ratio.
      if (Math.abs(record.position.top - top) > 2)
        router.history.replace(here.href, {
          ...here.state,
          galleryViewer: { ...record, position: { ...record.position, top } },
        });
    };
    synchronizePosition();
    window.addEventListener("resize", synchronizePosition);
    return () => window.removeEventListener("resize", synchronizePosition);
  }, [
    viewerOpen,
    router,
    featuredId,
    works,
    titles,
    display.preferences.density,
    display.status,
    display.error,
  ]);

  useEffect(() => {
    const restore = () => {
      if (preparingLinkRef.current || arriving) return;
      const here = router.history.location;
      const plan = planGalleryArtworkEntry({
        href: here.href,
        viewerState: (here.state as { galleryViewer?: unknown }).galleryViewer,
        availableIds: allArtworksRef.current.map((work) => work.id),
        communityLoaded,
        communityFailed: Boolean(communityLoadError),
      });
      if (plan.kind === "none") {
        restoreFocusRef.current = false;
        setSelectedId(null);
        return;
      }
      if (plan.kind === "waiting") {
        setLinkNotice(plan.failed ? "error" : "waiting");
        return;
      }
      if (plan.kind === "invalid" || plan.kind === "missing") {
        setLinkNotice(plan.kind);
        preparingLinkRef.current = true;
        try {
          router.history.replace(plan.cleanHref, { ...here.state, galleryViewer: undefined });
          // Browser history batches mutations; commit the base before the next push.
          router.history.flush();
        } finally {
          preparingLinkRef.current = false;
        }
        setSelectedId(null);
        return;
      }
      const { record } = plan;
      // A restored community artwork may arrive after hydration. Retrying must
      // not reset an already open viewer or its in-progress title editor.
      if (viewerActiveRef.current && viewerIdRef.current === record.id) return;
      restoreFocusRef.current = false;
      const sequence = record.ids
        .map((id) => allArtworksRef.current.find((work) => work.id === id))
        .filter((work): work is GalleryCollectionArtwork => Boolean(work));
      if (!sequence.some((work) => work.id === record.id)) return;
      finishReturnRef.current?.();
      if (plan.cleanHref !== null) {
        // First arrival has no gallery underneath it. Replace that entry first;
        // the normal viewer effect then adds its one, Back-closeable entry.
        preparingLinkRef.current = true;
        try {
          router.history.replace(plan.cleanHref, { ...here.state, galleryViewer: undefined });
          // Browser history batches mutations; commit the base before the next push.
          router.history.flush();
        } finally {
          preparingLinkRef.current = false;
        }
      }
      readingAtRef.current = record.position;
      openerRef.current =
        plan.cleanHref !== null
          ? null
          : document.querySelector<HTMLElement>(
              `[data-gallery-artwork="${CSS.escape(record.id)}"] .gallery-work-open`,
            );
      window.scrollTo({ ...record.position, behavior: "instant" });
      openerTopRef.current = openerRef.current ? galleryLayoutTop(openerRef.current) : null;
      viewerWorksRef.current = sequence;
      viewerIdRef.current = record.id;
      viewerEntryRef.current = plan.cleanHref === null;
      setLinkNotice(null);
      setEditing(false);
      setSaveMessage("");
      setSaveError("");
      setConfirmDelete(false);
      setTitleConflict(null);
      setSelectedId(record.id);
    };
    restore();
    return router.history.subscribe(restore);
  }, [router, communityLoaded, communityLoadError, arriving]);

  useEffect(
    () => () => {
      finishReturnRef.current?.();
    },
    [],
  );

  const openWork = (event: MouseEvent<HTMLAnchorElement>, work: GalleryCollectionArtwork) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    finishReturnRef.current?.();
    const here = router.history.location;
    if (readGalleryArtworkLink(here.href).kind !== "none") {
      preparingLinkRef.current = true;
      try {
        router.history.replace(galleryWithoutArtwork(here.href), {
          ...here.state,
          galleryViewer: undefined,
        });
        router.history.flush();
      } finally {
        preparingLinkRef.current = false;
      }
    }
    setLinkNotice(null);
    readingAtRef.current = { top: window.scrollY, left: window.scrollX };
    openerRef.current = event.currentTarget;
    openerTopRef.current = galleryLayoutTop(event.currentTarget);
    restoreFocusRef.current = event.detail === 0;
    viewerWorksRef.current = galleryViewerSequence(allArtworks, works, work);
    viewerIdRef.current = work.id;
    resetEditor();
    setSelectedId(work.id);
  };
  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      try {
        setLegacyTitles(readGalleryTitles(window.localStorage));
      } catch {
        // The shared titles below do not need this browser's storage.
      }
      const ok = (await communityReloadRef.current?.()) ?? false;
      const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      setRefreshedAt(ok ? `${time} 更新` : "更新できませんでした");
      if (ok) {
        setJustRefreshed(true);
        window.setTimeout(() => setJustRefreshed(false), 2400);
      }
    } finally {
      setRefreshing(false);
    }
  };
  const closeViewer = () => {
    resetEditor();
    dialogRef.current?.close();
    setSelectedId(null);
    viewerWorksRef.current = [];
  };
  const moveWork = (step: number) => {
    if (editing || confirmDelete || communityBusy) return;
    const next = galleryAdjacentId(
      viewerWorks.map((work) => work.id),
      selectedId ?? "",
      step,
    );
    if (next) {
      resetEditor();
      viewerIdRef.current = next;
      setSelectedId(next);
      const here = router.history.location;
      const record = readGalleryViewerRecord(
        (here.state as { galleryViewer?: unknown }).galleryViewer,
      );
      if (record)
        router.history.replace(galleryArtworkHref(here.href, next), {
          ...here.state,
          galleryViewer: { ...record, id: next },
        });
    }
  };
  const changeFavorite = (id: string) => {
    try {
      setFavorites(toggleGalleryFavorite(window.localStorage, id, allArtworkIds));
      setSaveError("");
    } catch {
      setSaveError(
        "お気に入りを保存できませんでした。ブラウザーの保存設定や空き容量をご確認ください。",
      );
    }
  };
  const resetDiscovery = () => {
    setQuery("");
    setCategory("all");
    setFavoritesOnly(false);
  };
  const changeFeature = (id: string | null) => {
    try {
      saveGalleryFeature(window.localStorage, id, allArtworkIds);
      setFeaturedId(id);
      setFeatureError("");
      setFeatureMessage(
        id
          ? "トップ作品を保存しました。自分の表示だけに反映されます。"
          : "トップ作品を初期設定に戻しました。",
      );
    } catch {
      setFeatureError(
        "トップ作品を保存できませんでした。ブラウザーの保存設定や空き容量をご確認ください。",
      );
    }
  };

  const accessToken = async () => {
    const client = authClientRef.current;
    if (!client) throw new Error("投稿設定の準備中です。しばらくしてからお試しください。");
    const activeSession = await ensureGalleryWriteSession(client);
    return activeSession.access_token;
  };
  const addCommunityImages = async (files: File[]) => {
    if (!files.length || communityBusyRef.current) return;
    if (files.length > 5) {
      setCommunityError("一度に選べる画像は5枚までです。");
      return;
    }
    communityBusyRef.current = true;
    setCommunityBusy(true);
    setCommunityMessage("");
    setCommunityError("");
    let added = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        if (!communityReloadRef.current) break;
        setCommunityMessage(
          `${added + failures.length + 1} / ${files.length}点目の画像を確認して公開しています…`,
        );
        try {
          const token = await accessToken();
          const prepared = await prepareCommunityUpload(file);
          if (!communityReloadRef.current) break;
          await postCommunityGalleryImage(prepared, token);
          added++;
        } catch (error) {
          failures.push(
            `${file.name}：${error instanceof Error ? error.message : "投稿できませんでした。"}`,
          );
        }
      }
      if (added) {
        await communityReloadRef.current?.();
        setCategory("community");
        setQuery("");
        setFavoritesOnly(false);
      }
      if (communityReloadRef.current) {
        setPendingImages([]);
        setCommunityMessage(added ? `${added}点を公開しました。すべての訪問者が見られます。` : "");
        setCommunityError(
          failures.slice(0, 3).join("\n") +
            (failures.length > 3 ? `\nほか${failures.length - 3}点を追加できませんでした。` : ""),
        );
      }
    } finally {
      communityBusyRef.current = false;
      if (communityReloadRef.current) setCommunityBusy(false);
    }
  };
  const cancelDelete = () => {
    setConfirmDelete(false);
    deleteButtonRef.current?.focus({ preventScroll: true });
  };
  const removeCommunityImage = async () => {
    if (!selected || !canDeleteSelected || communityBusyRef.current) return;
    const work = selected;
    communityBusyRef.current = true;
    setCommunityBusy(true);
    setSaveError("");
    try {
      await deleteCommunityGalleryImage(work.id, await accessToken());
      closeViewer();
      await communityReloadRef.current?.();
      if (communityReloadRef.current)
        setCommunityMessage(
          `${numberFor(work)}を非公開にしました。「非公開にした投稿」から復元できます。`,
        );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "投稿を非公開にできませんでした。");
    } finally {
      communityBusyRef.current = false;
      if (communityReloadRef.current) setCommunityBusy(false);
    }
  };
  const restoreCommunityImage = async (post: CommunityGalleryPost) => {
    if (communityBusyRef.current) return;
    communityBusyRef.current = true;
    setCommunityBusy(true);
    setCommunityError("");
    try {
      await restoreCommunityGalleryImage(post.id, await accessToken());
      await communityReloadRef.current?.();
      setCommunityMessage(`${numberFor(communityPostToArtwork(post))}を公開展示に戻しました。`);
    } catch (error) {
      setCommunityError(error instanceof Error ? error.message : "投稿を復元できませんでした。");
    } finally {
      communityBusyRef.current = false;
      setCommunityBusy(false);
    }
  };
  const beginTitleEdit = async (initial = selected ? (titles[selected.id] ?? "") : "") => {
    if (!selected || !communityReady || !communityLoaded || communityBusyRef.current) return;
    communityBusyRef.current = true;
    setCommunityBusy(true);
    setSaveError("");
    try {
      await accessToken();
      if (!communityReloadRef.current) return;
      setDraft(initial);
      setEditingVersion(sharedTitles[selected.id]?.version ?? 0);
      setTitleConflict(null);
      setSaveMessage("");
      setEditing(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "投稿設定の準備中です。");
    } finally {
      communityBusyRef.current = false;
      setCommunityBusy(false);
    }
  };
  const publishTitle = async () => {
    if (!selected || communityBusyRef.current || titleConflict) return;
    const work = selected;
    communityBusyRef.current = true;
    setCommunityBusy(true);
    setSaveError("");
    try {
      const entry = await updateCommunityGalleryTitle(
        work.id,
        draft,
        editingVersion,
        await accessToken(),
      );
      setSharedTitles((current) => ({ ...current, [work.id]: entry }));
      setSaveMessage("タイトルを公開しました。すべての訪問者に表示されます。");
      restoreEditFocusRef.current = true;
      setEditing(false);
      await communityReloadRef.current?.();
    } catch (error) {
      if (error instanceof GalleryRequestError && error.status === 409 && error.current) {
        setTitleConflict(error.current);
        setSharedTitles((current) => ({ ...current, [work.id]: error.current! }));
        setSaveError(
          "編集中に別の利用者がタイトルを変更しました。最新のタイトルを確認してから再編集してください。下書きは残しています。",
        );
      } else
        setSaveError(error instanceof Error ? error.message : "タイトルを公開できませんでした。");
    } finally {
      communityBusyRef.current = false;
      setCommunityBusy(false);
    }
  };

  return (
    <div id="gallery-top" className="world gallery-page" data-gallery-page="true">
      {mounted &&
        createPortal(<div className="gallery-statusbar-cover" aria-hidden="true" />, document.body)}
      {arriving && (
        <div className="gallery-arrival">
          <GalleryCurtain phase="revealing" />
        </div>
      )}
      <header className="gallery-topbar">
        <Link className="gallery-brand" to="/world">
          DECEPTION WORLD<span>VISUAL COLLECTION</span>
        </Link>
        <div className="gallery-topbar-actions">
          {/* Pull everyone's latest titles and posts now, rather than at the
              next 30-second refresh. */}
          <button
            type="button"
            className="gallery-refresh"
            onClick={refreshNow}
            // Busy, not disabled: a disabled control drops its focus to the
            // body, which sent a pointer press back to the top of the page.
            aria-disabled={refreshing}
            data-busy={refreshing ? "true" : undefined}
            aria-describedby="gallery-refresh-status"
          >
            <span aria-hidden="true">↻</span>
            {refreshing ? "更新中" : justRefreshed ? "更新済み" : "更新"}
          </button>
          <span id="gallery-refresh-status" className="gallery-refresh-status" aria-live="polite">
            {refreshedAt}
          </span>
          <a href="#gallery-collection">作品を見る</a>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <main id="gallery-main">
        {linkNotice && (
          <div className="gallery-link-notice">
            <p role="status">
              {linkNotice === "waiting"
                ? "リンク先の投稿作品を読み込んでいます。"
                : linkNotice === "error"
                  ? "リンク先の投稿作品を読み込めませんでした。更新して、もう一度確認できます。"
                  : linkNotice === "missing"
                    ? "リンク先の作品は公開されていないか、見つかりません。ほかの作品は引き続き鑑賞できます。"
                    : "この作品リンクは読み取れませんでした。ギャラリーから作品を選んでください。"}
            </p>
            {linkNotice === "error" && (
              <button
                type="button"
                className="gallery-viewer-close"
                aria-disabled={refreshing}
                onClick={refreshNow}
              >
                {refreshing ? "更新中…" : "もう一度読み込む"}
              </button>
            )}
          </div>
        )}
        <section
          className="gallery-intro"
          data-feature-shape={featured.width < featured.height ? "portrait" : "landscape"}
          style={{ ["--gallery-feature-ratio" as string]: featured.width / featured.height }}
          aria-labelledby="gallery-title"
        >
          <div className="gallery-intro-copy">
            <p className="gallery-eyebrow">DECEPTION WORLD / GALLERY</p>
            <h1 id="gallery-title">
              <span className="gallery-title-opening">光と影の、</span>
              <span>展示室。</span>
            </h1>
            <p className="gallery-intro-description">
              <span>戦いの一瞬から、静かな横顔まで。</span>
              <span>
                <span className="gallery-copy-phrase">ディセプションワールドの景色を、</span>
                <span className="gallery-copy-phrase">一点ずつ巡るギャラリー。</span>
              </span>
            </p>
            <a className="gallery-enter" href="#gallery-collection">
              展示室へ<span aria-hidden="true">↓</span>
            </a>
            <p className="gallery-tour-invitation">
              <Link to="/gallery-tours">
                テーマから作品を巡る <span aria-hidden="true">↗</span>
              </Link>
              <span>光や構図を手がかりに選ぶ、５つの展示ツアー。</span>
            </p>
            <p className="gallery-edition">
              COLLECTION <b>{GALLERY_ARTWORKS.length}</b> WORKS
            </p>
          </div>
          <figure className="gallery-feature">
            <a
              className="gallery-feature-open"
              href={featured.full}
              onClick={(event) => openWork(event, featured)}
              aria-haspopup="dialog"
              aria-controls="gallery-viewer"
              aria-label={`${numberFor(featured)}を拡大して鑑賞`}
            >
              <img
                src={featured.medium}
                srcSet={featured.srcSet}
                sizes="(max-width: 760px) 90vw, 56vw"
                alt={featured.alt}
                width={featured.width}
                height={featured.height}
                fetchPriority="high"
                decoding="async"
              />
            </a>
            <figcaption>
              <span>{numberFor(featured)}</span>
              {titles[featured.id] && <span>{titles[featured.id]}</span>}
            </figcaption>
            <div className="gallery-feature-settings">
              <a href="#gallery-collection">トップ作品を選ぶ</a>
              {featuredId && (
                <button type="button" onClick={() => changeFeature(null)}>
                  初期設定に戻す
                </button>
              )}
              <p>
                作品を拡大して「トップに飾る」を選択。自分の表示だけに反映され、このブラウザーに保存されます。
              </p>
              {featureMessage && <p role="status">{featureMessage}</p>}
              {featureError && <p role="alert">{featureError}</p>}
            </div>
          </figure>
        </section>
        <section
          id="gallery-collection"
          className="gallery-collection"
          aria-labelledby="gallery-collection-title"
        >
          <div className="gallery-collection-heading">
            <div>
              <p className="gallery-eyebrow">THE COLLECTION</p>
              <h2 id="gallery-collection-title">作品を巡る</h2>
            </div>
            <p className="gallery-count" aria-live="polite">
              {works.length} / {allArtworks.length}点を表示
            </p>
          </div>
          <section
            id="gallery-account"
            className="gallery-account"
            aria-labelledby="gallery-account-title"
          >
            <h3 id="gallery-account-title">みんなの展示室</h3>
            <p>
              だれでも画像を投稿し、すべての作品のタイトルを編集できます。登録やログインは不要です。
            </p>
            {!communityReady && (
              <p>
                {communityConfigChecked
                  ? "投稿設定の準備中です。しばらくしてからお試しください。"
                  : "投稿設定を確認しています。"}
              </p>
            )}
          </section>
          <div className="gallery-personal-controls" aria-busy={communityBusy}>
            <div>
              <p id="gallery-community-privacy">
                追加した画像は公開ギャラリーに保存され、すべての訪問者に表示されます。公開してよい画像を選んでください。お気に入りとトップ作品の選択は、自分用の設定としてこのブラウザーに保存されます。
              </p>
              <p>
                追加した画像はこのブラウザーから非公開・復元できます。ブラウザーのデータを消すと管理できなくなります。
              </p>
              <p id="gallery-community-limits">
                JPEG・PNG・WebPの静止画像、元の画像は1枚10MB・4,000万画素まで。一度に5枚選べます。投稿時に長辺2,400px以下へ縮小します。
              </p>
              <p>
                このブラウザーで50枚・合計100MBまで、投稿は1日10回までです。非公開にした投稿も復元用に保存され、枚数と容量に含まれます。
              </p>
            </div>
            <button
              type="button"
              className="gallery-personal-add"
              disabled={!communityReady || communityBusy}
              aria-describedby="gallery-community-privacy gallery-community-limits"
              onClick={() => communityInputRef.current?.click()}
            >
              {communityBusy ? "処理しています…" : "自分の画像を追加"}
            </button>
            <input
              ref={communityInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              aria-label="追加する自分の画像を選択"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (!files.length) return;
                if (files.length > 5) {
                  setCommunityError("一度に選べる画像は5枚までです。");
                  return;
                }
                setPendingImages(files);
                setCommunityError("");
                setCommunityMessage("");
              }}
            />
            {pendingImages.length > 0 && (
              <div className="gallery-pending-images">
                <p>
                  {pendingImages.length}
                  点を選択しました。「投稿する」を押すと、すべての訪問者に公開されます。
                </p>
                <ul>
                  {pendingImages.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      {file.name}（{(file.size / (1024 * 1024)).toFixed(1)}MB）
                    </li>
                  ))}
                </ul>
                <div className="gallery-viewer-actions">
                  <button
                    type="button"
                    className="gallery-personal-add"
                    disabled={communityBusy || !communityReady}
                    onClick={() => {
                      void addCommunityImages(pendingImages);
                    }}
                  >
                    投稿する
                  </button>
                  <button
                    type="button"
                    className="gallery-viewer-close"
                    disabled={communityBusy}
                    onClick={() => setPendingImages([])}
                  >
                    選択を取り消す
                  </button>
                </div>
              </div>
            )}
          </div>
          {!communityLoaded && !communityLoadError && (
            <p className="gallery-save-message" role="status">
              共有作品を読み込んでいます。
            </p>
          )}
          {communityMessage && (
            <p className="gallery-personal-message" role="status">
              {communityMessage}
            </p>
          )}
          {(communityError || communityLoadError) && (
            <p className="gallery-personal-message is-error" role="alert">
              {[communityError, communityLoadError].filter(Boolean).join("\n")}
            </p>
          )}
          {session && deletedPosts.length > 0 && (
            <details className="gallery-deleted-posts">
              <summary>非公開にした投稿（{deletedPosts.length}点）</summary>
              <ul>
                {deletedPosts.map((post) => (
                  <li key={post.id}>
                    <span>{numberFor(communityPostToArtwork(post))}</span>
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      disabled={communityBusy}
                      onClick={() => {
                        void restoreCommunityImage(post);
                      }}
                    >
                      公開展示に戻す
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="gallery-discovery-controls">
            <GallerySearchControls query={query} onQueryChange={setQuery} />
            <button
              type="button"
              className="gallery-favorites-filter"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((current) => !current)}
            >
              お気に入りのみ{" "}
              <span>{allArtworkIds.filter((id) => favorites.includes(id)).length}</span>
            </button>
            <label className="gallery-order">
              <span>並び順</span>
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as "number" | "newest")}
              >
                <option value="number">番号順</option>
                <option value="newest">新しい作品から</option>
              </select>
            </label>
            {(query || category !== "all" || favoritesOnly) && (
              <button type="button" className="gallery-reset-filter" onClick={resetDiscovery}>
                絞り込みを解除
              </button>
            )}
          </div>
          <nav className="gallery-filters" aria-label="展示の分類">
            {GALLERY_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
                <span>
                  {item.id === "all"
                    ? allArtworks.length
                    : allArtworks.filter((work) => work.category === item.id).length}
                </span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={category === "community"}
              onClick={() => setCategory("community")}
            >
              みんなの投稿<span>{communityWorks.length}</span>
            </button>
          </nav>
          <GalleryDisplaySettings
            value={display.preferences}
            onChange={display.update}
            onReset={display.reset}
            status={display.status}
            error={display.error}
          />
          <div
            className="gallery-grid"
            data-gallery-density={display.preferences.density}
            ref={gridRef}
          >
            {works.map((work) => (
              <figure
                className={`gallery-work${work.width > work.height ? " gallery-work-wide" : ""}`}
                style={{ ["--gallery-ar" as string]: (work.width / work.height).toFixed(3) }}
                data-gallery-artwork={work.id}
                key={work.id}
              >
                <a
                  className="gallery-work-open"
                  href={work.full}
                  onClick={(event) => openWork(event, work)}
                  aria-label={`${numberFor(work)}、${work.alt}。拡大して鑑賞`}
                  aria-haspopup="dialog"
                  aria-controls="gallery-viewer"
                >
                  <span className="gallery-work-frame">
                    <img
                      src={work.thumb}
                      srcSet={work.srcSet}
                      sizes={
                        display.preferences.density === "spacious"
                          ? "(max-width: 700px) 92vw, (max-width: 1020px) 75vw, 60vw"
                          : work.width > work.height
                            ? "(max-width: 640px) 92vw, (max-width: 1000px) 60vw, 44vw"
                            : imageSizes
                      }
                      alt={work.alt}
                      width={work.width}
                      height={work.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="gallery-work-hint">
                    拡大して鑑賞 <span aria-hidden="true">↗</span>
                  </span>
                </a>
                <figcaption>
                  <span className="gallery-work-number">{numberFor(work)}</span>
                  {titles[work.id] && <h3>{titles[work.id]}</h3>}
                  <button
                    type="button"
                    className="gallery-favorite-toggle"
                    aria-pressed={favorites.includes(work.id)}
                    aria-label={`${numberFor(work)}を${favorites.includes(work.id) ? "お気に入りから解除" : "お気に入りに追加"}`}
                    onClick={() => changeFavorite(work.id)}
                  >
                    {favorites.includes(work.id) ? "♥ お気に入り" : "♡ お気に入り"}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
          {works.length === 0 && (
            <div className="gallery-empty" role="status">
              <p>条件に合う作品はありません。</p>
              <button type="button" onClick={resetDiscovery}>
                絞り込みを解除
              </button>
            </div>
          )}
          {saveError && (
            <p className="gallery-save-message is-error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      </main>
      <footer className="gallery-footer">
        <p>
          DECEPTION WORLD<span>GALLERY / VISUAL COLLECTION</span>
        </p>
        <Link to="/world">
          ワールドへ戻る <span aria-hidden="true">↗</span>
        </Link>
      </footer>
      <SideMenuLayer context="gallery" open={menuOpen} onOpenChange={setMenuOpen} />
      <dialog
        id="gallery-viewer"
        className="gallery-viewer"
        data-gallery-background={display.preferences.background}
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="gallery-viewer-title"
        onClose={(event) => {
          if (!event.currentTarget.open) setSelectedId(null);
        }}
        onCancel={(event) => {
          event.preventDefault();
          if (communityBusy) {
            event.preventDefault();
            return;
          }
          if (confirmDelete) {
            event.preventDefault();
            cancelDelete();
            return;
          }
          if (editing) {
            event.preventDefault();
            cancelEditor();
            return;
          }
          restoreFocusRef.current = true;
          closeViewer();
        }}
        onKeyDown={(event) => {
          if (editing || confirmDelete || communityBusy || event.target instanceof HTMLInputElement)
            return;
          if (event.key === "Escape") restoreFocusRef.current = true;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            if (event.repeat) return;
            restoreFocusRef.current = true;
            moveWork(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          backdropPointerRef.current =
            event.target === event.currentTarget &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom);
        }}
        onPointerUp={(event) => {
          const outside = backdropPointerRef.current;
          backdropPointerRef.current = false;
          const rect = event.currentTarget.getBoundingClientRect();
          const endedOutside =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;
          if (
            outside &&
            endedOutside &&
            event.target === event.currentTarget &&
            !editing &&
            !confirmDelete &&
            !communityBusy
          )
            closeViewer();
        }}
      >
        {selected && (
          <div className="gallery-viewer-shell">
            <header className="gallery-viewer-header">
              <div>
                <h2 id="gallery-viewer-title">
                  {numberFor(selected)}
                  {titles[selected.id] && (
                    <span className="gallery-personal-title">{titles[selected.id]}</span>
                  )}
                </h2>
                {isCommunityGalleryId(selected.id) && (
                  <p className="gallery-storage-note">みんなの投稿・公開展示</p>
                )}
              </div>
              <button
                type="button"
                className="gallery-viewer-close gallery-close-primary"
                disabled={communityBusy}
                onClick={closeViewer}
              >
                閉じる <span aria-hidden="true">×</span>
              </button>
              <details className="gallery-viewer-tools">
                <summary>
                  作品の設定<span>トップ作品・背景・タイトル・共有リンク</span>
                </summary>
                <p className="gallery-storage-note">
                  トップ作品とお気に入りは自分用に保存。タイトルはすべての訪問者に共有され、だれでも編集できます。
                </p>
                <div className="gallery-viewer-actions">
                  <button
                    type="button"
                    className="gallery-viewer-close"
                    aria-pressed={featuredId === selected.id}
                    disabled={editing || confirmDelete}
                    onClick={() => changeFeature(selected.id)}
                  >
                    {featuredId === selected.id ? "トップに設定済み" : "トップに飾る"}
                  </button>
                  <button
                    type="button"
                    className="gallery-viewer-close"
                    ref={editButtonRef}
                    disabled={
                      !communityReady ||
                      !communityLoaded ||
                      editing ||
                      confirmDelete ||
                      communityBusy
                    }
                    onClick={() => {
                      void beginTitleEdit();
                    }}
                  >
                    タイトルを編集
                  </button>
                  <button
                    type="button"
                    className="gallery-viewer-close"
                    aria-pressed={favorites.includes(selected.id)}
                    disabled={editing || confirmDelete}
                    onClick={() => changeFavorite(selected.id)}
                  >
                    {favorites.includes(selected.id) ? "♥ お気に入り" : "♡ お気に入り"}
                  </button>
                  {canDeleteSelected && (
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      ref={deleteButtonRef}
                      disabled={editing || communityBusy || confirmDelete}
                      onClick={() => {
                        setSaveError("");
                        setConfirmDelete(true);
                      }}
                    >
                      非公開にする
                    </button>
                  )}
                </div>
                <GalleryShareControl
                  key={selected.id}
                  id={selected.id}
                  disabled={editing || confirmDelete || communityBusy}
                />
                <GalleryBackgroundControl
                  value={display.preferences.background}
                  onChange={(background) => display.update({ background })}
                  status={display.status}
                  error={display.error}
                />
              </details>
              {featureMessage && (
                <p className="gallery-storage-note" role="status">
                  {featureMessage}
                </p>
              )}
              {featureError && (
                <p className="gallery-storage-note" role="alert">
                  {featureError}
                </p>
              )}
              {confirmDelete && (
                <div
                  className="gallery-delete-confirm"
                  role="group"
                  aria-labelledby="gallery-delete-question"
                >
                  <p id="gallery-delete-question">
                    {numberFor(selected)}を公開展示から外しますか？
                    投稿は削除されず、「非公開にした投稿」から公開展示に戻せます。
                  </p>
                  <div className="gallery-viewer-actions">
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      disabled={communityBusy}
                      onClick={cancelDelete}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      ref={confirmDeleteRef}
                      disabled={communityBusy}
                      onClick={() => {
                        void removeCommunityImage();
                      }}
                    >
                      {communityBusy ? "処理しています…" : "非公開にする"}
                    </button>
                  </div>
                </div>
              )}
              {editing && (
                <form
                  className="gallery-title-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void publishTitle();
                  }}
                >
                  <label htmlFor="gallery-title-input">タイトル</label>
                  <input
                    id="gallery-title-input"
                    ref={titleInputRef}
                    value={draft}
                    disabled={communityBusy}
                    maxLength={GALLERY_TITLE_LIMIT}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="空欄で保存すると番号だけに戻ります"
                    aria-describedby="gallery-title-help"
                  />
                  <p id="gallery-title-help">
                    100文字まで。公開するとすべての訪問者に表示されます。
                  </p>
                  {titleConflict && (
                    <div className="gallery-title-conflict" role="status">
                      <p>最新の公開タイトル：{titleConflict.title || "（番号のみ）"}</p>
                      <button
                        type="button"
                        className="gallery-viewer-close"
                        onClick={() => {
                          setDraft(titleConflict.title);
                          setEditingVersion(titleConflict.version);
                          setTitleConflict(null);
                          setSaveError("");
                          titleInputRef.current?.focus({ preventScroll: true });
                          revealGalleryControl(titleInputRef.current);
                        }}
                      >
                        最新のタイトルから再編集
                      </button>
                    </div>
                  )}
                  <div className="gallery-viewer-actions">
                    <button
                      type="submit"
                      className="gallery-viewer-close"
                      disabled={communityBusy || Boolean(titleConflict)}
                    >
                      {communityBusy ? "公開しています…" : "タイトルを公開"}
                    </button>
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      disabled={communityBusy}
                      onClick={cancelEditor}
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              )}
              {!editing &&
                legacyTitles[selected.id] &&
                legacyTitles[selected.id] !== titles[selected.id] && (
                  <div className="gallery-legacy-title">
                    <p>以前の個人タイトル：{legacyTitles[selected.id]}</p>
                    <button
                      type="button"
                      className="gallery-viewer-close"
                      disabled={
                        !communityReady || !communityLoaded || communityBusy || confirmDelete
                      }
                      onClick={() => {
                        void beginTitleEdit(legacyTitles[selected.id]);
                      }}
                    >
                      以前の個人タイトルを公開
                    </button>
                  </div>
                )}
              {saveMessage && (
                <p className="gallery-save-message" role="status">
                  {saveMessage}
                </p>
              )}
              {saveError && (
                <p className="gallery-save-message is-error" role="alert">
                  {saveError}
                </p>
              )}
            </header>
            <div className="gallery-viewer-stage">
              <GalleryViewerImage
                key={selected.id}
                work={selected}
                neighbors={neighbors}
                navigationDisabled={
                  editing || confirmDelete || communityBusy || viewerWorks.length < 2
                }
                onMove={moveWork}
              />
            </div>
            <footer className="gallery-viewer-footer">
              <button
                type="button"
                disabled={editing || confirmDelete || communityBusy || viewerWorks.length < 2}
                onClick={() => moveWork(-1)}
              >
                ← 前の作品
              </button>
              <p aria-live="polite">
                {selectedIndex + 1} / {viewerWorks.length}
              </p>
              <button
                type="button"
                disabled={editing || confirmDelete || communityBusy || viewerWorks.length < 2}
                onClick={() => moveWork(1)}
              >
                次の作品 →
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
