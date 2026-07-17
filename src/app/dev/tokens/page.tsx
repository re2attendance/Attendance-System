import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { StatusChip, type AttendanceStatus } from "@/components/ui/status-chip";
import { ThemeToggle } from "@/components/theme-toggle";
import { contrastRatio, formatRatio, meetsAA } from "@/lib/contrast";
import {
  STATUS_COLORS_DARK,
  STATUS_COLORS_LIGHT,
  TOKENS_DARK,
  TOKENS_LIGHT,
} from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Tokens · Attendance",
};

/* Phase 1 acceptance criteria (§14): "A /dev/tokens page rendering every token,
   status chip, and control state — this is the reference the rest of the build
   derives from."

   It is also the live contrast audit. §11.8 wants AA "verified, not assumed",
   so every pairing below is computed by lib/contrast.ts at render time rather
   than asserted in a comment. The same function backs contrast.test.ts, so the
   gate fails if a token regresses — this page is where you SEE it, CI is where
   it stops you.

   Not linked from any nav. It ships in the tree on purpose: a design reference
   that only exists on a branch stops being true by week three. */

const SECTION = "border-t border-line pt-6 mt-10 first:mt-0 first:border-0 first:pt-0";
const H2 = "text-14 font-semibold text-ink";
const NOTE = "mt-1 text-12 text-mute max-w-2xl";

function Ratio({ fg, bg, use = "text" }: { fg: string; bg: string; use?: "text" | "non-text" }) {
  const ratio = contrastRatio(fg, bg);
  const pass = meetsAA(ratio, use);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-12">
      <span className={pass ? "text-status-present" : "text-status-absent"}>
        {pass ? "PASS" : "FAIL"}
      </span>
      <span className="text-mute">{formatRatio(ratio)}</span>
    </span>
  );
}

/* Deliberately verdict-free. An earlier version ran every token through the
   PASS/FAIL badge, which printed "FAIL 1.00:1" against --paper — i.e. --paper
   measured against itself — and "FAIL 1.26:1" for --line, whose entire job is
   to be a hairline you barely notice. Neither is a defect, and a reference page
   that cries wolf teaches people to ignore the word FAIL, which is the one
   thing it cannot afford. The ratio is shown as information; the verdicts live
   in the audits below, where a failure means something. */
function Swatch({
  name,
  hex,
  onSurface,
}: {
  name: string;
  hex: string;
  onSurface: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line p-3">
      <div
        className="size-10 shrink-0 rounded-control border border-line"
        style={{ background: hex }}
      />
      <div className="min-w-0">
        <div className="font-mono text-13 text-ink">--{name}</div>
        <div className="font-mono text-12 text-mute uppercase">{hex}</div>
        <div className="mt-0.5 font-mono text-12 text-mute">
          {formatRatio(contrastRatio(hex, onSurface))} on --paper
        </div>
      </div>
    </div>
  );
}

const ALL_STATUSES: AttendanceStatus[] = [
  "pending_verification",
  "pending_permission_review",
  "unverified",
  "present",
  "late",
  "permission_granted",
  "excused",
  "absent",
  "rejected",
  "cancelled",
];

const TYPE_SCALE = [
  ["text-12", "12px", "labels, eyebrows, chips"],
  ["text-13", "13px", "table cells, labels"],
  ["text-14", "14px", "default UI text"],
  ["text-16", "16px", ""],
  ["text-20", "20px", ""],
  ["text-24", "24px", "page titles, max"],
  ["text-32", "32px", "the session code only"],
] as const;

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-24 font-semibold text-ink">Design tokens</h1>
          <p className={NOTE}>
            The reference every other screen derives from. Contrast ratios are
            computed live by <span className="font-mono">lib/contrast.ts</span>{" "}
            — the same function the test suite asserts against. Toggle the theme
            to audit both.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* ── Colour ─────────────────────────────────────────────────────── */}
      <section className={`${SECTION} mt-8`}>
        <h2 className={H2}>Colour</h2>
        <p className={NOTE}>
          Ratios shown against <span className="font-mono">--paper</span> at the
          3:1 non-text floor. Text pairings are audited separately below.
        </p>

        <h3 className="mt-4 text-12 tracking-wide text-mute">Light</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(TOKENS_LIGHT).map(([name, hex]) => (
            <Swatch key={name} name={name} hex={hex} onSurface={TOKENS_LIGHT.paper} />
          ))}
        </div>

        <h3 className="mt-6 text-12 tracking-wide text-mute">Dark</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(TOKENS_DARK).map(([name, hex]) => (
            <Swatch key={name} name={name} hex={hex} onSurface={TOKENS_DARK.paper} />
          ))}
        </div>

        <h3 className="mt-6 text-12 tracking-wide text-mute">
          Text pairings — 4.5:1 AA floor
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["light", TOKENS_LIGHT],
              ["dark", TOKENS_DARK],
            ] as const
          ).flatMap(([mode, t]) =>
            (["ink", "mute", "deep"] as const).flatMap((fg) =>
              (["paper", "wash"] as const).map((bg) => (
                <div
                  key={`${mode}-${fg}-${bg}`}
                  className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2"
                >
                  <span className="font-mono text-12 text-ink">
                    {mode} · --{fg} on --{bg}
                  </span>
                  <Ratio fg={t[fg]} bg={t[bg]} />
                </div>
              )),
            ),
          )}
        </div>
      </section>

      {/* ── The yellow rules ───────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className={H2}>The yellow rules</h2>
        <p className={NOTE}>
          Yellow is never text on a light surface, and never a status colour. The
          first row is the proof — it is why <span className="font-mono">--deep</span>{" "}
          exists.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-13">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4 text-12 font-medium tracking-wide text-mute uppercase">
                  Pairing
                </th>
                <th className="py-2 pr-4 text-12 font-medium tracking-wide text-mute uppercase">
                  Sample
                </th>
                <th className="py-2 pr-4 text-12 font-medium tracking-wide text-mute uppercase">
                  AA text
                </th>
                <th className="py-2 text-12 font-medium tracking-wide text-mute uppercase">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody className="text-ink">
              <tr className="border-b border-line">
                <td className="py-3 pr-4 font-mono text-12">--signal on --paper</td>
                <td className="py-3 pr-4">
                  <span
                    className="rounded-chip px-2 py-1"
                    style={{ background: TOKENS_LIGHT.paper, color: TOKENS_LIGHT.signal }}
                  >
                    Report present
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Ratio fg={TOKENS_LIGHT.signal} bg={TOKENS_LIGHT.paper} />
                </td>
                <td className="py-3 text-12 text-mute">Banned as text. Use --deep.</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 pr-4 font-mono text-12">--deep on --paper</td>
                <td className="py-3 pr-4">
                  <span
                    className="rounded-chip px-2 py-1"
                    style={{ background: TOKENS_LIGHT.paper, color: TOKENS_LIGHT.deep }}
                  >
                    Report present
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Ratio fg={TOKENS_LIGHT.deep} bg={TOKENS_LIGHT.paper} />
                </td>
                <td className="py-3 text-12 text-mute">Yellow-toned text and links.</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-3 pr-4 font-mono text-12">--ink on --signal</td>
                <td className="py-3 pr-4">
                  <span
                    className="rounded-chip px-2 py-1"
                    style={{ background: TOKENS_LIGHT.signal, color: TOKENS_LIGHT.ink }}
                  >
                    Report present
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Ratio fg={TOKENS_LIGHT.ink} bg={TOKENS_LIGHT.signal} />
                </td>
                <td className="py-3 text-12 text-mute">The primary button.</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-mono text-12">--signal on dark --wash</td>
                <td className="py-3 pr-4">
                  <span
                    className="rounded-chip px-2 py-1"
                    style={{ background: TOKENS_DARK.wash, color: TOKENS_DARK.signal }}
                  >
                    Report present
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Ratio fg={TOKENS_DARK.signal} bg={TOKENS_DARK.wash} />
                </td>
                <td className="py-3 text-12 text-mute">
                  Yellow is at its best on near-black.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className={`${NOTE} mt-3`}>
          Yellow&rsquo;s five sanctioned uses: primary button fill · active-nav 2px
          left bar · focus ring · live-session progress hairline · session-code
          ring. A sixth means deleting one.
        </p>
      </section>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className={H2}>Status chips</h2>
        <p className={NOTE}>
          Colour lives only in the 6px dot. On a register grid of 300 students ×
          40 sessions, saturated chips are noise. Note what is absent: yellow.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </div>

        <h3 className="mt-6 text-12 tracking-wide text-mute">
          Dot contrast — 3:1 non-text floor, on --paper
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(STATUS_COLORS_LIGHT).map(([name, hex]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: hex }}
                  aria-hidden="true"
                />
                <span className="font-mono text-12 text-ink">--{name}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-12 text-mute">
                  light <Ratio fg={hex} bg={TOKENS_LIGHT.paper} use="non-text" />
                </span>
                <span className="font-mono text-12 text-mute">
                  dark{" "}
                  <Ratio
                    fg={STATUS_COLORS_DARK[name as keyof typeof STATUS_COLORS_DARK]}
                    bg={TOKENS_DARK.paper}
                    use="non-text"
                  />
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Type ───────────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className={H2}>Type</h2>
        <p className={NOTE}>
          Inter for UI, JetBrains Mono for every number and identifier. The scale
          is 12/13/14/16/20/24/32 — 18px is not reachable, because the{" "}
          <span className="font-mono">--text-*</span> namespace is cleared before
          it is redefined. Tailwind&rsquo;s stock{" "}
          <span className="font-mono">text-20</span> would have been 18px.
        </p>

        <div className="mt-3 divide-y divide-line">
          {TYPE_SCALE.map(([cls, px, use]) => (
            <div key={cls} className="flex items-baseline gap-4 py-2.5">
              <span className="w-20 shrink-0 font-mono text-12 text-mute">{cls}</span>
              <span className="w-12 shrink-0 font-mono text-12 text-mute">{px}</span>
              <span className={cls}>Attendance</span>
              {use ? <span className="ml-auto text-12 text-mute">{use}</span> : null}
            </div>
          ))}
        </div>

        <h3 className="mt-6 text-12 tracking-wide text-mute">
          Tabular figures — digits must not jitter
        </h3>
        <div className="mt-2 rounded-card border border-line p-3">
          <div className="font-mono text-13 text-ink" data-numeric>
            <div>CSC/2021/0417</div>
            <div>PRESENT WINDOW · 7:12 LEFT</div>
            <div>94.7%</div>
          </div>
        </div>
      </section>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <section className={SECTION}>
        <h2 className={H2}>Controls</h2>
        <p className={NOTE}>
          Tab through these — the focus ring is bicolor (a --signal core with an
          --ink edge) because yellow alone is 1.53:1 on white and would not be a
          visible focus indicator. Default size is 44px: the minimum hit target,
          so the accessible size is the default and going smaller is deliberate.
        </p>

        {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(
          (variant) => (
            <div key={variant} className="mt-4">
              <div className="font-mono text-12 text-mute">{variant}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant={variant}>Report present</Button>
                <Button variant={variant} size="sm">
                  Small
                </Button>
                <Button variant={variant} size="xs">
                  Extra small
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </div>
            </div>
          ),
        )}

        <div className="mt-6">
          <div className="font-mono text-12 text-mute">radius</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ["rounded-chip", "4px · chips"],
              ["rounded-control", "6px · controls"],
              ["rounded-card", "8px · cards"],
            ].map(([cls, label]) => (
              <div
                key={cls}
                className={`border border-line px-3 py-6 text-12 text-mute ${cls}`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="font-mono text-12 text-mute">surfaces</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-paper p-4">
              <div className="text-13 text-ink">Card — 1px --line, radius 8</div>
              <div className="mt-1 text-12 text-mute">
                No shadow. Shadows exist only on things that float above the
                page: popover, dialog, sheet, dropdown, toast.
              </div>
            </div>
            <div className="rounded-card border border-line bg-ink p-4">
              <div className="text-13 text-paper">
                Ink surface — the live session card
              </div>
              <div className="mt-1 text-12 text-mute">
                Full-bleed, with the yellow hairline along its bottom edge.
                Ships in Phase 6.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
