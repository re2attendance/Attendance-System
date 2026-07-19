"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { decideAttendance, decideAttendanceBulk } from "../actions";
import type { QueueRecord, VerifyContext } from "../queries";

/**
 * The rep verify queue — the screen a rep lives in for the length of a class.
 *
 * Fed by TanStack Query over a Realtime subscription (§2.1): a new "present"
 * appears the moment it lands, without a refresh. Realtime is not a guarantee
 * (§6 risk 5), so a dropped socket raises a stale banner and a reconnect
 * refetches — a rep who cannot see pending requests is a rep who marks the hall
 * absent, and the honest failure is to SAY the data is stale, not to pretend.
 *
 * Every verdict is re-checked by the server (decide_attendance, 0018): a stale
 * button costs an error toast, never a bad write, and two reps deciding one row
 * resolve to a single verdict.
 */
export function VerifyQueue({
  context,
  classSectionId,
  currentUserId,
  initialQueue,
  timezone,
}: {
  context: VerifyContext;
  classSectionId: string;
  currentUserId: string;
  initialQueue: QueueRecord[];
  timezone: string;
}) {
  // Lazy-init: one browser client for this component's life, created in the
  // sanctioned place (a useState initializer) rather than during render.
  const [supabase] = useState(() => createClient());
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["verify-queue", context.sessionId], [context.sessionId]);
  const [live, setLive] = useState(true);

  const { data: queue = [], refetch } = useQuery({
    queryKey,
    queryFn: () => fetchQueue(supabase, context.sessionId),
    initialData: initialQueue,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Realtime: any change to this session's records reshapes the queue. We
  // invalidate rather than patch, so the ordering and the RLS filter stay the
  // server's job, not a merge we could get wrong.
  useEffect(() => {
    const channel = supabase
      .channel(`verify-${context.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `session_id=eq.${context.sessionId}`,
        },
        () => invalidate(),
      )
      .subscribe((status) => {
        // SUBSCRIBED means live; anything else means the push channel is down and
        // the list may be behind. Refetch on the way back up.
        if (status === "SUBSCRIBED") {
          setLive(true);
          refetch();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setLive(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, context.sessionId, invalidate, refetch]);

  const single = useAction(decideAttendance, {
    onSuccess({ data }) {
      if (data?.alreadyDecided) toast.info("A co-rep had already decided that one.");
      invalidate();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save that decision.");
    },
  });

  const bulk = useAction(decideAttendanceBulk, {
    onSuccess({ data }) {
      if (!data) return;
      const parts = [`Decided ${data.decided}`];
      if (data.skipped > 0) parts.push(`${data.skipped} already handled`);
      toast.success(parts.join(" · "));
      invalidate();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save those decisions.");
    },
  });

  // A rep cannot decide their OWN request (conflict of interest, §4). It still
  // shows in the queue — hiding it would be a lie about what is pending — but
  // with a note instead of buttons, and it is excluded from every bulk.
  const eligibleIds = queue
    .filter((r) => r.studentId !== currentUserId)
    .map((r) => r.id);

  const busy = single.isPending || bulk.isPending;

  return (
    <div className="grid gap-6">
      <div>
        <a href="/rep" className="text-13 text-mute hover:text-ink">
          ← Sessions
        </a>
        <h1 className="mt-2 text-24 font-semibold text-ink">
          <span className="font-mono" data-numeric>
            {context.courseCode} · {context.sectionCode}
          </span>
        </h1>
        <p className="mt-1 text-13 text-mute">{context.courseTitle}</p>
      </div>

      {context.sessionStatus === "open" ? (
        <div className="flex items-center gap-2 rounded-card border border-line p-4 text-13 text-mute">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-status-present motion-safe:animate-pulse"
          />
          Session is open — approve students as they report in.
        </div>
      ) : (
        <div className="rounded-card border border-line p-4 text-13 text-mute">
          This session is {context.sessionStatus}. You can still clear any
          requests that were never decided.
        </div>
      )}

      {!live ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-card border border-status-late/40 bg-status-late/5 px-4 py-3 text-13"
        >
          <span className="text-ink">
            Live updates dropped — this list may be behind.
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-16 font-semibold text-ink">
            Pending{" "}
            <span className="font-mono text-mute" data-numeric>
              ({queue.length})
            </span>
          </h2>
          {eligibleIds.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  bulk.execute({
                    classSectionId,
                    sessionId: context.sessionId,
                    decision: "rejected",
                    recordIds: eligibleIds,
                  })
                }
              >
                Reject all
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  bulk.execute({
                    classSectionId,
                    sessionId: context.sessionId,
                    decision: "approved",
                    recordIds: eligibleIds,
                  })
                }
              >
                Approve all ({eligibleIds.length})
              </Button>
            </div>
          ) : null}
        </div>

        {queue.length === 0 ? (
          <div className="rounded-card border border-line p-6 text-center text-13 text-mute">
            Nothing waiting. New requests appear here as students report.
          </div>
        ) : (
          <ul className="grid gap-2">
            {queue.map((r) => (
              <QueueRow
                key={r.id}
                record={r}
                timezone={timezone}
                isOwn={r.studentId === currentUserId}
                disabled={busy}
                onApprove={() =>
                  single.execute({ recordId: r.id, classSectionId, decision: "approved" })
                }
                onReject={() =>
                  single.execute({ recordId: r.id, classSectionId, decision: "rejected" })
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QueueRow({
  record,
  timezone,
  isOwn,
  disabled,
  onApprove,
  onReject,
}: {
  record: QueueRecord;
  timezone: string;
  isOwn: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const shared = record.flags.includes("shared_device");
  return (
    <li className="flex items-center gap-3 rounded-card border border-line p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-14 text-ink">{record.studentName}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-mute">
          {record.matricNumber ? (
            <span className="font-mono" data-numeric>
              {record.matricNumber}
            </span>
          ) : null}
          <span data-numeric>{fmtSubmitted(record.submittedAt, timezone)}</span>
          {shared ? (
            <span className="inline-flex items-center gap-1 rounded-chip border border-status-late/50 px-1.5 text-status-late">
              <span aria-hidden className="size-1.5 rounded-full bg-status-late" />
              Shared device
            </span>
          ) : null}
        </p>
      </div>

      {isOwn ? (
        <span className="shrink-0 text-12 text-mute">Your request — a co-rep decides</span>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onReject}>
            Reject
          </Button>
          <Button size="sm" disabled={disabled} onClick={onApprove}>
            Approve
          </Button>
        </div>
      )}
    </li>
  );
}

async function fetchQueue(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<QueueRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `id, student_id, submitted_at, status, anti_proxy_flags,
       profiles!student_id(full_name, matric_number)`,
    )
    .eq("session_id", sessionId)
    .in("status", ["pending_verification", "unverified"])
    .order("submitted_at", { ascending: true, nullsFirst: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.profiles.full_name,
    matricNumber: r.profiles.matric_number,
    submittedAt: r.submitted_at,
    status: r.status,
    flags: r.anti_proxy_flags ?? [],
  }));
}

function fmtSubmitted(iso: string | null, timeZone: string): string {
  if (!iso) return "no submission";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}
