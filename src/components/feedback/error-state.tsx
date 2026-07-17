import { cn } from "@/lib/utils";

/**
 * §11.7: "Errors say what happened and what to do."
 *
 * The signature enforces it — `what` and `next` are both required, so you
 * cannot render "Something went wrong" without also saying what to do about it.
 * The spec names that string specifically as the thing not to write.
 */
export function ErrorState({
  what,
  next,
  action,
  className,
}: {
  /** What happened. "Session closed at 10:12." — not "An error occurred." */
  what: string;
  /** What to do. "Ask your course rep to review this." */
  next: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-card border border-line px-6 py-8", className)}
    >
      <p className="text-14 text-ink">{what}</p>
      <p className="mt-1 max-w-prose text-13 text-mute">{next}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
