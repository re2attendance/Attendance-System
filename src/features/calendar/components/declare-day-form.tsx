"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { declareCalendarEvent, previewDeclaration } from "../actions";

/**
 * Declare a holiday or an impromptu emergency.
 *
 * Two things this screen must get right, both from ADR-012:
 *
 *   1. SCOPE is visible, not implied. The person needs to see whether they are
 *      taking their own section off, or the whole university. An admin gets
 *      both options; a rep only ever sees their sections, because the option
 *      they cannot use should not be a thing they try.
 *
 *   2. An EMERGENCY voids attendance students already earned. That is the one
 *      irreversible thing in this product's daily use, so it goes through a
 *      confirmation that names the number of approved records it will take
 *      back. §0 requires the dialog; the counts are what make it a decision
 *      rather than a formality.
 */
export function DeclareDayForm({
  sections,
  canDeclareInstitutionWide,
  institutionToday,
}: {
  sections: { id: string; label: string }[];
  canDeclareInstitutionWide: boolean;
  /** Today in the institution's timezone, from the server. */
  institutionToday: string;
}) {
  const [eventType, setEventType] = useState<"holiday" | "emergency">("holiday");
  const [date, setDate] = useState(institutionToday);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<string>(
    canDeclareInstitutionWide ? "institution" : (sections[0]?.id ?? ""),
  );

  const { execute, isPending, result } = useAction(declareCalendarEvent, {
    onSuccess({ data }) {
      const voided = data?.recordsVoided ?? 0;
      toast.success(
        voided > 0
          ? `Declared. ${data?.sessionsCancelled ?? 0} sessions cancelled, ${voided} records voided.`
          : "Declared.",
      );
      setTitle("");
      setReason("");
    },
  });

  const isEmergency = eventType === "emergency";
  const sectionId = scope === "institution" ? null : scope;
  const serverError = result?.serverError;

  return (
    <div className="rounded-card border border-line p-4">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>What kind of day</Label>
          <Select
            value={eventType}
            onValueChange={(v) => {
              const next = v as "holiday" | "emergency";
              setEventType(next);
              // An emergency is today, by rule. Moving the date field to today
              // when they switch saves them discovering that from an error.
              if (next === "emergency") setDate(institutionToday);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="holiday">Holiday — planned, no classes</SelectItem>
              <SelectItem value="emergency">
                Emergency — impromptu, students cannot come in
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-12 text-mute">
            {isEmergency
              ? "An emergency can only be declared for today, as it happens. It cancels today's sessions and voids attendance already submitted — including records a rep has approved."
              : "A holiday is planned ahead. It stops sessions being generated and stops students submitting attendance on the day."}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label>Applies to</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {canDeclareInstitutionWide ? (
                <SelectItem value="institution">
                  The whole institution
                </SelectItem>
              ) : null}
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!canDeclareInstitutionWide ? (
            <p className="text-12 text-mute">
              You can declare days for the sections you represent. Closing the
              whole institution is an administrator&rsquo;s decision.
            </p>
          ) : null}
        </div>

        <Field
          label="Date"
          type="date"
          value={date}
          min={institutionToday}
          disabled={isEmergency}
          onChange={(e) => setDate(e.target.value)}
          hint={
            isEmergency
              ? `Today (${institutionToday}). An emergency is pronounced on the day it happens.`
              : "Today or later. A past date cannot be declared — that would erase that day's absences."
          }
        />

        <Field
          label="What to call it"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isEmergency ? "Campus closed: flooding" : "No class Friday"}
          hint="Students see this."
        />

        <Field
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional. Kept in the audit log."
        />

        {serverError ? (
          <p
            role="alert"
            className="rounded-control border border-line px-3 py-2 text-13 text-status-absent"
          >
            {serverError}
          </p>
        ) : null}

        {isEmergency ? (
          <EmergencyConfirm
            disabled={!title || !scope || isPending}
            date={date}
            sectionId={sectionId}
            onConfirm={() =>
              execute({
                eventType,
                date,
                title,
                classSectionId: sectionId,
                reason: reason || null,
              })
            }
          />
        ) : (
          <Button
            disabled={!title || !scope || isPending}
            onClick={() =>
              execute({
                eventType,
                date,
                title,
                classSectionId: sectionId,
                reason: reason || null,
              })
            }
          >
            {isPending ? "Declaring…" : "Declare holiday"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The confirmation for an emergency.
 *
 * Fetches the impact first so the dialog can name it. A confirmation that says
 * "this cannot be undone" without saying what "this" costs is a formality —
 * people click through formalities. "This voids 12 approved records" is the
 * sentence that makes someone check the date.
 */
function EmergencyConfirm({
  disabled,
  date,
  sectionId,
  onConfirm,
}: {
  disabled: boolean;
  date: string;
  sectionId: string | null;
  onConfirm: () => void;
}) {
  const preview = useAction(previewDeclaration);
  const impact = preview.result?.data ?? null;

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="destructive"
          disabled={disabled}
          // Fetch the impact as the dialog opens, so the consequence names real
          // numbers rather than a generic warning.
          onClick={() => preview.execute({ date, classSectionId: sectionId })}
        >
          Declare emergency
        </Button>
      }
      title="Declare today an emergency?"
      consequence={
        impact
          ? `This cancels ${impact.sessions} ${impact.sessions === 1 ? "session" : "sessions"} today and voids ${impact.records} attendance ${impact.records === 1 ? "record" : "records"}` +
            (impact.approvedRecords > 0
              ? ` — ${impact.approvedRecords} of them already approved. Those students reported present and a rep confirmed it; this takes that back. Nobody is penalised: the day leaves the attendance percentage entirely.`
              : ". Nobody is penalised: the day leaves the attendance percentage entirely.")
          : "This cancels today's sessions and voids the attendance already submitted for them, including records a rep has approved. Nobody is penalised — the day leaves the attendance percentage entirely."
      }
      confirmLabel="Declare emergency"
      onConfirm={onConfirm}
    />
  );
}
