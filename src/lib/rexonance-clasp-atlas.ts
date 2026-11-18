import { REXONANCE_CLASP_ATLAS } from "./nanite-surface-assets.js";

// Only an active renderer starts a request. All players read the same image
// on their next frame, so a slow request holds no route or canvas alive.
const atlas: { current: HTMLImageElement | null } = { current: null };
let loading = false;

export function prepareRexonanceClasps() {
  if (loading || atlas.current || typeof Image === "undefined") return atlas;
  const image = new Image();
  loading = true;
  image.decoding = "async";
  const finish = () => {
    image.onload = null;
    image.onerror = null;
    loading = false;
  };
  image.onload = () => {
    if (image.naturalWidth === 512 && image.naturalHeight === 512) atlas.current = image;
    finish();
  };
  image.onerror = finish;
  image.src = REXONANCE_CLASP_ATLAS;
  return atlas;
}
