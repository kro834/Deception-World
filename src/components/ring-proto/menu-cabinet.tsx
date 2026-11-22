// PROTOTYPE m2 「からくり箪笥」: the side menu as a karakuri cabinet.
// Seven drawers; an amber thread over an amber pulley pulls the chosen drawer
// out and lowers its plates one by one. The drawer that was open is let back
// in. The amber thread and pulley are the owner's chosen section motion
// (ring-motion's chain); the real build should share that vocabulary.
import { useLayoutEffect, useRef, useState } from "react";
import { PROTO_REGIONS } from "./data";
import { ProtoMoon } from "./menu-orbit";
import { withGroupBreaks } from "./group-breaks";

export function MenuCabinet({ initialRegion }: { initialRegion?: string }) {
  const [openId, setOpenId] = useState(initialRegion ?? "sections");
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);
  const tops = useRef(new Map<Element, number>());
  // A phone's drawers sit in one column, so opening one moves the rest. They
  // start from where they were and drop on the bounce spring (FLIP; translate
  // only, no height animation).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const calm =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.worldEffects === "economy";
    const easing =
      getComputedStyle(document.documentElement).getPropertyValue("--ring-spring-bounce").trim() ||
      "ease-out";
    for (const item of Array.from(list.children)) {
      const top = item.getBoundingClientRect().top + list.scrollTop;
      const before = tops.current.get(item);
      tops.current.set(item, top);
      if (calm || before === undefined || Math.abs(before - top) < 1) continue;
      item.animate([{ translate: `0 ${before - top}px` }, { translate: "0 0" }], {
        duration: 700,
        easing,
      });
    }
  }, [openId]);

  return (
    <div className="rp-root rp-m2" data-open={open}>
      <button
        type="button"
        className="rp-trigger"
        aria-label="メニューを開く"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" />
      </button>
      <section className="rp-m2-sheet" role="dialog" aria-label="サイトメニュー" hidden={!open}>
        <header className="rp-m2-head">
          <h2>サイトメニュー</h2>
          <a className="rp-search" role="button" tabIndex={0}>
            <i aria-hidden="true" />
            <b>クイック検索</b>
          </a>
          <button
            type="button"
            className="rp-close"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
          >
            <i aria-hidden="true" />
          </button>
        </header>
        <i className="rp-m2-beam" aria-hidden="true" />
        <ul className="rp-m2-cabinet" ref={listRef}>
          {PROTO_REGIONS.map((region, index) => {
            const isOpen = region.id === openId;
            const columns = region.items.length > 8 ? 3 : region.items.length > 4 ? 2 : 1;
            return (
              <li key={region.id} data-open={isOpen} style={{ ["--i" as string]: index }}>
                <button
                  type="button"
                  className="rp-m2-front"
                  aria-expanded={isOpen}
                  aria-controls={`rp-m2-tray-${region.id}`}
                  onClick={() => setOpenId(region.id)}
                >
                  <span>{region.label}</span>
                  <i className="rp-m2-pull" aria-hidden="true" />
                </button>
                <div
                  className="rp-m2-tray"
                  id={`rp-m2-tray-${region.id}`}
                  hidden={!isOpen}
                  data-cols={columns}
                  style={{ ["--cols" as string]: columns }}
                >
                  <i className="rp-m2-pulley" aria-hidden="true" />
                  {withGroupBreaks(region.items).flatMap(({ item, breakBefore }, itemIndex) => [
                    breakBefore ? (
                      <i className="rp-break" key={`break-${item.label}`} aria-hidden="true" />
                    ) : null,
                    <ProtoMoon
                      key={item.label}
                      item={item}
                      style={{
                        ["--row" as string]: Math.floor(itemIndex / columns),
                        ["--col" as string]: itemIndex % columns,
                      }}
                    />,
                  ])}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
