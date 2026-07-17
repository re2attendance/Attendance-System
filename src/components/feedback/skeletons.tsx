import { cn } from "@/lib/utils";

/**
 * §11.8: "Loading skeletons matched to final layout, not spinners."
 *
 * The "matched to final layout" half is the whole point and the half that gets
 * skipped. A skeleton that is the wrong shape is a spinner that lies: the page
 * reflows when the data lands, and the reflow is what people notice. So these
 * take the same row height and column count as the table they stand in for.
 *
 * animate-pulse degrades to static under prefers-reduced-motion via the global
 * rule in globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded-chip bg-line", className)}
    />
  );
}

/** Matches DataTable: 44px rows on desktop, same column count. */
export function TableSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      className="rounded-card border border-line"
      role="status"
      aria-label="Loading"
    >
      <div className="border-b border-line px-4 py-2.5">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-11 items-center gap-4 border-b border-line px-4 last:border-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3", c === 0 ? "w-40" : "w-20")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
