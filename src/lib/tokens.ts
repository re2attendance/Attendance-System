/**
 * The token values, as data.
 *
 * globals.css is the source of truth (§11.1) — this is a mirror, so that
 * /dev/tokens can display and verify the palette and so contrast.test.ts can
 * assert against it. Nothing that renders product UI may import this: use the
 * Tailwind utilities (`bg-paper`, `text-mute`) or the CSS variables.
 *
 * tokens.test.ts parses globals.css and fails if this file drifts from it, so
 * the mirror cannot rot silently. If you change a colour, change globals.css
 * first, then here, and the test will confirm they agree.
 */

export const TOKENS_LIGHT = {
  paper: "#ffffff",
  wash: "#fafaf9",
  ink: "#18181b",
  mute: "#71717a",
  line: "#e7e5e4",
  signal: "#facc15",
  deep: "#854d0e",
} as const;

export const TOKENS_DARK = {
  paper: "#141414",
  wash: "#0a0a0a",
  ink: "#fafaf9",
  mute: "#a1a1aa",
  line: "#262626",
  signal: "#facc15",
  deep: "#facc15",
} as const;

export const STATUS_COLORS_LIGHT = {
  "status-present": "#24a379",
  "status-late": "#d16025",
  "status-absent": "#df536a",
  "status-info": "#5188e1",
  "status-pending": "#71717a",
} as const;

export const STATUS_COLORS_DARK = {
  "status-present": "#24a379",
  "status-late": "#d16025",
  "status-absent": "#df536a",
  "status-info": "#5188e1",
  "status-pending": "#a1a1aa",
} as const;

export type TokenName = keyof typeof TOKENS_LIGHT;
export type StatusColorName = keyof typeof STATUS_COLORS_LIGHT;
