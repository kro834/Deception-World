import { useEffect, useState, type RefObject } from "react";

type DossierStop = { label: string; target: HTMLElement };

/** Moves inside the native dialog without changing the page's record fragment. */
function moveToDossierStop(target: HTMLElement | undefined) {
  if (!target?.isConnected) return;
  target.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
  target.focus({ preventScroll: true });
}

export function DreamDossierGuide({
  scope,
  recordId,
  name,
}: {
  scope: RefObject<HTMLDivElement | null>;
  recordId: string;
  name: string;
}) {
  const [stops, setStops] = useState<DossierStop[]>([]);
  const [destination, setDestination] = useState("0");

  // Parent host refs attach after child layout effects. Read the scope only
  // after the entire commit so a freshly opened dialog gets its full index.
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const title = root.querySelector<HTMLElement>(".dream-dossier-title h2");
    const headings = Array.from(
      root.querySelectorAll<HTMLElement>(".dream-dossier-sections > section > header h3"),
    );
    const next = [
      ...(title ? [{ label: "基本資料・プロフィール", target: title }] : []),
      ...headings.map((target) => ({ label: target.textContent?.trim() || "資料", target })),
    ];
    const prepared = next.filter(({ target }) => !target.hasAttribute("tabindex"));
    prepared.forEach(({ target }) => target.setAttribute("tabindex", "-1"));
    setStops(next);
    setDestination("0");
    return () => {
      prepared.forEach(({ target }) => target.removeAttribute("tabindex"));
    };
  }, [recordId, scope]);

  return (
    <nav className="dream-dossier-guide" aria-label={`${name}の資料内目次`}>
      <label>
        <span>資料内目次</span>
        <select
          aria-label="資料内の移動先"
          value={destination}
          onChange={(event) => setDestination(event.currentTarget.value)}
          disabled={!stops.length}
        >
          {stops.map((stop, index) => (
            <option key={index} value={String(index)}>
              {String(index + 1).padStart(2, "0")} / {stop.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!stops.length}
        onClick={() => moveToDossierStop(stops[Number(destination)]?.target)}
      >
        移動
      </button>
    </nav>
  );
}
