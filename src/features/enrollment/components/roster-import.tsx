"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { commitRosterImport, previewRosterImport } from "../actions";

type Preview = NonNullable<Awaited<ReturnType<typeof previewRosterImport>>>["data"];

/**
 * Import a roster. Preview first, always.
 *
 * The shape of this screen is the argument: you cannot get to the button that
 * writes without passing the screen that shows what it will write. There is no
 * "import anyway" and no way to skip the preview, because the preview IS the
 * feature — the thing standing between a registrar and 300 wrong academic
 * records.
 */
export function RosterImport({
  semesters,
}: {
  semesters: { id: string; name: string }[];
}) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string>(semesters[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);

  const previewAction = useAction(previewRosterImport, {
    onSuccess({ data }) {
      setPreview(data ?? null);
    },
    onError() {
      setPreview(null);
    },
  });

  const commitAction = useAction(commitRosterImport, {
    onSuccess({ data }) {
      // §11.7: the vocabulary is consistent, and the toast reports what
      // happened rather than congratulating anyone.
      toast.success(
        `Imported. ${data?.enrolled ?? 0} enrolled, ${data?.invited ?? 0} invited.`,
      );
      setPreview(null);
      setCsv(null);
      setFileName(null);
    },
  });

  async function onFile(file: File) {
    setPreview(null);
    setFileName(file.name);
    setCsv(await file.text());
  }

  const previewError = previewAction.result?.serverError;
  const commitError = commitAction.result?.serverError;

  return (
    <div className="grid gap-4">
      {/* ── 1. the file ─────────────────────────────────────────────────── */}
      <div className="rounded-card border border-line p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <label htmlFor="roster-file" className="text-13 font-medium text-ink">
              Roster file
            </label>
            <input
              id="roster-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="h-11 w-full rounded-control border border-line bg-paper px-3 py-2 text-13 text-ink file:mr-3 file:rounded-chip file:border-0 file:bg-wash file:px-3 file:py-1 file:text-12 file:text-ink"
            />
            <p className="text-12 text-mute">
              Needs columns for matric number, name, email, course code and
              section. Most spellings work — &ldquo;Student ID&rdquo;,
              &ldquo;Index Number&rdquo; and &ldquo;Matric No.&rdquo; are all
              understood.
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-13 font-medium text-ink">Semester</label>
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button
            disabled={!csv || !semesterId || previewAction.isPending}
            onClick={() =>
              csv && previewAction.execute({ csv, semesterId })
            }
          >
            {previewAction.isPending ? "Checking…" : "Check the file"}
          </Button>
          {fileName ? (
            <span className="truncate font-mono text-12 text-mute">{fileName}</span>
          ) : null}
        </div>

        {previewError ? (
          <p
            role="alert"
            className="mt-3 rounded-control border border-line px-3 py-2 text-13 text-status-absent"
          >
            {previewError}
          </p>
        ) : null}
      </div>

      {/* ── 2. what will happen ─────────────────────────────────────────── */}
      {preview ? (
        <div className="rounded-card border border-line p-4">
          <h2 className="text-14 font-semibold text-ink">
            Nothing has been changed yet
          </h2>
          <p className="mt-1 text-13 text-mute">
            This is what importing {fileName} would do.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Enrol now" value={preview.counts.enroll} />
            <Stat
              label="Invite, then enrol"
              value={preview.counts.invite}
              hint="no account yet"
            />
            <Stat
              label="Already enrolled"
              value={preview.counts.alreadyEnrolled}
              hint="no change"
            />
            <Stat
              label="Cannot import"
              value={preview.counts.errors}
              tone={preview.counts.errors > 0 ? "bad" : undefined}
            />
          </dl>

          {/* Every bad row, with its line number and a sentence. This is the
              per-row error report §14 asks for, and the reason it exists: a
              registrar fixes their spreadsheet from this list. */}
          {preview.errors.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-13 font-medium text-ink">
                Rows that cannot be imported
              </h3>
              <p className="mt-0.5 text-12 text-mute">
                Line numbers match your file, header included. The rest of the
                file still imports.
              </p>
              <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                {preview.errors.map((e) => (
                  <li key={e.line} className="flex gap-3 px-3 py-2">
                    <span className="shrink-0 font-mono text-12 text-mute" data-numeric>
                      line {e.line}
                    </span>
                    <span className="text-13 text-ink">{e.message}</span>
                  </li>
                ))}
              </ul>
              {preview.errorsTruncated ? (
                <p className="mt-2 text-12 text-mute">
                  Only the first 200 are listed.
                </p>
              ) : null}
            </div>
          ) : null}

          {commitError ? (
            <p
              role="alert"
              className="mt-4 rounded-control border border-line px-3 py-2 text-13 text-status-absent"
            >
              {commitError}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button
              disabled={
                commitAction.isPending ||
                preview.counts.enroll + preview.counts.invite === 0
              }
              onClick={() =>
                csv &&
                commitAction.execute({
                  csv,
                  semesterId,
                  expectedEnroll: preview.counts.enroll,
                  expectedInvite: preview.counts.invite,
                })
              }
            >
              {commitAction.isPending
                ? "Importing…"
                : `Import ${preview.counts.enroll + preview.counts.invite} students`}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>

          <p className="mt-2 text-12 text-mute">
            All or nothing — if any part fails, nothing is written.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-card border border-line px-3 py-2">
      {/* §11.9 names "a big centred stat with a small label" as an anti-tell —
          as the PRIMARY dashboard element. Here the number is the answer to the
          question the screen asks, and it is 20px, not 48px. */}
      <dd
        className={`font-mono text-20 ${tone === "bad" ? "text-status-absent" : "text-ink"}`}
        data-numeric
      >
        {value}
      </dd>
      <dt className="text-12 text-mute">{label}</dt>
      {hint ? <p className="text-12 text-mute">{hint}</p> : null}
    </div>
  );
}
