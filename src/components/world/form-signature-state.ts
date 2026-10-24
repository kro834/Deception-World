import { useEffect, useRef } from "react";

export type FormTheme = "rexonance" | "explom" | "kemonohen" | "custom";
export const isSignatureForm = (theme?: FormTheme) => theme === "explom" || theme === "kemonohen";

/** A single, local entrance; never a scroll loop. */
export function useFormSignatureArrival(theme?: FormTheme) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !isSignatureForm(theme)) return;
    if (!("IntersectionObserver" in window)) {
      node.dataset.signatureArrived = "true";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        node.dataset.signatureArrived = "true";
        observer.disconnect();
      },
      // Tall cards also arrive in a short landscape viewport.
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [theme]);
  return ref;
}

/* The record covers (gates). Each gated theme plays one cover between its
   open control and its record:
   - life: the cover's own animation; its end is the hand-over.
   - cap / calmCap: the latest the record opens, at full motion and on the
     economy tier, whatever the art's decode does (reduced motion: 180 ms).
   - holdsForArt: the cover ends covering the screen (it does not fade out to
     the page), so it waits there for the record's art, up to the cap.
   - status: spoken once, politely, while the cover plays. */
export type FormGateSpec = {
  life: string;
  cap: number;
  calmCap: number;
  holdsForArt: boolean;
  status: string;
};

export const FORM_GATES: Partial<Record<FormTheme, FormGateSpec>> = {
  rexonance: {
    life: "rexonanceGateLife",
    cap: 1400,
    calmCap: 1400,
    holdsForArt: false,
    status: "レクソナンスサーガの記録を展開中",
  },
  explom: {
    life: "explomGateLife",
    cap: 2000,
    calmCap: 1300,
    holdsForArt: true,
    status: "エクスプロムの記録を展開中",
  },
  kemonohen: {
    life: "kemonohenGateLife",
    cap: 2100,
    calmCap: 1400,
    holdsForArt: true,
    status: "犭フォームの記録を展開中",
  },
};

export const formGate = (theme?: FormTheme) => (theme ? FORM_GATES[theme] : undefined);

/* Where the cover's light starts, in viewport pixels: Explom bursts from the
   open control the reader pressed; 犭 opens the art's own eyes. */
export type GateScene = {
  w: number;
  h: number;
  /** The impact point (Explom) or the eyes' midpoint (犭). */
  x: number;
  y: number;
  /** 犭: the two eyes, [lx, ly, rx, ry]; the eye spacing in px sets their size. */
  eyes: [number, number, number, number] | null;
  seed: number;
};

/* The beast's eyes in each supplied 犭 art (fractions of the image). Another
   file gets no alignment: the light then opens at the frame's centre. */
const KEMONOHEN_EYES: Record<string, [number, number, number, number]> = {
  "/rider-leddic-kemonohen-9237.jpeg": [0.498, 0.241, 0.527, 0.241],
};

const percent = (value: string | undefined, fallback: number) => {
  const match = value?.match(/^(-?\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) / 100 : fallback;
};

/** A point of an <img>'s picture (fractions of the image) in viewport pixels,
 * through its object-fit and object-position. */
export function artPoint(img: HTMLImageElement | null | undefined, fx: number, fy: number) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const box = img.getBoundingClientRect?.();
  if (!box || box.width < 2 || box.height < 2) return null;
  const style = window.getComputedStyle?.(img);
  const fit = style?.objectFit || "fill";
  const [px, py] = (style?.objectPosition || "50% 50%").split(/\s+/);
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (fit === "fill")
    return { x: box.left + fx * box.width, y: box.top + fy * box.height, scale: 1 };
  const scale =
    fit === "cover"
      ? Math.max(box.width / nw, box.height / nh)
      : fit === "none"
        ? 1
        : Math.min(box.width / nw, box.height / nh, fit === "scale-down" ? 1 : Infinity);
  const dw = nw * scale;
  const dh = nh * scale;
  const left = box.left + (box.width - dw) * percent(px, 0.5);
  const top = box.top + (box.height - dh) * percent(py ?? px, 0.5);
  return { x: left + fx * dw, y: top + fy * dh, scale };
}

const onScreen = (x: number, y: number, w: number, h: number) =>
  x >= 0 && y >= 0 && x <= w && y <= h;

/** Measured once, as the cover starts. Safe without layout (tests). */
export function measureGateScene(
  theme: FormTheme,
  opener: HTMLElement | null,
  card: HTMLElement | null,
): GateScene {
  const w = Math.max(1, Math.round(window.innerWidth || 0));
  const h = Math.max(1, Math.round(window.innerHeight || 0));
  let x = w / 2;
  let y = h * 0.42;
  let eyes: GateScene["eyes"] = null;
  try {
    if (theme === "explom") {
      // The thumb has travelled to the control's far end when it opens.
      const box = opener?.getBoundingClientRect?.();
      const visual = card?.querySelector?.(".form-pickup-visual")?.getBoundingClientRect?.();
      if (
        box &&
        box.width > 0 &&
        onScreen(box.right - box.height / 2, box.top + box.height / 2, w, h)
      ) {
        x = box.right - box.height / 2;
        y = box.top + box.height / 2;
      } else if (visual && visual.width > 0) {
        x = Math.min(w, Math.max(0, visual.left + visual.width / 2));
        y = Math.min(h, Math.max(0, visual.top + visual.height / 2));
      }
    } else if (theme === "kemonohen") {
      // The card names its file in src; its delivery candidates keep the frame.
      const img = card?.querySelector?.<HTMLImageElement>(".form-pickup-visual > img");
      const map = KEMONOHEN_EYES[img?.getAttribute("src") ?? ""];
      const left = map && artPoint(img, map[0], map[1]);
      const right = map && artPoint(img, map[2], map[3]);
      if (left && right && onScreen(left.x, left.y, w, h) && onScreen(right.x, right.y, w, h)) {
        eyes = [left.x, left.y, right.x, right.y];
        x = (left.x + right.x) / 2;
        y = (left.y + right.y) / 2;
      }
    }
  } catch {
    /* A detached or unmeasurable card keeps the frame's centre. */
  }
  return {
    w,
    h,
    x,
    y,
    eyes,
    seed: (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663) ^ (w * 83492791),
  };
}

/** The record's own eyes (犭): where the cover's light comes to rest. The
 * arrival's eyes stand there and travel in from where the cover's burned;
 * without a measurable figure they stay where the cover had them and fade. */
export function placeArrival(
  dialog: HTMLDialogElement | null,
  theme: FormTheme | undefined,
  scene: GateScene | null,
) {
  const arrival = dialog?.querySelector?.<HTMLElement>(".form-arrival");
  if (!arrival || !scene) return;
  const set = (name: string, value: string) => arrival.style.setProperty(name, value);
  set("--gate-x", `${scene.x}px`);
  set("--gate-y", `${scene.y}px`);
  if (theme !== "kemonohen") return;
  const from = scene.eyes ?? [scene.x - 16, scene.y, scene.x + 16, scene.y];
  const gap = Math.max(18, Math.hypot(from[2] - from[0], from[3] - from[1]));
  let to: [number, number, number, number] = from;
  try {
    const img = dialog?.querySelector?.<HTMLImageElement>(".form-pickup-layout > figure > img");
    const map = KEMONOHEN_EYES[img?.getAttribute("src") ?? ""];
    const left = map && artPoint(img, map[0], map[1]);
    const right = map && artPoint(img, map[2], map[3]);
    if (
      left &&
      right &&
      onScreen(left.x, left.y, scene.w, scene.h) &&
      onScreen(right.x, right.y, scene.w, scene.h)
    )
      to = [left.x, left.y, right.x, right.y];
  } catch {
    /* The light fades where it is. */
  }
  const [lx, ly, rx, ry] = to;
  set("--lx", `${lx}px`);
  set("--ly", `${ly}px`);
  set("--rx", `${rx}px`);
  set("--ry", `${ry}px`);
  // The eyes keep the cover's size as they leave it and take the art's.
  set("--gap", `${gap}px`);
  set("--eye-dx", `${scene.x - (lx + rx) / 2}px`);
  set("--eye-dy", `${scene.y - (ly + ry) / 2}px`);
  const landed = Math.max(4, Math.hypot(rx - lx, ry - ly));
  set("--eye-scale", (Math.min(1.6, (1.6 * landed) / Math.max(26, gap)) || 1).toFixed(3));
}
