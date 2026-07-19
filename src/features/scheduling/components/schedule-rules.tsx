"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  createScheduleRule,
  deleteScheduleRule,
  generateSessions,
  updateScheduleRule,
} from "../actions";
import type { ScheduleRuleRow } from "../queries";

/** Postgres dow: 0 = Sunday … 6 = Saturday, the same order generate_sessions
 * expands with. Kept full-word so a rule reads as a sentence, not a code. */
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * A section's weekly pattern, and the button that turns it into dated sessions.
 *
 * A schedule rule is "Mondays 10:00–12:00 in LT3, this semester" — the shape,
 * not the instances. generate_sessions (0017) expands the shape across a date
 * range into 'scheduled' rows, skipping declared holidays, and is idempotent,
 * so the Generate control can be pressed twice without making doubles. Editing
 * a rule changes only what is generated NEXT; sessions already on the calendar
 * are history and are left alone.
 */
export function ScheduleRules({
  classSectionId,
  rules,
}: {
  classSectionId: string;
  rules: ScheduleRuleRow[];
}) {
  const [editing, setEditing] = useState<ScheduleRuleRow | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useAction(deleteScheduleRule, {
    onSuccess() {
      toast.success("Schedule rule removed.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not remove that rule.");
    },
  });

  const columns: DataTableColumn<ScheduleRuleRow>[] = [
    {
      id: "day",
      header: "Day",
      cell: ({ row }) => DAYS[row.original.dayOfWeek],
    },
    {
      id: "time",
      header: "Time",
      meta: { cardLabel: "Time" },
      cell: ({ row }) => (
        <span data-numeric>
          {row.original.startsAtLocal}–{row.original.endsAtLocal}
        </span>
      ),
    },
    {
      id: "room",
      header: "Room",
      cell: ({ row }) =>
        row.original.room ?? <span className="text-mute">—</span>,
    },
    {
      id: "effective",
      header: "Effective",
      meta: { hideOnMobile: true },
      cell: ({ row }) => (
        <span className="text-13 text-mute" data-numeric>
          {row.original.effectiveFrom}
          {row.original.effectiveTo ? ` → ${row.original.effectiveTo}` : " →"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { cardLabel: "" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() =>
              remove.execute({ id: row.original.id, classSectionId })
            }
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-16 font-semibold text-ink">Schedule</h2>
          <p className="mt-0.5 text-13 text-mute">
            The weekly pattern this section meets on.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add rule</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rules}
        rowKey={(r) => r.id}
        empty={{
          title: "No schedule yet",
          next: "Add a rule — a day and time this section meets — then generate its sessions.",
          action: <Button onClick={() => setCreating(true)}>Add rule</Button>,
        }}
      />

      <GenerateSessions classSectionId={classSectionId} disabled={rules.length === 0} />

      <RuleForm
        key={editing?.id ?? "new"}
        classSectionId={classSectionId}
        open={creating || editing !== null}
        initial={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </section>
  );
}

/** Expand the schedule into dated sessions across a range. Defaults span the
 * rest of the current month, the common "set up the next few weeks" case. */
function GenerateSessions({
  classSectionId,
  disabled,
}: {
  classSectionId: string;
  disabled: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthEnd = new Date();
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(monthEnd.toISOString().slice(0, 10));

  const generate = useAction(generateSessions, {
    onSuccess({ data }) {
      const n = data?.created ?? 0;
      toast.success(
        n === 0
          ? "No new sessions — the calendar is already up to date for that range."
          : `Generated ${n} session${n === 1 ? "" : "s"}.`,
      );
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not generate sessions.");
    },
  });

  return (
    <div className="rounded-card border border-line p-4">
      <h3 className="text-14 font-semibold text-ink">Generate sessions</h3>
      <p className="mt-0.5 text-13 text-mute">
        Create dated sessions from the schedule. Safe to run again — holidays are
        skipped and existing sessions are never duplicated.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-auto"
        />
        <Field
          label="To"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-auto"
        />
        <Button
          variant="outline"
          disabled={disabled || generate.isPending || !from || !to}
          onClick={() => generate.execute({ classSectionId, from, to })}
        >
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>
      </div>
    </div>
  );
}

function RuleForm({
  classSectionId,
  open,
  initial,
  onClose,
}: {
  classSectionId: string;
  open: boolean;
  initial: ScheduleRuleRow | null;
  onClose: () => void;
}) {
  const isEdit = initial !== null;

  const [dayOfWeek, setDayOfWeek] = useState(String(initial?.dayOfWeek ?? 1));
  const [startsAtLocal, setStartsAtLocal] = useState(initial?.startsAtLocal ?? "10:00");
  const [endsAtLocal, setEndsAtLocal] = useState(initial?.endsAtLocal ?? "12:00");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
  );
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? "");

  const create = useAction(createScheduleRule, {
    onSuccess() {
      toast.success("Schedule rule added.");
      onClose();
    },
  });
  const update = useAction(updateScheduleRule, {
    onSuccess() {
      toast.success("Schedule rule saved.");
      onClose();
    },
  });

  const action = isEdit ? update : create;
  const serverError = action.result?.serverError;
  const timesOrdered = endsAtLocal > startsAtLocal;
  const canSubmit = startsAtLocal && endsAtLocal && effectiveFrom && timesOrdered;

  function submit() {
    const payload = {
      classSectionId,
      dayOfWeek: Number(dayOfWeek),
      startsAtLocal,
      endsAtLocal,
      room: room.trim() === "" ? null : room.trim(),
      effectiveFrom,
      effectiveTo: effectiveTo === "" ? null : effectiveTo,
    };
    if (isEdit) update.execute({ ...payload, id: initial.id });
    else create.execute(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit schedule rule" : "Add schedule rule"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Day</Label>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Start"
              type="time"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
            />
            <Field
              label="End"
              type="time"
              value={endsAtLocal}
              onChange={(e) => setEndsAtLocal(e.target.value)}
              error={!timesOrdered ? "End must be after start." : undefined}
            />
          </div>

          <Field
            label="Room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="LT 3"
            hint="Optional."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Effective from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <Field
              label="Effective to"
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              hint="Optional — leave blank for open-ended."
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
            <Button variant="outline" onClick={onClose} disabled={action.isPending}>
              Cancel
            </Button>
            <Button disabled={!canSubmit || action.isPending} onClick={submit}>
              {action.isPending ? "Saving…" : isEdit ? "Save changes" : "Add rule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
