import * as React from "react";

import { cn } from "@/lib/utils";

/* Adapted from shadcn's input. Changes from upstream, each deliberate:

   · rounded-md → rounded-control (6px, §11.4).
   · shadow-xs dropped. §11.4: shadows only on things that float above the page.
   · text-base/text-sm/md:text-sm → text-16. Upstream's `text-base md:text-sm`
     is the classic iOS trick — 16px on mobile so Safari does not zoom the
     viewport when the field focuses, 14px on desktop. We keep the 16px and drop
     the desktop step-down: this is a form, not a table, and a student typing a
     6-digit session code one-handed on a cracked phone is the case that
     matters (§11.6). 16px is in our scale.
   · focus ring removed. globals.css puts a bicolor 2px ring on every
     :focus-visible element (ADR-008). shadcn's ring-[3px] would double it.
   · h-9 → h-11. §11.4: 44×44 minimum hit target.

   The stock-utility guard (ADR-011) caught rounded-md and text-sm/base on the
   way in, by file and line. That is what it is for. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-control border border-line bg-paper px-3 py-1 text-16 text-ink outline-none transition-colors duration-150 ease-out",
        "selection:bg-signal selection:text-ink placeholder:text-mute",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
