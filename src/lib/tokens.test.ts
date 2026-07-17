import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STATUS_COLORS_DARK,
  STATUS_COLORS_LIGHT,
  TOKENS_DARK,
  TOKENS_LIGHT,
} from "./tokens";

/**
 * globals.css is the source of truth for the palette (§11.1). tokens.ts is a
 * mirror of it for tooling. These tests parse the real stylesheet and fail if
 * the two disagree, so the mirror cannot rot into a lie.
 */

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/** Pull the custom-property declarations out of a `selector { ... }` block. */
function blockVars(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match?.[1]) throw new Error(`No \`${selector}\` block in globals.css`);

  const vars: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(
    /^\s*--([\w-]+):\s*([^;]+);/gm,
  )) {
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

function tsFilesUnder(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory doesn't exist yet (features/ arrives in Phase 4)
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(tsFilesUnder(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip line and block comments — the token docs quote hexes on purpose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("globals.css ↔ tokens.ts", () => {
  it("light tokens match the :root block", () => {
    const css = blockVars(":root");
    for (const [name, hex] of Object.entries(TOKENS_LIGHT)) {
      expect(css[name]?.toLowerCase(), `--${name} in :root`).toBe(hex);
    }
  });

  it("dark tokens match the .dark block", () => {
    const css = blockVars(".dark");
    for (const [name, hex] of Object.entries(TOKENS_DARK)) {
      expect(css[name]?.toLowerCase(), `--${name} in .dark`).toBe(hex);
    }
  });

  it("light status colours match the :root block", () => {
    const css = blockVars(":root");
    for (const [name, hex] of Object.entries(STATUS_COLORS_LIGHT)) {
      expect(css[name]?.toLowerCase(), `--${name} in :root`).toBe(hex);
    }
  });

  it("dark status colours match the .dark block", () => {
    const css = blockVars(".dark");
    for (const [name, hex] of Object.entries(STATUS_COLORS_DARK)) {
      expect(css[name]?.toLowerCase(), `--${name} in .dark`).toBe(hex);
    }
  });

  it("redefines every token in dark, so nothing falls back silently", () => {
    const dark = blockVars(".dark");
    const names = [
      ...Object.keys(TOKENS_LIGHT),
      ...Object.keys(STATUS_COLORS_LIGHT),
    ];
    for (const name of names) {
      expect(dark[name], `--${name} missing from .dark`).toBeDefined();
    }
  });
});

describe("hardcoded colour ban (§11.1)", () => {
  /* "Never hardcode a hex anywhere else." globals.css is the one sanctioned
     home and tokens.ts is its tested mirror. This is a coarse guard, but it
     catches the common case: a hex pasted into a component. */
  it("no hex literals in app, components, or features code", () => {
    const offenders: string[] = [];

    for (const root of ["src/app", "src/components", "src/features"]) {
      for (const file of tsFilesUnder(join(ROOT, root))) {
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        for (const [i, line] of lines.entries()) {
          if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
            offenders.push(`${relative(ROOT, file)}:${i + 1}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Stock Tailwind utilities are banned — and this test is the ONLY thing that
 * enforces it.
 *
 * This corrects a false claim (ADR-011). Phase 1 asserted, in CLAUDE.md and in
 * ADR-007, that clearing the `--color-*` and `--text-*` namespaces made
 * `bg-indigo-500` "a build error rather than a code-review comment". It does
 * not. Tailwind v4 silently emits NO CSS for an unknown utility: the build
 * passes, nothing warns, and the class is simply inert. Verified by pasting
 * `bg-indigo-500 rounded-md text-lg text-sm` into a page — clean build, zero
 * matching rules in the output.
 *
 * So the namespace clearing is still worth having, but for a weaker reason than
 * advertised: the indigo cannot RENDER, because no rule exists to render it.
 * What it never did was tell anyone. And the failure modes differ by namespace:
 *
 *   · colour — `bg-indigo-500` produces no background. Visible, if you look.
 *   · radius — `rounded-md` produces square corners. Visible, if you look.
 *   · TYPE   — `text-sm` produces nothing, so the element INHERITS 14px from
 *              body. Which is what upstream meant by text-sm anyway. It looks
 *              perfect. Nothing is visibly wrong, and `text-xs` on a caption
 *              silently renders at 14px instead of 12px forever.
 *
 * That last one is why this is a test and not a lint rule to write "later".
 */
describe("stock Tailwind utility ban (§11.1, §11.2, §11.4, §11.9)", () => {
  const SIZE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/;
  /* Only the dashed forms. A bare `rounded` is technically a stock utility too,
     but matching it hits the English word — the first run flagged a test named
     "sub-minute precision is preserved, not rounded". A guard that cries wolf
     gets deleted, so this one deliberately under-reaches: bare `rounded` also
     resolves to nothing under a cleared namespace, so the cost of missing it is
     square corners, which are visible. */
  const RADIUS = /\brounded-(none|xs|sm|md|lg|xl|[2-9]xl)\b/;
  const PALETTE = new RegExp(
    "\\b(bg|text|border|ring|from|via|to|fill|stroke|decoration|outline|accent|caret|divide|placeholder|shadow)-" +
      "(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-" +
      "(50|\\d{3})\\b",
  );

  function scan(pattern: RegExp): string[] {
    const offenders: string[] = [];
    for (const root of ["src/app", "src/components", "src/features"]) {
      for (const file of tsFilesUnder(join(ROOT, root))) {
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        for (const [i, line] of lines.entries()) {
          if (pattern.test(line)) {
            offenders.push(`${relative(ROOT, file)}:${i + 1} — ${line.trim().slice(0, 70)}`);
          }
        }
      }
    }
    return offenders;
  }

  it("no stock type-scale classes — the scale is named by pixel size", () => {
    // text-sm/base/lg do not exist here. A pasted shadcn component uses them
    // meaning 14/16/18px and gets silence, which inherits 14px and looks fine.
    // Ours are text-12 … text-32.
    expect(scan(SIZE)).toEqual([]);
  });

  it("no stock palette classes — §11.9 names a stray indigo as an anti-tell", () => {
    expect(scan(PALETTE)).toEqual([]);
  });

  it("no stock radius classes — only chip/control/card (§11.4: no pills)", () => {
    // `rounded-full` is deliberately permitted: §11.4 allows it on avatars, and
    // the 6px status dots are circles by nature. The negative lookahead spares
    // rounded-chip/control/card.
    expect(scan(RADIUS)).toEqual([]);
  });
});
