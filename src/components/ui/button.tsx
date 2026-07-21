import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  /** Replaces the label with a spinner and blocks input. */
  busy?: boolean;
};

// h-13 (52px) rather than the 44px minimum: this is the one control on the screen, it is
// pressed with a thumb, often while walking into a lecture hall.
const base =
  "inline-flex h-13 w-full items-center justify-center gap-2.5 rounded-xl px-5 " +
  "text-[0.9375rem] font-semibold transition active:scale-[0.99] " +
  "disabled:pointer-events-none disabled:opacity-55";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-line bg-white text-ink hover:bg-sunken hover:border-ink-faint/40",
} as const;

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <button
      className={cn(base, variants[variant], className)}
      disabled={disabled || busy}
      // Screen readers otherwise announce nothing when the label swaps for a spinner.
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      // Decorative: aria-busy on the button already carries the meaning.
      aria-hidden="true"
    />
  );
}
