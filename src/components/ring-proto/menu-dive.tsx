// PROTOTYPE m3 「潜行レンズ」: the side menu as seven lenses you dive through.
// All seven regions are in sight at once, each a lens with its pages as moons
// on its rim. Choosing a lens flies the view through it (one scale, about the
// lens's own centre); its pages open inside. Back surfaces again.
import { useEffect, useRef, useState } from "react";
import { PROTO_REGIONS } from "./data";
import { ProtoMoon } from "./menu-orbit";

// Desktop: ページ内 in the centre, six round it. Phone: a 2-3-2 honeycomb.
// Units are lens pitches.
const DESKTOP: Record<string, [number, number]> = {
  sections: [0, 0],
  find: [0, -1],
  special: [0.866, -0.5],
  stories: [0.866, 0.5],
  people: [0, 1],
  information: [-0.866, 0.5],
  system: [-0.866, -0.5],
};
const PHONE: Record<string, [number, number]> = {
  find: [-0.5, -0.88],
  sections: [0.5, -0.88],
  special: [-1, 0],
  stories: [0, 0],
  people: [1, 0],
  information: [-0.5, 0.88],
  system: [0.5, 0.88],
};

export function MenuDive({ initialRegion }: { initialRegion?: string }) {
  const [dive, setDive] = useState<string | null>(initialRegion ?? null);
  const [origin, setOrigin] = useState<[number, number]>([50, 50]);
  const [open, setOpen] = useState(true);
  const fieldRef = useRef<HTMLDivElement>(null);
  const region = PROTO_REGIONS.find((entry) => entry.id === dive);
  const enter = (id: string, element: HTMLElement) => {
    const lens = element.getBoundingClientRect();
    setOrigin([
      ((lens.left + lens.width / 2) / window.innerWidth) * 100,
      ((lens.top + lens.height / 2) / window.innerHeight) * 100,
    ]);
    setDive(id);
  };
  // A deep link straight into a region still dives from that lens.
  useEffect(() => {
    if (!initialRegion) return;
    const lens = fieldRef.current?.querySelector<HTMLElement>(`[data-lens="${initialRegion}"]`);
    if (!lens) return;
    const box = lens.getBoundingClientRect();
    setOrigin([
      ((box.left + box.width / 2) / window.innerWidth) * 100,
      ((box.top + box.height / 2) / window.innerHeight) * 100,
    ]);
  }, [initialRegion]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const columns = region ? (region.items.length > 8 ? 3 : region.items.length > 4 ? 2 : 1) : 1;

  return (
    <div className="rp-root rp-m3" data-open={open}>
      <button
        type="button"
        className="rp-trigger"
        aria-label="メニューを開く"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" />
      </button>
      <section
        className="rp-m3-sheet"
        role="dialog"
        aria-label="サイトメニュー"
        hidden={!open}
        data-dive={dive ? "true" : "false"}
        style={{ ["--ox" as string]: `${origin[0]}%`, ["--oy" as string]: `${origin[1]}%` }}
      >
        <button
          type="button"
          className="rp-close"
          aria-label="メニューを閉じる"
          onClick={() => setOpen(false)}
        >
          <i aria-hidden="true" />
        </button>
        <div className="rp-m3-field" ref={fieldRef} inert={Boolean(dive)}>
          <header className="rp-m3-head">
            <h2>サイトメニュー</h2>
            <a className="rp-search" role="button" tabIndex={0}>
              <i aria-hidden="true" />
              <b>クイック検索</b>
            </a>
          </header>
          <div className="rp-m3-lenses">
            {PROTO_REGIONS.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className="rp-m3-lens"
                data-lens={entry.id}
                aria-haspopup="true"
                style={{
                  ["--dx" as string]: DESKTOP[entry.id][0],
                  ["--dy" as string]: DESKTOP[entry.id][1],
                  ["--px" as string]: PHONE[entry.id][0],
                  ["--py" as string]: PHONE[entry.id][1],
                  ["--i" as string]: index,
                }}
                onClick={(event) => enter(entry.id, event.currentTarget)}
              >
                <span>{entry.label}</span>
                {entry.items.map((item, moon) => (
                  <i
                    key={item.label}
                    className="rp-m3-rim-moon"
                    aria-hidden="true"
                    style={{ ["--a" as string]: `${(360 / entry.items.length) * moon - 90}deg` }}
                  >
                    {item.img ? (
                      <img src={item.img} alt="" loading="lazy" decoding="async" />
                    ) : null}
                  </i>
                ))}
              </button>
            ))}
          </div>
        </div>
        {region ? (
          <div className="rp-m3-depth" key={region.id}>
            <i className="rp-m3-depth-ring" aria-hidden="true" />
            <button
              type="button"
              className="rp-m3-back"
              aria-label="戻る"
              autoFocus
              onClick={() => setDive(null)}
            >
              <i aria-hidden="true" />
            </button>
            <h3>{region.label}</h3>
            <div
              className="rp-m3-pages"
              data-cols={columns}
              style={{ ["--cols" as string]: columns }}
            >
              {region.items.map((item, index) => (
                <ProtoMoon key={item.label} item={item} style={{ ["--j" as string]: index }} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
