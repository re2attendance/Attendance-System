/**
 * Theme constants and types — deliberately free of any server import.
 *
 * `ThemeSwitch` is a client component and needs `THEMES` and `Theme`. When these lived
 * beside `readTheme()`, importing them dragged `next/headers` into the browser bundle and
 * the build failed outright. The server half is in `theme-server.ts`.
 */
export const THEME_COOKIE = "theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}
