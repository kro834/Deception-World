// The /rexonance-3d viewer as one self-contained page (no React, no site chrome), for
// sharing the model outside the site. scripts/build-rexonance-3d-standalone.mjs bundles
// this file with three.js and writes the page; the GLB arrives embedded as base64.
import { createRexonanceScene, type RexonanceScene, type RexonanceStatus } from "./scene.ts";
import {
  REXONANCE_DEFAULT_VIEW,
  REXONANCE_VIEWS,
  rexonanceView,
  type RexonanceViewId,
} from "./views.ts";

export type RexonanceStandaloneOptions = {
  /** The packed GLB as base64. */
  modelBase64: string;
  scaleMapUrl: string;
  dracoDecoderPath: string;
  /** Folder of the four reference sheets (<id>.webp). */
  referencePath: string;
};

const STATUS_COPY: Record<RexonanceStatus, string> = {
  loading: "立体模型を読み込み中",
  ready: "立体模型を表示しました",
  error: "立体模型を表示できませんでした。WebGL が使えるブラウザーで開き直してください。",
};

const SHEET_LABEL: Record<string, string> = {
  "front-10": "正面",
  "right-07": "右側面",
  "back-09": "背面",
  "left-08": "左側面",
};

function decodeBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Rexonance standalone: missing ${selector}`);
  return element;
}

/** Wires the page's markup (see the build script) to a Rexonance scene. */
export function mountRexonanceStandalone(root: HTMLElement, options: RexonanceStandaloneOptions) {
  const stage = required<HTMLElement>(root, "[data-rx-stage]");
  const status = required<HTMLElement>(root, "[data-rx-status]");
  const viewButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-rx-view]"));
  const rotate = required<HTMLButtonElement>(root, "[data-rx-rotate]");
  const pause = required<HTMLButtonElement>(root, "[data-rx-pause]");
  const sheetToggle = required<HTMLButtonElement>(root, "[data-rx-sheets]");
  const panel = required<HTMLElement>(root, "[data-rx-panel]");
  const sheetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-rx-sheet]"));
  const sheetImage = required<HTMLImageElement>(root, "[data-rx-sheet-image]");
  const sheetCaption = required<HTMLElement>(root, "[data-rx-sheet-caption]");
  const announce = required<HTMLElement>(root, "[data-rx-announce]");

  let scene: RexonanceScene | null = null;
  let ready = false;
  let autoRotate = false;
  let paused = false;
  let sheet = "front-10";

  const setReady = (next: boolean) => {
    ready = next;
    for (const button of [...viewButtons, rotate, pause]) button.disabled = !next;
  };
  const markView = (view: RexonanceViewId | null) => {
    for (const button of viewButtons)
      button.setAttribute("aria-pressed", String(button.dataset.rxView === view));
  };
  const showSheet = (id: string) => {
    sheet = id;
    sheetImage.src = `${options.referencePath}${id}.webp`;
    sheetImage.alt = `レクソナンスサーガの設定画、${SHEET_LABEL[id]}`;
    sheetCaption.textContent = `${SHEET_LABEL[id]}の設定画`;
    for (const button of sheetButtons)
      button.setAttribute("aria-pressed", String(button.dataset.rxSheet === id));
  };
  const fitInsets = () => {
    // Keep the suit clear of the title block and the toolbar.
    const box = stage.getBoundingClientRect();
    const bar = required<HTMLElement>(root, "[data-rx-toolbar]").getBoundingClientRect();
    const head = required<HTMLElement>(root, "[data-rx-head]").getBoundingClientRect();
    if (!box.height) return;
    scene?.setInsets({
      top: Math.min(0.3, Math.max(0, head.bottom - box.top) / box.height),
      bottom: Math.min(0.3, Math.max(0, box.bottom - bar.top) / box.height),
      side: 0,
    });
  };

  setReady(false);
  showSheet(sheet);
  markView(REXONANCE_DEFAULT_VIEW);
  root.dataset.viewerStatus = "loading";
  status.textContent = STATUS_COPY.loading;

  try {
    scene = createRexonanceScene(stage, {
      modelData: decodeBase64(options.modelBase64),
      scaleMapUrl: options.scaleMapUrl,
      dracoDecoderPath: options.dracoDecoderPath,
      onStatus: (next) => {
        root.dataset.viewerStatus = next;
        status.textContent = STATUS_COPY[next];
        if (next === "ready") {
          setReady(true);
          announce.textContent = STATUS_COPY.ready;
          fitInsets();
        }
      },
      onAutoRotateChange: (on) => {
        autoRotate = on;
        rotate.setAttribute("aria-pressed", String(on));
      },
      onViewChange: (next) => {
        markView(next);
        if (next && next !== "oblique") showSheet(rexonanceView(next).reference);
      },
    });
  } catch (error) {
    console.error("Rexonance WebGL initialization failed", error);
    root.dataset.viewerStatus = "error";
    status.textContent = STATUS_COPY.error;
    return;
  }

  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      const id = button.dataset.rxView as RexonanceViewId;
      if (!ready || !REXONANCE_VIEWS.some((view) => view.id === id)) return;
      scene?.setView(id);
      announce.textContent = `${rexonanceView(id).label}から表示`;
    });
  }
  rotate.addEventListener("click", () => scene?.setAutoRotate(!autoRotate));
  pause.addEventListener("click", () => {
    paused = !paused;
    scene?.setPaused(paused);
    pause.setAttribute("aria-pressed", String(paused));
    required<HTMLElement>(pause, "span").textContent = paused ? "再開" : "一時停止";
  });
  const setPanel = (open: boolean) => {
    panel.hidden = !open;
    sheetToggle.setAttribute("aria-expanded", String(open));
    root.dataset.referenceOpen = String(open);
  };
  sheetToggle.addEventListener("click", () => setPanel(panel.hidden));
  required<HTMLButtonElement>(panel, "[data-rx-close]").addEventListener("click", () =>
    setPanel(false),
  );
  for (const button of sheetButtons) {
    button.addEventListener("click", () => {
      const id = button.dataset.rxSheet!;
      showSheet(id);
      const view = REXONANCE_VIEWS.find((item) => item.reference === id && item.id !== "oblique");
      if (ready && view) scene?.setView(view.id);
    });
  }
  window.addEventListener("resize", fitInsets);
  document.addEventListener("visibilitychange", () => scene?.setBlocked(document.hidden));
}
