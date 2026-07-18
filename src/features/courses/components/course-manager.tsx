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
import { createCourse, updateCourse } from "../actions";
import type { CourseRow } from "../queries";
import { TableSearch } from "./table-search";
import type { FormOptions } from "./types";

/**
 * Courses: the catalogue. Create and edit go through the same dialog — an edit
 * is a create with the fields already filled — so there is one form to keep
 * right, not two that drift.
 *
 * A course is unique per (institution, academic year, code): CSC 401 in 2024/25
 * and 2025/26 are different courses on purpose (§5), which is why the academic
 * year is a required field here and not an afterthought.
 */
export function CourseManager({
  rows,
  total,
  page,
  pageSize,
  options,
}: {
  rows: CourseRow[];
  total: number;
  page: number;
  pageSize: number;
  options: FormOptions;
}) {
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<CourseRow>[] = [
    {
      id: "code",
      header: "Code",
      accessorKey: "code",
      cell: ({ row }) => (
        <span className="font-mono text-13 text-ink" data-numeric>
          {row.original.code}
        </span>
      ),
    },
    { id: "title", header: "Title", accessorKey: "title" },
    {
      id: "level",
      header: "Level",
      meta: { cardLabel: "Level" },
      cell: ({ row }) => row.original.level,
    },
    {
      id: "creditUnits",
      header: "Units",
      meta: { cardLabel: "Credit units" },
      cell: ({ row }) => row.original.creditUnits,
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => row.original.departmentName,
    },
    {
      id: "year",
      header: "Year",
      meta: { cardLabel: "Academic year" },
      cell: ({ row }) => row.original.academicYearName,
    },
    {
      id: "sections",
      header: "Sections",
      meta: { cardLabel: "Sections" },
      cell: ({ row }) => (
        <span data-numeric>{row.original.sectionCount}</span>
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
        <TableSearch placeholder="Search by code or title" />
        <Button onClick={() => setCreating(true)}>New course</Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          title: "No courses yet",
          next: "Create a course, or import a roster to have them created for you.",
          action: <Button onClick={() => setCreating(true)}>New course</Button>,
        }}
      />

      <DataTablePagination page={page} pageSize={pageSize} total={total} />

      <CourseForm
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

function CourseForm({
  open,
  initial,
  options,
  onClose,
}: {
  open: boolean;
  initial: CourseRow | null;
  options: FormOptions;
  onClose: () => void;
}) {
  const isEdit = initial !== null;

  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [creditUnits, setCreditUnits] = useState(String(initial?.creditUnits ?? ""));
  const [level, setLevel] = useState(String(initial?.level ?? ""));
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? "");
  const [academicYearId, setAcademicYearId] = useState(initial?.academicYearId ?? "");

  const create = useAction(createCourse, {
    onSuccess({ data }) {
      toast.success(`Created ${data?.code}.`);
      onClose();
    },
  });
  const update = useAction(updateCourse, {
    onSuccess({ data }) {
      toast.success(`Saved ${data?.code}.`);
      onClose();
    },
  });

  const action = isEdit ? update : create;
  const serverError = action.result?.serverError;
  const canSubmit =
    code && title && creditUnits !== "" && level !== "" && departmentId && academicYearId;

  function submit() {
    const payload = {
      code,
      title,
      creditUnits,
      level,
      departmentId,
      academicYearId,
    };
    if (isEdit) update.execute({ ...payload, id: initial.id });
    else create.execute(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${initial.code}` : "New course"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CSC 401"
              hint="Normalised to upper case."
            />
            <Field
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Compiler Construction"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Credit units"
              type="number"
              min={0}
              max={30}
              value={creditUnits}
              onChange={(e) => setCreditUnits(e.target.value)}
            />
            <Field
              label="Level"
              type="number"
              min={100}
              max={900}
              step={100}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="400"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {options.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <p className="text-12 text-mute">
              The same code in a different year is a different course.
            </p>
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
              {action.isPending ? "Saving…" : isEdit ? "Save changes" : "Create course"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
