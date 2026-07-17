"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled input with its error wired up.
 *
 * §11.8: "Form errors announced to screen readers and tied to inputs with
 * aria-describedby." Doing that by hand on every field is how it gets forgotten
 * on the fourth one, so it is done once here:
 *
 *   · the label's htmlFor matches the input's id (useId, so it is unique even
 *     if two of these render on one page)
 *   · aria-describedby points at the error, and is ABSENT when there is no
 *     error — pointing at an empty element makes some screen readers announce
 *     nothing at all, which is worse than silence
 *   · aria-invalid drives the border, so the visual state and the announced
 *     state cannot disagree
 *   · role="alert" makes the error announce when it appears, rather than only
 *     when focus lands on the field
 */
export function Field({
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-12 text-mute">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-12 text-status-absent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
