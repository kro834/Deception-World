// PROTOTYPE m1 「軌道儀」: the side menu as a dial you spin.
// Seven regions are planets on one ring; the region at the focus point shows
// its pages as moons fanned along the dial. Drag, wheel and arrow keys turn
// the ring; it settles on a detent with the bounce spring. Every rotation is
// a CSS `rotate` transition (compositor), so a still at any time is exact.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { PROTO_REGIONS, protoItemProps, type ProtoItem } from "./data";

const N = PROTO_REGIONS.length;
const STEP = 360 / N;
// Rows hug a circle this far outside the planets' ring (desktop).
const HUG_RADIUS = 400;
const ROW_PITCH = 56;

export function ProtoMoon({ item, style }: { item: ProtoItem; style?: CSSProperties }) {
  return (
    <a className="rp-moon" {...protoItemProps(item)} style={style}>
      {item.img ? (
        <span className="rp-moon-art">
          <img src={item.img} alt="" loading="lazy" decoding="async" />
        </span>
      ) : (
        <i className="rp-moon-dot" aria-hidden="true" />
      )}
      <b>{item.label}</b>
    </a>
  );
}

export function MenuOrbit({ initialRegion }: { initialRegion?: string }) {
  const start = Math.max(
    0,
    PROTO_REGIONS.findIndex((region) => region.id === (initialRegion ?? "sections")),
  );
  // `turn` is unbounded so the ring always takes the short way round.
  const [turn, setTurn] = useState(start);
  const [dragTurn, setDragTurn] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const dialRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; angle: number; turn: number; moved: boolean } | null>(null);
  const wheelLock = useRef(0);
  const shown = dragTurn ?? turn;
  const focus = (((Math.round(shown) % N) + N) % N) as number;
  const region = PROTO_REGIONS[focus];

  const pointerAngle = (event: { clientX: number; clientY: number }) => {
    const box = dialRef.current!.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - (box.top + box.height / 2),
        event.clientX - (box.left + box.width / 2),
      ) *
        180) /
      Math.PI
    );
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { id: event.pointerId, angle: pointerAngle(event), turn, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    let delta = pointerAngle(event) - state.angle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (!state.moved && Math.abs(delta) < 4) return;
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragTurn(state.turn - delta / STEP);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragTurn((value) => {
      if (value !== null) setTurn(Math.round(value));
      return null;
    });
  };
  const choose = (index: number) => {
    // The nearest equivalent position of that planet.
    setTurn((value) => {
      let delta = (((index - value) % N) + N) % N;
      if (delta > N / 2) delta -= N;
      return Math.round(value + delta);
    });
  };
  useEffect(() => {
    const dial = dialRef.current;
    if (!dial) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      if (now < wheelLock.current || Math.abs(event.deltaY) < 8) return;
      wheelLock.current = now + 160;
      setTurn((value) => value + Math.sign(event.deltaY));
    };
    dial.addEventListener("wheel", onWheel, { passive: false });
    return () => dial.removeEventListener("wheel", onWheel);
  }, []);

  // More than eight moons share two columns so nothing scrolls on a phone.
  const columns = region.items.length > 8 ? 2 : 1;
  const perColumn = Math.ceil(region.items.length / columns);

  return (
    <div className="rp-root rp-m1" data-open={open}>
      <button
        type="button"
        className="rp-trigger"
        aria-label="メニューを開く"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" />
      </button>
      <section className="rp-m1-sheet" role="dialog" aria-label="サイトメニュー" hidden={!open}>
        <i className="rp-m1-halo" aria-hidden="true" />
        <h2 className="rp-m1-title">サイトメニュー</h2>
        <button
          type="button"
          className="rp-close"
          aria-label="メニューを閉じる"
          onClick={() => setOpen(false)}
        >
          <i aria-hidden="true" />
        </button>
        <div
          ref={dialRef}
          className={`rp-m1-dial${dragTurn !== null ? " is-dragging" : ""}`}
          style={{ ["--turn" as string]: shown, ["--step" as string]: `${STEP}deg` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <i className="rp-m1-track" aria-hidden="true" />
          <div className="rp-m1-ring" role="tablist" aria-label="メニューの領域">
            {PROTO_REGIONS.map((entry, index) => (
              <span className="rp-m1-spoke" key={entry.id} style={{ ["--i" as string]: index }}>
                <button
                  type="button"
                  role="tab"
                  id={`rp-m1-tab-${entry.id}`}
                  aria-selected={index === focus}
                  aria-controls="rp-m1-panel"
                  tabIndex={index === focus ? 0 : -1}
                  className="rp-m1-planet"
                  onClick={() => choose(index)}
                  onKeyDown={(event) => {
                    const move =
                      event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : event.key === "ArrowLeft" || event.key === "ArrowUp"
                          ? -1
                          : 0;
                    if (!move) return;
                    event.preventDefault();
                    setTurn((value) => value + move);
                    const next = (((index + move) % N) + N) % N;
                    document.getElementById(`rp-m1-tab-${PROTO_REGIONS[next].id}`)?.focus();
                  }}
                >
                  <span>{entry.label}</span>
                </button>
              </span>
            ))}
          </div>
          <div className="rp-m1-hub">
            <a className="rp-search" role="button" tabIndex={0}>
              <i aria-hidden="true" />
              <b>クイック検索</b>
            </a>
          </div>
        </div>
        <div
          className="rp-m1-panel"
          id="rp-m1-panel"
          role="tabpanel"
          aria-labelledby={`rp-m1-tab-${region.id}`}
          key={region.id}
        >
          <div className="rp-m1-rows" data-cols={columns} style={{ ["--cols" as string]: columns }}>
            {region.items.map((item, index) => {
              const row = index % perColumn;
              const y = (row - (perColumn - 1) / 2) * ROW_PITCH;
              const hug = HUG_RADIUS - Math.sqrt(HUG_RADIUS * HUG_RADIUS - y * y);
              return (
                <ProtoMoon
                  key={item.label}
                  item={item}
                  style={{
                    ["--hug" as string]: `${-hug.toFixed(1)}px`,
                    ["--j" as string]: row + Math.floor(index / perColumn) * 2,
                    gridColumn: Math.floor(index / perColumn) + 1,
                    gridRow: row + 1,
                  }}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
