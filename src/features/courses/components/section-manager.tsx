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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSection, updateSection } from "../actions";
import type { SectionRow } from "../queries";
import { TableSearch } from "./table-search";
import type { FormOptions } from "./types";

/** Radix Select cannot hold an empty value, so "no instructor yet" is a real
 * option with a sentinel that maps back to null on submit. */
const NO_INSTRUCTOR = "__none__";

/**
 * Sections: the classes that actually meet. Enrolments, reps and sessions all
 * hang off a section, so this is the screen that has to exist before those do.
 *
 * A section is unique per (course, semester, section code) — "A" and "B" split
 * one course into two offerings. Institutions that do not split have exactly
 * one section per course, which is why the section code defaults to a value the
 * admin never has to think about.
 */
export function SectionManager({
  rows,
  total,
  page,
  pageSize,
  options,
}: {
  rows: SectionRow[];
  total: number;
  page: number;
  pageSize: number;
  options: FormOptions;
}) {
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<SectionRow>[] = [
    {
      id: "course",
      header: "Course",
      cell: ({ row }) => (
        <span className="font-mono text-13 text-ink" data-numeric>
          {row.original.courseCode}
        </span>
      ),
    },
    {
      id: "section",
      header: "Section",
      meta: { cardLabel: "Section" },
      cell: ({ row }) => row.original.sectionCode,
    },
    {
      id: "semester",
      header: "Semester",
      cell: ({ row }) => row.original.semesterName,
    },
    {
      id: "instructor",
      header: "Instructor",
      cell: ({ row }) =>
        row.original.instructorName ?? (
          <span className="text-mute">Unassigned</span>
        ),
    },
    {
      id: "room",
      header: "Room",
      meta: { hideOnMobile: true },
      cell: ({ row }) => row.original.room ?? <span className="text-mute">—</span>,
    },
    {
      id: "enrolled",
      header: "Enrolled",
      meta: { cardLabel: "Enrolled" },
      cell: ({ row }) => (
        <span data-numeric>
          {row.original.enrolledCount}
          {row.original.capacity ? ` / ${row.original.capacity}` : ""}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { cardLabel: "" },
      cell: ({ row }) => (
        <div className="text-right">
          <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TableSearch placeholder="Search by course code" />
        <Button onClick={() => setCreating(true)}>New section</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: "No sections yet",
          next: "Create a section so students can be enrolled and sessions scheduled.",
          action: <Button onClick={() => setCreating(true)}>New section</Button>,
        }}
      />

      <DataTablePagination page={page} pageSize={pageSize} total={total} />

      <SectionForm
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        initial={editing}
        options={options}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function SectionForm({
  open,
  initial,
  options,
  onClose,
}: {
  open: boolean;
  initial: SectionRow | null;
  options: FormOptions;
  onClose: () => void;
}) {
  const isEdit = initial !== null;

  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [semesterId, setSemesterId] = useState(initial?.semesterId ?? "");
  const [sectionCode, setSectionCode] = useState(initial?.sectionCode ?? "A");
  const [instructorId, setInstructorId] = useState(
    initial?.instructorId ?? NO_INSTRUCTOR,
  );
  const [capacity, setCapacity] = useState(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [room, setRoom] = useState(initial?.room ?? "");

  const create = useAction(createSection, {
    onSuccess({ data }) {
      toast.success(`Created section ${data?.sectionCode}.`);
      onClose();
    },
  });
  const update = useAction(updateSection, {
    onSuccess({ data }) {
      toast.success(`Saved section ${data?.sectionCode}.`);
      onClose();
    },
  });

  const action = isEdit ? update : create;
  const serverError = action.result?.serverError;
  const canSubmit = courseId && semesterId && sectionCode;

  function submit() {
    const payload = {
      courseId,
      semesterId,
      sectionCode,
      instructorId: instructorId === NO_INSTRUCTOR ? null : instructorId,
      capacity: capacity === "" ? null : capacity,
      room: room.trim() === "" ? null : room.trim(),
    };
    if (isEdit) update.execute({ ...payload, id: initial.id });
    else create.execute(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Edit ${initial.courseCode} ${initial.sectionCode}`
              : "New section"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {options.courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Semester</Label>
              <Select value={semesterId} onValueChange={setSemesterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a semester" />
                </SelectTrigger>
                <SelectContent>
                  {options.semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Field
              label="Section code"
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              placeholder="A"
              hint="Distinguishes offerings of one course."
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Instructor</Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INSTRUCTOR}>Unassigned</SelectItem>
                {options.instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              hint="Optional."
            />
            <Field
              label="Room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="LT 3"
              hint="Optional."
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
              {action.isPending ? "Saving…" : isEdit ? "Save changes" : "Create section"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
