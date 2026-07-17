"use client";

import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/* The usual next-themes toggle keeps a `mounted` flag in an effect, because the
   server cannot know the theme and rendering the real label immediately would
   hydrate-mismatch. We don't need it: next-themes has already put the `dark`
   class on <html> before paint, so CSS can choose the label. Both labels render,
   one is hidden, and there is no state, no effect, and nothing to mismatch.

   The accessible name stays constant ("Toggle theme") rather than tracking the
   target theme — aria-label cannot be driven by CSS, and a name that lies for
   one frame is worse than one that is merely general. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="min-w-20"
    >
      <span className="dark:hidden">Dark</span>
      <span className="hidden dark:inline">Light</span>
    </Button>
  );
}
