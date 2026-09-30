import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UiVectorIcon } from "./ui-vector-icon";

// Only names and artwork have been supplied; do not invent profile information.
export const OTHER_ARTWORK = [
  {
    id: "haiku",
    name: "ハイク",
    code: "03",
    image: "/character-haiku-20260923.webp",
    thumb: "/character-haiku-20260923-thumb.webp",
    width: 1052,
    height: 1495,
    position: "50% 18%",
  },
  {
    id: "fable",
    name: "フェイブル",
    code: "04",
    image: "/character-fable-20260923.webp",
    thumb: "/character-fable-20260923-thumb.webp",
    width: 1129,
    height: 1393,
    position: "50% 16%",
  },
] as const;

export function OtherArtworkCard({ artwork }: { artwork: (typeof OTHER_ARTWORK)[number] }) {
  const [open, setOpen] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const keyboardOpened = useRef(false);
  const backdropPress = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const dialogId = `other-artwork-${artwork.id}`;

  useEffect(() => {
    if (!open || !dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
    // WebKit can show a focus ring on the first button even after a touch opening.
    // Start on the labelled dialog; Tab still reaches its close control normally.
    dialog.current.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="other-archive-card other-artwork-card"
        aria-label={`${artwork.name}の画像を拡大`}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        onClick={(event) => {
          keyboardOpened.current = event.detail === 0;
          setKeyboardFocus(keyboardOpened.current);
          setOpen(true);
        }}
      >
        <img
          src={artwork.thumb}
          alt={`${artwork.name}のキャラクタービジュアル`}
          width={artwork.width}
          height={artwork.height}
          style={{ objectPosition: artwork.position }}
          loading="lazy"
          decoding="async"
        />
        <span className="other-card-shade" aria-hidden="true" />
        <span className="other-card-code">RELATED / {artwork.code}</span>
        <span className="other-card-copy">
          <small>CHARACTER VISUAL</small>
          <b>{artwork.name}</b>
          <i>画像を拡大</i>
        </span>
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            id={dialogId}
            className="other-artwork-dialog"
            tabIndex={-1}
            autoFocus
            data-input-mode={keyboardFocus ? "keyboard" : "pointer"}
            aria-labelledby={`${dialogId}-title`}
            onKeyDownCapture={(event) => {
              if (["Tab", "Enter", " ", "Escape"].includes(event.key)) {
                keyboardOpened.current = true;
                setKeyboardFocus(true);
              }
            }}
            onPointerDownCapture={(event) => {
              keyboardOpened.current = false;
              setKeyboardFocus(false);
              backdropPress.current =
                event.isPrimary && event.button === 0 && event.target === event.currentTarget
                  ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
                  : null;
            }}
            onPointerMoveCapture={(event) => {
              const press = backdropPress.current;
              if (press?.pointerId !== event.pointerId) return;
              if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
                press.moved = true;
              }
            }}
            onPointerCancelCapture={() => {
              backdropPress.current = null;
            }}
            onClose={() => {
              setOpen(false);
              if (keyboardOpened.current) trigger.current?.focus({ preventScroll: true });
              else trigger.current?.blur();
            }}
            onClick={(event) => {
              // A drag starting on the artwork and ending in the gutter also
              // targets the dialog. Only a stationary gutter press dismisses it.
              const press = backdropPress.current;
              backdropPress.current = null;
              if (
                event.target === event.currentTarget &&
                press &&
                !press.moved &&
                Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 8
              ) {
                dialog.current?.close();
              }
            }}
          >
            <div className="other-artwork-viewer">
              <header>
                <h2 id={`${dialogId}-title`}>{artwork.name}</h2>
                <button
                  type="button"
                  aria-label={`${artwork.name}の画像を閉じる`}
                  onClick={(event) => {
                    keyboardOpened.current = event.detail === 0;
                    dialog.current?.close();
                  }}
                >
                  <span>閉じる</span>
                  <UiVectorIcon kind="close" size={18} />
                </button>
              </header>
              <img
                src={artwork.image}
                alt={`${artwork.name}のキャラクタービジュアル全体`}
                width={artwork.width}
                height={artwork.height}
                decoding="async"
              />
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
