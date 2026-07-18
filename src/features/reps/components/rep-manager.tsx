"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appointRep, listSectionRoster, revokeRep } from "../actions";
import type { RepRow, RepSection } from "../queries";

/**
 * Appoint and revoke course reps, per section.
 *
 * §4's model made visible: a rep is a row with a period, not a flag on a user.
 * So appointing is adding a row, revoking is ending one (never deleting it),
 * and a section can hold several at once — co-reps sit side by side here.
 *
 * The screen only ever shows sections the caller can actually act on, so there
 * is no appoint button that 403s. That scoping is done on the server; this
 * component trusts the list it is given.
 */
export function RepManager({ sections }: { sections: RepSection[] }) {
  if (sections.length === 0) {
    return (
      <EmptyState
        title="No sections to manage"
        next="Reps are appointed per section. When you own a section — or an admin assigns you one — it appears here."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: RepSection }) {
  const [appointing, setAppointing] = useState(false);
  const [revoking, setRevoking] = useState<RepRow | null>(null);

  return (
    <section className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-14 font-semibold text-ink">
            <span className="font-mono" data-numeric>
              {section.courseCode}
            </span>{" "}
            {section.sectionCode}
          </h2>
          <p className="mt-0.5 text-13 text-mute">
            {section.courseTitle} · {section.semesterName}
          </p>
        </div>
        <Button size="sm" onClick={() => setAppointing(true)}>
          Appoint a rep
        </Button>
      </div>

      {section.reps.length === 0 ? (
        <p className="mt-3 text-13 text-mute">
          No rep yet. Attendance for this section cannot be verified until one is
          appointed.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-card border border-line">
          {section.reps.map((rep) => (
            <li
              key={rep.assignmentId}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-13 font-medium text-ink">
                  {rep.fullName}
                  {rep.state !== "active" ? (
                    <span className="ml-2 text-12 text-mute">{rep.state}</span>
                  ) : null}
                </p>
                <p className="font-mono text-12 text-mute" data-numeric>
                  {rep.matricNumber ?? "—"} · from {rep.startsAt.slice(0, 10)}
                  {rep.endsAt ? ` to ${rep.endsAt.slice(0, 10)}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevoking(rep)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AppointDialog
        key={appointing ? "open" : "closed"}
        section={section}
        open={appointing}
        onClose={() => setAppointing(false)}
      />
      <RevokeDialog
        key={revoking?.assignmentId ?? "none"}
        rep={revoking}
        sectionId={section.id}
        onClose={() => setRevoking(null)}
      />
    </section>
  );
}

function AppointDialog({
  section,
  open,
  onClose,
}: {
  section: RepSection;
  open: boolean;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const roster = useAction(listSectionRoster);
  const appoint = useAction(appointRep, {
    onSuccess() {
      toast.success("Appointed.");
      onClose();
    },
  });

  // Load the roster once, as the dialog opens. Students who already hold an
  // un-revoked appointment here are left off — re-appointing the same person
  // would clash with the exclusion constraint, and a co-rep is a different
  // person, not the same one twice.
  const takenIds = new Set(section.reps.map((r) => r.userId));
  useEffect(() => {
    if (open) roster.execute({ classSectionId: section.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section.id]);

  const students = (roster.result?.data ?? []).filter((s) => !takenIds.has(s.id));
  const serverError = appoint.result?.serverError;

  function submit() {
    appoint.execute({
      classSectionId: section.id,
      userId,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Appoint a rep for {section.courseCode} {section.sectionCode}
          </DialogTitle>
          <DialogDescription>
            A rep must be a student enrolled in this section — the job is
            confirming who is physically in the room.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Student</Label>
            <Select value={userId} onValueChange={setUserId} disabled={roster.isPending}>
              <SelectTrigger>
                <SelectValue
                  placeholder={roster.isPending ? "Loading roster…" : "Choose a student"}
                />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                    {s.matricNumber ? ` · ${s.matricNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!roster.isPending && students.length === 0 ? (
              <p className="text-12 text-mute">
                {roster.result?.data && roster.result.data.length > 0
                  ? "Every enrolled student already holds an appointment here."
                  : "No enrolled students to appoint. Enrol students first."}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Starts"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              hint="Optional. Defaults to now; a later date is a scheduled handover."
            />
            <Field
              label="Ends"
              type="date"
              value={endsAt}
              min={startsAt || undefined}
              onChange={(e) => setEndsAt(e.target.value)}
              hint="Optional. Open-ended if left blank."
            />
          </div>

          {serverError ? (
            <p
              role="alert"
              className="rounded-control border border-line px-3 py-2 text-13 text-status-absent"
            >
              {serverError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={appoint.isPending}>
              Cancel
            </Button>
            <Button disabled={!userId || appoint.isPending} onClick={submit}>
              {appoint.isPending ? "Appointing…" : "Appoint rep"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  rep,
  sectionId,
  onClose,
}: {
  rep: RepRow | null;
  sectionId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  const revoke = useAction(revokeRep, {
    onSuccess() {
      toast.success("Revoked.");
      onClose();
    },
  });

  const serverError = revoke.result?.serverError;

  return (
    <Dialog open={rep !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke {rep?.fullName}&rsquo;s appointment?</DialogTitle>
          <DialogDescription>
            This ends their authority now. The appointment stays on the record —
            attendance they approved keeps its history — but they can no longer
            verify anyone in this section.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this appointment is ending"
            hint="Required. Kept in the audit log — this is what someone reads in week 14."
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
            <Button variant="outline" onClick={onClose} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || revoke.isPending}
              onClick={() =>
                rep &&
                revoke.execute({
                  assignmentId: rep.assignmentId,
                  classSectionId: sectionId,
                  reason,
                })
              }
            >
              {revoke.isPending ? "Revoking…" : "Revoke appointment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
