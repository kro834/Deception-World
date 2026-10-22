import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@tanstack/react-router";
import type { DreamScreeningRoom } from "./dream-screening-room";
import { prepareScreeningStyle } from "./dream-screening-style";

type ScreeningRoom = typeof DreamScreeningRoom;

/** Do not fetch the viewing room or its stylesheet before someone opens it. */
export function DreamScreeningLauncher({
  index,
  onActiveChange,
  onSelection,
}: {
  index: number;
  onActiveChange: (active: boolean) => void;
  onSelection: (index: number) => void;
}) {
  const router = useRouter();
  const [Room, setRoom] = useState<ScreeningRoom | null>(null);
  const [initialIndex, setInitialIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    setHydrated(true);
    return () => {
      generation.current += 1;
    };
  }, []);

  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        if (!pending.current || !["BACK", "FORWARD", "GO"].includes(action.type)) return;
        pending.current = false;
        generation.current += 1;
        setLoading(false);
        setFailed(false);
        onActiveChange(false);
      }),
    [onActiveChange, router],
  );

  const open = async () => {
    const request = ++generation.current;
    pending.current = true;
    const selected = index;
    onActiveChange(true);
    setLoading(true);
    setFailed(false);
    try {
      const [module] = await Promise.all([
        import("./dream-screening-room"),
        prepareScreeningStyle(),
      ]);
      if (request !== generation.current) return;
      setRoom(() => module.DreamScreeningRoom);
      setInitialIndex(selected);
    } catch {
      if (request !== generation.current) return;
      setFailed(true);
      onActiveChange(false);
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  };

  // ComponentType ensures JSX never treats the stored component as a state updater.
  const Viewer: ComponentType<Parameters<ScreeningRoom>[0]> | null = Room;
  return (
    <>
      <button
        ref={triggerRef}
        className="dream-screening-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-busy={!hydrated || loading}
        disabled={!hydrated || loading}
        onClick={() => void open()}
      >
        <span aria-hidden="true">⛶</span>
        {!hydrated || loading ? "映写室を準備中" : failed ? "映写室を再読み込み" : "映写室で見る"}
      </button>
      {failed ? (
        <span className="dream-screening-load-error" role="status">
          読み込めませんでした。もう一度お試しください。
        </span>
      ) : null}
      {Viewer && initialIndex != null
        ? createPortal(
            <Viewer
              initialIndex={initialIndex}
              trigger={triggerRef.current}
              onClose={(selected) => {
                setInitialIndex(null);
                onSelection(selected);
                onActiveChange(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
