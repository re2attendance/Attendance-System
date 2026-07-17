/**
 * WCAG 2.1 contrast math.
 *
 * §11.8 asks for AA contrast "verified, not assumed". This is the verifier:
 * /dev/tokens uses it to compute every pairing live, and contrast.test.ts pins
 * the ratios the design direction asserts — most importantly that --signal on a
 * light surface fails as text, which is the reason --deep exists at all.
 *
 * Pure. No DOM, no imports. Per §11.1 the hexes live in globals.css; this file
 * only knows how to do the arithmetic.
 *
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export type Rgb = { r: number; g: number; b: number };

/** Parse `#rgb` or `#rrggbb` into 0–255 channels. Throws on anything else. */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");

  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  // noUncheckedIndexedAccess: the regex above guarantees 3 matches, but the
  // type system cannot know that, so this is checked rather than asserted.
  const parts = expanded.match(/../g);
  if (!parts || parts.length !== 3) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  const [r, g, b] = parts.map((p) => parseInt(p, 16));
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return { r, g, b };
}

/** Undo the sRGB transfer function for one 0–255 channel. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) → 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

/** WCAG contrast ratio between two colours, 1 → 21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastUse = "text" | "large-text" | "non-text";

/**
 * Does this pairing meet WCAG 2.1 AA for the given use?
 *
 * - `text`       ≥ 4.5:1 (1.4.3) — body copy, labels, anything under 18.66px bold / 24px
 * - `large-text` ≥ 3:1   (1.4.3) — our scale tops out at 32px, so page titles only
 * - `non-text`   ≥ 3:1   (1.4.11) — status dots, borders, focus rings, chart marks
 */
export function meetsAA(ratio: number, use: ContrastUse = "text"): boolean {
  return use === "text" ? ratio >= 4.5 : ratio >= 3;
}

/** `6.85:1` — for display on /dev/tokens. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
