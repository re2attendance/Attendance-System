"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/cn";

type FieldProps = {
  label: string;
  /** Rendered opposite the label — "Forgot password", a character count. */
  action?: ReactNode;
  error?: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

/**
 * Label, control, and the one message beneath it.
 *
 * The error is wired through `aria-describedby` and announced politely rather than
 * assertively: a message that fires on every keystroke as someone types their index
 * number would talk over them.
 */
export function Field({ label, action, error, hint, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ink text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children({
        id,
        describedBy: message ? messageId : undefined,
        invalid: Boolean(error),
      })}
      {message ? (
        <p
          id={messageId}
          role={error ? "status" : undefined}
          aria-live={error ? "polite" : undefined}
          className={cn("mt-2 text-[0.8125rem]", error ? "text-danger" : "text-ink-soft")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
};

// Filled at rest, outlined on focus. A filled field reads as a bigger target on a phone
// than an outlined one of identical size, and the switch to white-plus-ring on focus
// makes the active field unmistakable when the keyboard covers half the screen.
export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "bg-sunken text-ink h-13 w-full rounded-xl border px-4 transition",
        "placeholder:text-ink-faint",
        "focus:bg-white focus:ring-4 focus:outline-none",
        invalid
          ? "border-danger bg-danger-soft focus:ring-danger/15"
          : "focus:border-brand-500 focus:ring-brand-500/15 border-transparent",
        className,
      )}
      {...props}
    />
  );
}
