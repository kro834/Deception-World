import { useEffect, useRef, useState } from "react";

/** A local stage light: changes atmosphere, never the legibility of a record. */
export function DreamStageLantern() {
  const [lit, setLit] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stage = buttonRef.current?.closest<HTMLElement>(".dream-hero");
    if (!stage) return;
    stage.dataset.dreamLantern = lit ? "lit" : "dim";
    return () => {
      delete stage.dataset.dreamLantern;
    };
  }, [lit]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="dream-stage-lantern"
      aria-label="舞台の夢灯り"
      aria-pressed={lit}
      onClick={() => setLit((current) => !current)}
    >
      <span className="dream-stage-lantern-shade" aria-hidden="true">
        <span>夢</span>
      </span>
      <span className="dream-stage-lantern-label">
        <strong>夢灯り</strong>
        <span>{lit ? "灯りを落とす" : "灯りをともす"}</span>
      </span>
    </button>
  );
}
