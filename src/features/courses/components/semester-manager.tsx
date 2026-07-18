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
import { createSemester } from "../actions";
import type { FormOptions } from "./types";

export type SemesterListRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
  addDropDeadline: string | null;
  academicYearName: string;
};

/**
 * Semesters: the terms sections and sessions live inside. Create-only for now —
 * a semester's dates are load-bearing for every session generated against it,
 * so editing one after sections exist is a Phase 5 concern, not a text field.
 *
 * The whole list is small (a handful per year), so it is not paginated: the
 * table renders every row, newest first, which is the order an admin scans.
 */
export function SemesterManager({
  rows,
  options,
}: {
  rows: SemesterListRow[];
  options: FormOptions;
}) {
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<SemesterListRow>[] = [
    { id: "name", header: "Name", accessorKey: "name" },
    {
      id: "year",
      header: "Academic year",
      cell: ({ row }) => row.original.academicYearName,
    },
    {
      id: "starts",
      header: "Starts",
      meta: { cardLabel: "Starts" },
      cell: ({ row }) => (
        <span className="font-mono text-13" data-numeric>
          {row.original.startsOn}
        </span>
      ),
    },
    {
      id: "ends",
      header: "Ends",
      meta: { cardLabel: "Ends" },
      cell: ({ row }) => (
        <span className="font-mono text-13" data-numeric>
          {row.original.endsOn}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      meta: { cardLabel: "Status" },
      cell: ({ row }) => <span className="capitalize">{row.original.status}</span>,
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreating(true)}>New semester</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: "No semesters yet",
          next: "Create a semester before adding sections — every section belongs to one.",
          action: <Button onClick={() => setCreating(true)}>New semester</Button>,
        }}
      />

      <SemesterForm
        open={creating}
        options={options}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

function SemesterForm({
  open,
  options,
  onClose,
}: {
  open: boolean;
  options: FormOptions;
  onClose: () => void;
}) {
  const [academicYearId, setAcademicYearId] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [addDropDeadline, setAddDropDeadline] = useState("");

  const create = useAction(createSemester, {
    onSuccess({ data }) {
      toast.success(`Created ${data?.name}.`);
      onClose();
    },
  });

  const serverError = create.result?.serverError;
  const canSubmit = academicYearId && name && startsOn && endsOn;

  function submit() {
    create.execute({
      academicYearId,
      name,
      startsOn,
      endsOn,
      addDropDeadline: addDropDeadline === "" ? null : addDropDeadline,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New semester</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Academic year</Label>
            <Select value={academicYearId} onValueChange={setAcademicYearId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a year" />
              </SelectTrigger>
              <SelectContent>
                {options.academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First Semester"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Starts on"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
            <Field
              label="Ends on"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>

          <Field
            label="Add/drop deadline"
            type="date"
            value={addDropDeadline}
            min={startsOn || undefined}
            max={endsOn || undefined}
            onChange={(e) => setAddDropDeadline(e.target.value)}
            hint="Optional. Must fall inside the semester."
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
            <Button variant="outline" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button disabled={!canSubmit || create.isPending} onClick={submit}>
              {create.isPending ? "Saving…" : "Create semester"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
