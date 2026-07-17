import type { Database } from "@/db/types";
import { cn } from "@/lib/utils";

/* Derived from the schema, not restated. supabase/migrations is the single
   source of truth (ADR-001), so adding a status to the enum makes the Record
   maps below fail to typecheck until every one of them handles it — which is
   exactly what should happen. Phase 1 hand-wrote this union with a note to come
   back; this is that. */
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];

/* §11.3 — quiet chips, not a rainbow.

   The chip itself is always the same: 12px, --mute text, transparent
   background, 1px --line border. Colour lives ONLY in the 6px dot. On a
   register grid of 300 students × 40 sessions, saturated chips are unreadable
   noise, so the dot is the entire colour budget.

   Note what is absent: yellow. It is the brand, so it cannot also mean "late"
   — a UI where the brand colour is also a state is a UI nobody can read. Late
   is orange, and yellow is not a status colour anywhere in this product. */
const DOT: Record<AttendanceStatus, string> = {
  present: "bg-status-present",
  late: "bg-status-late",
  absent: "bg-status-absent",
  permission_granted: "bg-status-info",

  /* Outline dots read as "related to, but not the same as" their filled
     counterpart: excused ~ permission_granted, rejected ~ absent. */
  excused: "border border-status-info bg-transparent",
  rejected: "border border-status-absent bg-transparent",

  /* Both pending states share a treatment — the distinction that matters to a
     reader is "someone still has to act on this". `animate-pulse` degrades to
     static under prefers-reduced-motion via the global rule in globals.css. */
  pending_verification: "bg-status-pending motion-safe:animate-pulse",
  pending_permission_review: "bg-status-pending motion-safe:animate-pulse",

  cancelled: "bg-mute",
};

const LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  permission_granted: "Permission granted",
  excused: "Excused",
  rejected: "Rejected",
  pending_verification: "Pending verification",
  pending_permission_review: "Pending permission review",
  cancelled: "Cancelled",
};

export function StatusChip({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border border-line px-2 py-0.5 text-xs text-mute",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", DOT[status])}
      />
      <span className={cn(status === "cancelled" && "line-through")}>
        {LABEL[status]}
      </span>
    </span>
  );
}
