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
