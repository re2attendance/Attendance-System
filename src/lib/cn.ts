/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately not clsx + tailwind-merge: nothing here overrides a caller's utility with
 * a conflicting one, so the merge half would be two dependencies solving a problem this
 * codebase does not have yet. Revisit if a component starts taking a `className` that
 * needs to beat its own defaults.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
