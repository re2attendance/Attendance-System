import { cn } from "@/lib/utils";

/**
 * §11.7: "Empty states are an instruction, not a mood."
 *
 * So this takes a `next` — the thing to do — and has nowhere to put an
 * illustration. §11.9 names illustrated empty states as an anti-tell, and the
 * reason is that a drawing of an empty box tells a student nothing they can act
 * on. "No sessions today. Your next class is CSC 401, Thursday 10:00." tells
 * them everything.
 *
 * The `action` slot is for when the instruction IS a button. An empty course
 * list should offer to create a course, not describe the absence of courses.
 */
export function EmptyState({
  title,
  next,
  action,
  className,
}: {
  /** What is not here. One line, sentence case, no exclamation mark. */
  title: string;
  /** What to do about it. This is the part that earns the component. */
  next?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-14 text-ink">{title}</p>
      {next ? (
        <p className="mx-auto mt-1 max-w-prose text-13 text-mute">{next}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
