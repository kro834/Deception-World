import { useLayoutEffect, useRef, useState } from "react";
import { DREAM_CHARACTERS } from "./dream-chapter-data";

/** The portrait already catalogued for the character named in CASE 0's opening scene. */
export function DreamSceneMaterial() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const origin = useRef(0);
  const ciel = DREAM_CHARACTERS.find((entry) => entry.id === "ciel")!;
  useLayoutEffect(() => {
    if (open) closer.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      const button = trigger.current;
      if (!button?.isConnected) return;
      button.focus({ preventScroll: true });
      window.scrollBy({
        top: button.getBoundingClientRect().top - origin.current,
        behavior: "instant",
      });
    });
  };
  return (
    <div className="dream-scene-material">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="dream-main-scene-ciel"
        onClick={() => {
          if (open) close();
          else {
            origin.current = trigger.current?.getBoundingClientRect().top ?? 0;
            setOpen(true);
          }
        }}
      >
        シエルの人物原画 {open ? "−" : "＋"}
      </button>
      {open ? (
        <aside
          id="dream-main-scene-ciel"
          className="dream-scene-reference"
          aria-label="シエルの人物原画"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <figure>
            <img src={ciel.portrait} alt={ciel.portraitAlt} width="768" height="1024" />
            <figcaption>{ciel.name} · 人物原画</figcaption>
          </figure>
          <button ref={closer} type="button" onClick={close}>
            原画を閉じて本文に戻る
          </button>
        </aside>
      ) : null}
    </div>
  );
}
