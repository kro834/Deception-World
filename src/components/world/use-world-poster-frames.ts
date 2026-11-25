import { useCallback, useEffect, useRef, useState } from "react";

type PosterFrame = { index: number; key: number };
type PosterFrames = {
  current: PosterFrame;
  previous: PosterFrame | null;
  pending: PosterFrame | null;
};

const INITIAL_FRAMES: PosterFrames = {
  current: { index: 0, key: 0 },
  previous: null,
  pending: null,
};

type PosterRequest = {
  frame: PosterFrame;
  timeout: number;
  resolve: (ready: boolean) => void;
  canShow?: () => boolean;
};

/** Keep the actual decoded element mounted when it moves into view. */
export function useWorldPosterFrames() {
  const [frames, setFrames] = useState(INITIAL_FRAMES);
  const current = useRef(INITIAL_FRAMES.current);
  const sequence = useRef(0);
  const request = useRef<PosterRequest | null>(null);

  const settle = useCallback((frame: PosterFrame, ready: boolean) => {
    const pending = request.current;
    if (pending?.frame !== frame) return;

    request.current = null;
    window.clearTimeout(pending.timeout);
    ready &&= pending.canShow?.() ?? true;
    if (ready) {
      const previous = current.current;
      current.current = frame;
      setFrames({ current: frame, previous, pending: null });
    } else {
      setFrames((value) => ({ ...value, pending: null }));
    }
    pending.resolve(ready);
  }, []);

  const cancel = useCallback(() => {
    const pending = request.current;
    if (pending) settle(pending.frame, false);
  }, [settle]);

  const show = useCallback(
    (
      index: number,
      { retry = false, canShow }: { retry?: boolean; canShow?: () => boolean } = {},
    ) => {
      cancel();
      if (current.current.index === index && !retry) return Promise.resolve(true);

      const frame = { index, key: ++sequence.current };
      return new Promise<boolean>((resolve) => {
        request.current = {
          frame,
          timeout: window.setTimeout(() => settle(frame, false), 8000),
          resolve,
          canShow,
        };
        setFrames((value) => ({ ...value, pending: frame }));
      });
    },
    [cancel, settle],
  );

  const load = useCallback(
    async (frame: PosterFrame, image: HTMLImageElement) => {
      if (request.current?.frame !== frame) return;
      const source = image.currentSrc;
      try {
        await image.decode?.();
      } catch {
        // The responsive candidate can change during decode. Its own load event
        // will settle the pending frame once that candidate becomes available.
        if (image.currentSrc !== source || !image.complete) return;
        settle(frame, false);
        return;
      }
      if (image.currentSrc === source && image.complete) {
        settle(frame, image.naturalWidth > 0);
      }
    },
    [settle],
  );

  const finishPrevious = useCallback((frame: PosterFrame) => {
    setFrames((value) => (value.previous === frame ? { ...value, previous: null } : value));
  }, []);

  useEffect(() => {
    if (!frames.previous) return;
    const frame = frames.previous;
    const timeout = window.setTimeout(() => finishPrevious(frame), 480);
    return () => window.clearTimeout(timeout);
  }, [frames.previous, finishPrevious]);

  useEffect(
    () => () => {
      const pending = request.current;
      if (!pending) return;
      request.current = null;
      window.clearTimeout(pending.timeout);
      pending.resolve(false);
    },
    [],
  );

  return { frames, show, cancel, load, settle };
}
