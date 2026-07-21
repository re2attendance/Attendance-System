"use client";

import { useOptimistic, useTransition } from "react";

import { cn } from "@/lib/cn";
import { setTheme } from "@/lib/theme-actions";
import { THEMES, type Theme } from "@/lib/theme";

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Three states, not a two-way toggle.
 *
 * A plain light/dark switch has no way back to "follow my phone" once it is touched, so a
 * student who tries it at night is pinned to dark every morning afterwards. "System" is
 * the default and stays reachable.
 *
 * Optimistic, because the actual swap is a server round-trip that rewrites `data-theme` on
 * `<html>`: without it the pressed segment lags behind the colours it just changed.
 */
export function ThemeSwitch({ current }: { current: Theme }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(current);

  return (
    <fieldset
      className="border-line bg-sunken inline-flex rounded-xl border p-1"
      disabled={pending}
    >
      <legend className="sr-only">Appearance</legend>
      {THEMES.map((theme) => {
        const selected = optimistic === theme;
        return (
          <form
            key={theme}
            action={(formData) =>
              startTransition(async () => {
                setOptimistic(theme);
                await setTheme(formData);
              })
            }
          >
            <input type="hidden" name="theme" value={theme} />
            <button
              type="submit"
              aria-pressed={selected}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition",
                selected ? "bg-raised text-ink shadow-sm" : "text-ink-soft hover:text-ink",
              )}
            >
              {LABELS[theme]}
            </button>
          </form>
        );
      })}
    </fieldset>
  );
}
