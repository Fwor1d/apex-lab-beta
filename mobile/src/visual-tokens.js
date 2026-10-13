// Canvas/SVG read the same semantic colors as CSS, once at initialization.
export function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(`--${name}`).trim();
  return {
    lime: read("lime"),
    red: read("red"),
    yellow: read("yellow"),
    green: read("green"),
    blue: read("blue"),
    purple: read("purple"),
  };
}
