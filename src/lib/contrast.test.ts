import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  formatRatio,
  meetsAA,
  parseHex,
  relativeLuminance,
} from "./contrast";
import {
  STATUS_COLORS_DARK,
  STATUS_COLORS_LIGHT,
  TOKENS_DARK,
  TOKENS_LIGHT,
} from "./tokens";

describe("parseHex", () => {
  it("parses 6-digit hex", () => {
    expect(parseHex("#facc15")).toEqual({ r: 250, g: 204, b: 21 });
  });

  it("parses 3-digit shorthand by doubling channels", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("is case-insensitive and tolerates a missing #", () => {
    expect(parseHex("FACC15")).toEqual(parseHex("#facc15"));
  });

  it("rejects anything that isn't a hex colour", () => {
    expect(() => parseHex("#ggg")).toThrow();
    expect(() => parseHex("#ff")).toThrow();
    expect(() => parseHex("rebeccapurple")).toThrow();
    expect(() => parseHex("")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("anchors at the WCAG endpoints", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 1:1 for a colour against itself", () => {
    expect(contrastRatio("#facc15", "#facc15")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#18181b", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#18181b"),
      5,
    );
  });
});

/**
 * These are not tests of the maths — they are tests of the design direction.
 * §11.1 makes specific contrast claims; if a token is ever "adjusted" in a way
 * that breaks one, this fails and says which rule was broken.
 */
describe("the yellow rules (§11.1) — hard constraints", () => {
  it("--signal on --paper fails as text, which is why --deep exists", () => {
    const ratio = contrastRatio(TOKENS_LIGHT.signal, TOKENS_LIGHT.paper);

    // The prompt says "~1.4:1". The real figure is ~1.53:1 — still nowhere near
    // the 4.5:1 floor, and the rule stands either way.
    expect(ratio).toBeLessThan(2);
    expect(meetsAA(ratio, "text")).toBe(false);

    // It also fails the 3:1 non-text floor, so yellow can't carry meaning on
    // white unaided either — it needs --ink or --deep to do the work.
    expect(meetsAA(ratio, "non-text")).toBe(false);
  });

  it("--deep is legible as text on --paper (the sanctioned alternative)", () => {
    const ratio = contrastRatio(TOKENS_LIGHT.deep, TOKENS_LIGHT.paper);
    expect(meetsAA(ratio, "text")).toBe(true);
    expect(ratio).toBeGreaterThan(6); // ~6.85:1
  });

  it("--ink on --signal is clean, so the primary button holds up", () => {
    const ratio = contrastRatio(TOKENS_LIGHT.ink, TOKENS_LIGHT.signal);
    expect(meetsAA(ratio, "text")).toBe(true);
    expect(ratio).toBeGreaterThan(11); // the prompt claims 12:1
  });

  it("--signal is legible on the dark wash — the dark theme's whole premise", () => {
    const ratio = contrastRatio(TOKENS_DARK.signal, TOKENS_DARK.wash);
    expect(meetsAA(ratio, "text")).toBe(true);
    expect(ratio).toBeGreaterThan(12);
  });
});

describe("text tokens meet AA on their surfaces", () => {
  const cases = [
    ["light", TOKENS_LIGHT],
    ["dark", TOKENS_DARK],
  ] as const;

  for (const [mode, t] of cases) {
    it(`${mode}: --ink on --paper and --wash`, () => {
      expect(meetsAA(contrastRatio(t.ink, t.paper), "text")).toBe(true);
      expect(meetsAA(contrastRatio(t.ink, t.wash), "text")).toBe(true);
    });

    it(`${mode}: --mute on --paper and --wash (labels, timestamps)`, () => {
      expect(meetsAA(contrastRatio(t.mute, t.paper), "text")).toBe(true);
      expect(meetsAA(contrastRatio(t.mute, t.wash), "text")).toBe(true);
    });

    it(`${mode}: --deep on --paper (links)`, () => {
      expect(meetsAA(contrastRatio(t.deep, t.paper), "text")).toBe(true);
    });
  }
});

describe("status dots meet the 3:1 non-text floor (WCAG 1.4.11)", () => {
  /* The dot is the entire colour budget of a chip (§11.3) — it is the only
     thing distinguishing present from absent at a glance, so it has to clear
     the non-text floor on every surface it sits on, in both themes.

     This caught a real bug: --status-pending was #a1a1aa, which is 2.56:1 on
     white. The pending dot drives the rep queue, so it was the worst possible
     one to have failed. */
  const modes = [
    ["light", STATUS_COLORS_LIGHT, TOKENS_LIGHT],
    ["dark", STATUS_COLORS_DARK, TOKENS_DARK],
  ] as const;

  for (const [mode, colors, t] of modes) {
    for (const [name, hex] of Object.entries(colors)) {
      it(`${mode}: ${name} on --paper`, () => {
        const ratio = contrastRatio(hex, t.paper);
        expect(meetsAA(ratio, "non-text"), formatRatio(ratio)).toBe(true);
      });

      it(`${mode}: ${name} on --wash`, () => {
        const ratio = contrastRatio(hex, t.wash);
        expect(meetsAA(ratio, "non-text"), formatRatio(ratio)).toBe(true);
      });
    }
  }
});

describe("the focus ring is visible on every surface it lands on (§11.8)", () => {
  /* The ring is bicolor — a --signal core hemmed by an --ink edge — because
     --signal alone cannot clear 3:1 on a light surface. See the :focus-visible
     rule in globals.css.

     This first test is the reason that design exists. If someone "simplifies"
     the ring back to plain yellow, the focus indicator silently becomes
     invisible on white, and this is the test that should have caught it. */
  it("a --signal-only ring would FAIL on light surfaces — hence the ink edge", () => {
    for (const surface of [TOKENS_LIGHT.paper, TOKENS_LIGHT.wash]) {
      const ratio = contrastRatio(TOKENS_LIGHT.signal, surface);
      expect(meetsAA(ratio, "non-text")).toBe(false);
    }
  });

  it("the bicolor ring clears 3:1 on every surface, via one tone or the other", () => {
    const surfaces = [
      ["light --paper", TOKENS_LIGHT.paper, TOKENS_LIGHT],
      ["light --wash", TOKENS_LIGHT.wash, TOKENS_LIGHT],
      ["dark --paper", TOKENS_DARK.paper, TOKENS_DARK],
      ["dark --wash", TOKENS_DARK.wash, TOKENS_DARK],
    ] as const;

    for (const [label, surface, t] of surfaces) {
      const signal = contrastRatio(t.signal, surface);
      const ink = contrastRatio(t.ink, surface);
      const best = Math.max(signal, ink);

      expect(
        meetsAA(best, "non-text"),
        `${label}: signal ${formatRatio(signal)}, ink ${formatRatio(ink)}`,
      ).toBe(true);
    }
  });

  it("on light surfaces it is the ink edge that does the work", () => {
    // The yellow is brand; the ink is what you actually see against a white
    // card. Losing the ink edge would leave a 1.53:1 ring.
    expect(
      meetsAA(contrastRatio(TOKENS_LIGHT.ink, TOKENS_LIGHT.paper), "non-text"),
    ).toBe(true);
  });

  it("on dark surfaces the yellow carries it, and the ink edge is redundant", () => {
    // Worth stating plainly: in dark mode --ink is near-white and --signal is
    // yellow, so the two tones are ~1.5:1 against each other and the edge is
    // near-invisible. That is fine and intended — the ring only has to contrast
    // with the SURFACE, and yellow on near-black is ~13:1. The edge is carried
    // for light mode's sake; it costs nothing here.
    expect(
      meetsAA(contrastRatio(TOKENS_DARK.signal, TOKENS_DARK.wash), "non-text"),
    ).toBe(true);
  });
});
