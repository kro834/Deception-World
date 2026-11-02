import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const MOODS = [
  { id: "dawn", label: "暁", description: "竹林に朝の光" },
  { id: "dream", label: "夢", description: "紫の夢あかり" },
  { id: "night", label: "宵", description: "月明かりの青" },
] as const;
const SCENES = [
  { id: "posters", label: "絵看板", number: "一" },
  { id: "characters", label: "登場人物", number: "二" },
  { id: "dolminence", label: "ドルミネンス", number: "三" },
  { id: "cases", label: "物語", number: "四" },
] as const;
type Mood = (typeof MOODS)[number]["id"];
type Connection = EventTarget & { saveData?: boolean };

/** Small, finite effects: no canvas, animation loop, or scroll-frame React updates. */
export function DreamCinemaEffects() {
  const [hero, setHero] = useState<HTMLElement | null>(null);
  const [mood, setMood] = useState<Mood>("dream");
  const [enabled, setEnabled] = useState(true);
  const [limited, setLimited] = useState(true);
  const [visible, setVisible] = useState(false);
  const [burst, setBurst] = useState(0);
  const [released, setReleased] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);
  const [activeScene, setActiveScene] = useState("");
  const controls = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animated = enabled && !limited;

  useEffect(() => {
    const page = controls.current?.closest(".dream-page");
    const target = page?.querySelector<HTMLElement>(".dream-hero") ?? null;
    setHero(target);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const update = () =>
      setLimited(
        motion.matches ||
          !!connection?.saveData ||
          document.documentElement.dataset.worldEffects === "economy",
      );
    update();
    motion.addEventListener("change", update);
    connection?.addEventListener("change", update);
    const policy = new MutationObserver(update);
    policy.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects"],
    });
    const visibility = () => {
      if (document.hidden) setVisible(false);
      else if (target) {
        const rect = target.getBoundingClientRect();
        setVisible(rect.bottom > 0 && rect.top < window.innerHeight);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting && !document.hidden),
            { threshold: 0 },
          );
    if (target) observer?.observe(target);
    const scenes = SCENES.map((scene) => page?.querySelector<HTMLElement>(`#${scene.id}`)).filter(
      (scene): scene is HTMLElement => !!scene,
    );
    const chapterObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                setActiveScene(entry.target.id);
                setVisited((previous) =>
                  previous.includes(entry.target.id) ? previous : [...previous, entry.target.id],
                );
              }
            },
            { rootMargin: "-10% 0px -65% 0px", threshold: 0 },
          );
    scenes.forEach((scene) => chapterObserver?.observe(scene));
    return () => {
      motion.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
      policy.disconnect();
      observer?.disconnect();
      chapterObserver?.disconnect();
      if (expiry.current) clearTimeout(expiry.current);
    };
  }, []);

  useEffect(() => {
    if (!hero || !animated || !visible) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch" || !light.current) return;
      const rect = hero.getBoundingClientRect();
      light.current.style.setProperty(
        "--dc-x",
        `${((event.clientX - rect.left) / rect.width) * 100}%`,
      );
      light.current.style.setProperty(
        "--dc-y",
        `${((event.clientY - rect.top) / rect.height) * 100}%`,
      );
      light.current.style.opacity = "1";
    };
    const leave = () => {
      if (light.current) light.current.style.opacity = "0";
    };
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", leave);
    return () => {
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
      leave();
    };
  }, [hero, animated, visible]);

  const release = () => {
    if (expiry.current) clearTimeout(expiry.current);
    setReleased(true);
    setBurst((value) => value + 1);
    expiry.current = setTimeout(() => setReleased(false), 2400);
  };

  return (
    <div
      ref={controls}
      className="dream-cinema-effects"
      data-mood={mood}
      data-motion={animated ? "on" : "off"}
    >
      {hero &&
        createPortal(
          <div
            className="dream-cinema-atmosphere"
            data-mood={mood}
            data-motion={animated ? "on" : "off"}
            data-visible={visible}
            aria-hidden="true"
          >
            <span className="dream-cinema-wash" />
            <span ref={light} className="dream-cinema-pointer-light" />
            <span key={mood} className="dream-cinema-mist" />
            {released && <span key={burst} className="dream-cinema-portal" />}
          </div>,
          hero,
        )}
      <details className="dream-cinema-console">
        <summary>
          <span className="dream-cinema-console-mark" aria-hidden="true">
            ✧
          </span>
          <span>夢境の演出</span>
          <span className="dream-cinema-console-current">
            {MOODS.find((item) => item.id === mood)?.description}
          </span>
          <span className="dream-cinema-console-chevron" aria-hidden="true">
            ＋
          </span>
        </summary>
        <div className="dream-cinema-console-body">
          <fieldset>
            <legend>光の景色</legend>
            <div className="dream-cinema-moods">
              {MOODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={mood === item.id}
                  onClick={() => setMood(item.id)}
                >
                  <span
                    className={`dream-cinema-mood-orb dream-cinema-mood-orb--${item.id}`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="dream-cinema-play-controls">
            <button type="button" className="dream-cinema-release" onClick={release}>
              蝶を放つ <span aria-hidden="true">✧</span>
            </button>
            <button
              type="button"
              aria-pressed={enabled}
              onClick={() => setEnabled((value) => !value)}
            >
              夢境の動き：{enabled ? "入" : "切"}
            </button>
          </div>
          <p className="dream-cinema-console-note">
            {limited
              ? "端末の設定に合わせ、静かな光でお届けします。"
              : "光を選んで、夢の入口にひとひら。"}
          </p>
          <p className="dream-cinema-release-status" role="status">
            {released ? "夢の蝶が、ひとひら。" : ""}
          </p>
        </div>
      </details>
      <nav
        className="dream-cinema-scene-trail"
        aria-label={`夢境の道しるべ・${visited.length} / 4 場面を訪問`}
      >
        {SCENES.map((scene) => (
          <a
            key={scene.id}
            href={`#${scene.id}`}
            aria-current={activeScene === scene.id ? "location" : undefined}
            data-visited={visited.includes(scene.id)}
          >
            <span aria-hidden="true">{visited.includes(scene.id) ? "✧" : scene.number}</span>
            <span>{scene.label}</span>
          </a>
        ))}
      </nav>
      <div className="dream-cinema-butterflies" aria-hidden="true">
        {released &&
          Array.from({ length: animated ? 6 : 3 }, (_, index) => (
            <span
              key={`${burst}-${index}`}
              className="dream-cinema-butterfly"
              style={{ "--dc-i": index } as CSSProperties}
            >
              <i />
              <i />
            </span>
          ))}
      </div>
    </div>
  );
}
