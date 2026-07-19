"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { cancelSession, closeSession, openSession } from "../actions";
import type { SessionRow } from "../queries";

/** Session lifecycle, not attendance status — a different enum from StatusChip.
 * Colour lives in the dot only, same restraint as the register chips (§11.3). */
const SESSION_DOT: Record<string, string> = {
  scheduled: "bg-mute",
  open: "bg-status-present motion-safe:animate-pulse",
  closed: "border border-status-pending bg-transparent",
  cancelled: "bg-mute",
};

const SESSION_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

function SessionStatus({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip border border-line px-2 py-0.5 text-12 text-mute">
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", SESSION_DOT[status] ?? "bg-mute")}
      />
      <span className={cn(status === "cancelled" && "line-through")}>
        {SESSION_LABEL[status] ?? status}
      </span>
    </span>
  );
}

/**
 * The dated sessions of a section, and the controls that move each through its
 * life: open it (arm the code), close it (write the absences), or cancel it.
 *
 * Which buttons a row shows is a function of its status, mirroring the
 * transitions the 0017 functions allow — only a scheduled session can be
 * opened, only a scheduled or open one cancelled, a closed one is done. The
 * server re-checks every one of these, so a stale button costs an error toast,
 * not a bad write.
 */
export function SessionList({
  classSectionId,
  timezone,
  rows,
  total,
  page,
  pageSize,
}: {
  classSectionId: string;
  timezone: string;
  rows: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);

  const fmtDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const open = useAction(openSession, {
    onSuccess() {
      toast.success("Session opened.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not open the session.");
    },
  });
  const close = useAction(closeSession, {
    onSuccess({ data }) {
      const n = data?.absencesWritten ?? 0;
      toast.success(
        n === 0
          ? "Session closed."
          : `Session closed. ${n} absence${n === 1 ? "" : "s"} recorded.`,
      );
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not close the session.");
    },
  });

  const pendingId =
    (open.isPending && open.input?.sessionId) ||
    (close.isPending && close.input?.sessionId) ||
    null;

  const columns: DataTableColumn<SessionRow>[] = [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <span data-numeric>{fmtDate.format(new Date(row.original.startsAt))}</span>
      ),
    },
    {
      id: "time",
      header: "Time",
      meta: { cardLabel: "Time" },
      cell: ({ row }) => (
        <span data-numeric>
          {fmtTime.format(new Date(row.original.startsAt))}–
          {fmtTime.format(new Date(row.original.endsAt))}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      meta: { cardLabel: "Status" },
      cell: ({ row }) => <SessionStatus status={row.original.status} />,
    },
    {
      id: "records",
      header: "Records",
      meta: { hideOnMobile: true },
      cell: ({ row }) => <span data-numeric>{row.original.recordCount}</span>,
    },
    {
      id: "actions",
      header: "",
      meta: { cardLabel: "" },
      cell: ({ row }) => {
        const s = row.original;
        const busy = pendingId === s.id;
        return (
          <div className="flex justify-end gap-1">
            {s.status === "scheduled" ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => open.execute({ sessionId: s.id, classSectionId })}
              >
                Open
              </Button>
            ) : null}
            {s.status === "open" ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => close.execute({ sessionId: s.id, classSectionId })}
              >
                Close
              </Button>
            ) : null}
            {s.status === "scheduled" || s.status === "open" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setCancelling(s)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-16 font-semibold text-ink">Sessions</h2>
        <p className="mt-0.5 text-13 text-mute">
          Open a session to take attendance; closing it records absences for
          anyone who never checked in.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: "No sessions yet",
          next: "Add a schedule rule above, then generate sessions to populate the calendar.",
        }}
      />

      <DataTablePagination page={page} pageSize={pageSize} total={total} />

      <CancelForm
        key={cancelling?.id ?? "none"}
        classSectionId={classSectionId}
        session={cancelling}
        onClose={() => setCancelling(null)}
      />
    </section>
  );
}

function CancelForm({
  classSectionId,
  session,
  onClose,
}: {
  classSectionId: string;
  session: SessionRow | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  const cancel = useAction(cancelSession, {
    onSuccess() {
      toast.success("Session cancelled.");
      onClose();
    },
  });

  const serverError = cancel.result?.serverError;
  const canSubmit = reason.trim().length > 0;

  return (
    <Dialog open={session !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this session</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <p className="text-13 text-mute">
            A cancelled session takes no attendance and records no absences.
            Students see it marked cancelled on their calendar.
          </p>

          <Field
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lecturer unavailable"
            hint="Shown to students and kept on the record."
          />

          {serverError ? (
            <p
              role="alert"
              className="rounded-control border border-line px-3 py-2 text-13 text-status-absent"
            >
              {serverError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
              Keep session
            </Button>
            <Button
              disabled={!canSubmit || cancel.isPending || !session}
              onClick={() =>
                session &&
                cancel.execute({ sessionId: session.id, classSectionId, reason })
              }
            >
              {cancel.isPending ? "Cancelling…" : "Cancel session"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
