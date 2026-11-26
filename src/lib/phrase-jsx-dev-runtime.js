// "react/jsx-dev-runtime" for the site's own JSX in development; see
// phrase-jsx-runtime.js.
import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { phraseElement } from "./phrase-children.js";

export { Fragment };
export const jsxDEV = (type, props, key, isStatic, source, self) =>
  phraseElement(
    (kind, next, id) => reactJsxDEV(kind, next, id, isStatic, source, self),
    type,
    props,
    key,
  );
