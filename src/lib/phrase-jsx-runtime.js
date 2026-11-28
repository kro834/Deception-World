// "react/jsx-runtime" for the site's own JSX (vite.config.ts, phraseJsxRuntime):
// React's runtime, with the text of host elements and fragments phrased
// (src/lib/phrase-children.js). Libraries keep React's runtime unchanged.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { phraseElement } from "./phrase-children.js";

export { Fragment };
export const jsx = (type, props, key) => phraseElement(reactJsx, type, props, key);
export const jsxs = (type, props, key) => phraseElement(reactJsxs, type, props, key);
