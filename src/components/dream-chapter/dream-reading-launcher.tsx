import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DreamReadingRoom } from "./dream-reading-room";
import { prepareReadingStyle } from "./dream-reading-style";

/** The room and its styles are fetched only after explicit entry. */
export function DreamReadingLauncher() {
  const [Room, setRoom] = useState<typeof DreamReadingRoom | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    setReady(true);
    return () => {
      generation.current += 1;
    };
  }, []);
  const enter = async () => {
    const request = ++generation.current;
    setBusy(true);
    setFailed(false);
    try {
      const [module] = await Promise.all([import("./dream-reading-room"), prepareReadingStyle()]);
      if (request !== generation.current) return;
      setRoom(() => module.DreamReadingRoom);
      setOpen(true);
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  return (
    <div className="dream-reading-entry" id="dream-reading-room-entry">
      <div>
        <p lang="en">PRIVATE READING ROOM</p>
        <h3>物語だけに、灯りを。</h3>
        <span>六章のあらすじを、紙色と夜色の読書室で。いつでも元の場所へ戻れます。</span>
      </div>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        disabled={!ready || busy}
        aria-busy={busy}
        onClick={() => void enter()}
      >
        {busy ? "読書室を準備中" : failed ? "読書室を再読み込み" : "読書室を開く"}
        <span aria-hidden="true"> ↗</span>
      </button>
      {failed ? (
        <p role="status">読み込めませんでした。通常のあらすじは引き続き読めます。</p>
      ) : null}
      {open && Room
        ? createPortal(
            <Room trigger={trigger.current} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </div>
  );
}
