import type { CSSProperties } from "react";

// Renders a solid-color PNG glyph (transparent background) as a CSS mask so
// it inherits `currentColor` — the same way the surrounding nav label's
// active/inactive and light/dark color already works, without needing a
// separate icon file per state.
export function maskIconStyle(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}
