"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/status-chip";
import { reportPresent } from "../actions";
import { deviceFingerprint } from "../device";
import { deriveStatus } from "../rules/derive-status";
import type { AttendanceStatus } from "../rules/types";
import type { TodaySession } from "../queries";

/**
 * The live session card — the rules engine made visible (§5).
 *
 * The yellow hairline along the bottom fills as the present window elapses, so a
 * student can see at a glance how long they have to be counted present rather
 * than late. It is a PREDICTION: it runs deriveStatus (the same function the
 * server will use) against a server-supplied clock, and is allowed to be a
 * second wrong — the server never reads it (§2.3). The countdown anchors on a
 * server timestamp plus the offset to this device's clock, because the device's
 * clock is assumed hostile.
 */
export function LiveSessionCard({
  session,
  serverNowMs,
  timezone,
}: {
  session: TodaySession;
  serverNowMs: number;
  timezone: string;
}) {
  // Every time comparison below is against `now`, which is the SERVER clock: the
  // effect measures this device's offset from the server once, on mount, and
  // ticks against it. The device's own clock is assumed hostile and is read only
  // to measure that offset, never to decide anything (§2.3).
  const [now, setNow] = useState(serverNowMs);

  // A status the student sees immediately on submit, before the RSC revalidates.
  const [optimisticStatus, setOptimisticStatus] = useState<AttendanceStatus | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  const start = useMemo(() => new Date(session.startsAt).getTime(), [session.startsAt]);
  const end = useMemo(() => new Date(session.endsAt).getTime(), [session.endsAt]);
  const presentEnd = start + session.rules.presentWithinMinutes * 60_000;
  const lateEnd = start + session.rules.lateWithinMinutes * 60_000;

  const isOpen = session.sessionStatus === "open";
  const myStatus = optimisticStatus ?? session.myStatus;
  const alreadyReported = myStatus !== null;

  // Tick once a second only while there is a live window to count down. A closed
  // or already-reported card is static — no timer, no wasted renders.
  useEffect(() => {
    if (!isOpen || alreadyReported) return;
    const offset = serverNowMs - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOpen, alreadyReported, serverNowMs]);

  // What a submission right now would be marked, if approved — the same call the
  // server makes on approval. `absent` only when the rule says beyond-late is
  // absent; otherwise late.
  const predicted = deriveStatus({
    sessionStatus: "open",
    sessionStartsAt: new Date(start),
    submittedAt: new Date(now),
    approvedAt: null,
    decision: "approved",
    permissionRequested: false,
    permission: null,
    permissionCountsAsExcused: false,
    rules: session.rules,
  });

  // Present-window progress for the hairline: 0 at start, 1 when the window
  // closes. Clamped, so a card opened mid-window or after it does not overflow.
  const progress = Math.min(1, Math.max(0, (now - start) / (presentEnd - start)));

  const secsLeftInPresent = Math.max(0, Math.ceil((presentEnd - now) / 1000));
  const secsLeftInLate = Math.max(0, Math.ceil((lateEnd - now) / 1000));

  return (
    <li className="relative overflow-hidden rounded-card border border-line">
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-14 font-semibold text-ink" data-numeric>
              {session.courseCode} · {session.sectionCode}
            </p>
            <p className="mt-0.5 line-clamp-1 text-13 text-mute">{session.courseTitle}</p>
          </div>
          <p className="shrink-0 text-right font-mono text-12 text-mute" data-numeric>
            {fmtTime(start, timezone)}–{fmtTime(end, timezone)}
            {session.room ? <span className="block">{session.room}</span> : null}
          </p>
        </div>

        {alreadyReported ? (
          <ReportedState status={myStatus} />
        ) : isOpen ? (
          <LiveControls
            phase={now < presentEnd ? "present" : now < lateEnd ? "late" : "beyond"}
            predicted={predicted}
            secsLeftInPresent={secsLeftInPresent}
            secsLeftInLate={secsLeftInLate}
            onReport={() => setCodeOpen(true)}
          />
        ) : session.sessionStatus === "scheduled" ? (
          <p className="text-13 text-mute">
            Not open yet. Your rep opens attendance when class starts.
          </p>
        ) : session.sessionStatus === "cancelled" ? (
          <p className="text-13 text-mute">This session was cancelled.</p>
        ) : (
          <p className="text-13 text-mute">
            Attendance for this session has closed.
          </p>
        )}
      </div>

      {/* The signature hairline. Present phase only: it is the present window
          elapsing, so it has nothing to say once that window is gone. Degrades
          to a static bar under prefers-reduced-motion via the global rule. */}
      {isOpen && !alreadyReported && now < presentEnd ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      ) : null}

      <CodeDialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        sessionId={session.id}
        onReported={(status) => {
          setOptimisticStatus(status);
          setCodeOpen(false);
        }}
      />
    </li>
  );
}

function ReportedState({ status }: { status: AttendanceStatus }) {
  const waiting = status === "pending_verification";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-13 text-mute">You&apos;re marked</span>
        <StatusChip status={status} />
      </div>
      {waiting ? (
        <p className="text-12 text-mute">
          Reported. Waiting for your rep to confirm — you don&apos;t need to do
          anything else.
        </p>
      ) : null}
    </div>
  );
}

function LiveControls({
  phase,
  predicted,
  secsLeftInPresent,
  secsLeftInLate,
  onReport,
}: {
  phase: "present" | "late" | "beyond";
  predicted: AttendanceStatus;
  secsLeftInPresent: number;
  secsLeftInLate: number;
  onReport: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-13">
          {phase === "present" ? (
            <p className="text-ink">
              Present window ·{" "}
              <span className="font-mono text-mute" data-numeric>
                {fmtCountdown(secsLeftInPresent)} left
              </span>
            </p>
          ) : phase === "late" ? (
            <p className="text-ink">
              Late window ·{" "}
              <span className="font-mono text-mute" data-numeric>
                {fmtCountdown(secsLeftInLate)} left
              </span>
            </p>
          ) : (
            <p className="text-ink">Window passed — you can still report.</p>
          )}
          <p className="mt-0.5 flex items-center gap-1.5 text-12 text-mute">
            Report now → <StatusChip status={predicted} />
          </p>
        </div>
      </div>

      <Button className="w-full" onClick={onReport}>
        Report present
      </Button>
    </div>
  );
}

function CodeDialog({
  open,
  onClose,
  sessionId,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onReported: (status: AttendanceStatus) => void;
}) {
  const [code, setCode] = useState("");

  const report = useAction(reportPresent, {
    onSuccess({ data }) {
      if (!data) return;
      // Idempotent server-side: a retry returns the existing record, so a double
      // tap or an offline replay lands here with the same status, not an error.
      if (data.status === "pending_verification") {
        toast.success("Reported. Your rep will confirm it.");
      } else {
        toast.success("You already reported for this session.");
      }
      onReported(data.status as AttendanceStatus);
      setCode("");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not report attendance.");
    },
  });

  const canSubmit = code.trim().length > 0 && !report.isPending;

  function submit() {
    report.execute({
      sessionId,
      code: code.trim(),
      deviceFingerprint: deviceFingerprint(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report present</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field
            label="Attendance code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code on the screen"
            hint="Ask your rep if you can't see it."
            // Big, thumb-friendly, monospaced — this is the one input on a phone
            // in a full lecture hall.
            className="[&_input]:h-12 [&_input]:font-mono [&_input]:text-18 [&_input]:tracking-[0.4em]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submit();
            }}
          />

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={report.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {report.isPending ? "Reporting…" : "Report present"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fmtTime(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
