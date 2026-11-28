// The inline wrappers of the phrase-unit pass (src/lib/phrase-children.js).
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "dw-u": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "dw-t": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
