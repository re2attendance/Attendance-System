import { z } from "zod";

/**
 * CSV parsing and row validation. PURE — no database, no I/O.
 *
 * Pure because this is the part with all the edge cases, and edge cases deserve
 * unit tests that run in milliseconds rather than integration tests that need a
 * roster. The database half lives in actions.ts and does exactly two things:
 * look up what exists, and write.
 *
 * ── why this file is careful ─────────────────────────────────────────────────
 *
 * Nobody hand-types 300 students. This is the first thing a real administrator
 * touches, and it is where rollouts die — not because importing is hard, but
 * because FAILING is. An import that dies on row 147 with "error" and leaves
 * 146 students half-created is how a pilot ends.
 *
 * So every rejection carries a line number and a sentence. Not a stack trace,
 * not "invalid input syntax for type uuid".
 */

export type CsvRow = {
  /** 1-based, and counting the header — this is the line in THEIR file, in
      their spreadsheet, which is the only line number that helps them. */
  line: number;
  matricNumber: string;
  fullName: string;
  email: string;
  courseCode: string;
  sectionCode: string;
};

export type RowError = {
  line: number;
  /** What is wrong, in a sentence. */
  message: string;
  /** The raw values, so the preview can show the row that failed. */
  raw: Record<string, string>;
};

/**
 * Header aliases.
 *
 * A registrar's export says "Student ID" or "Index Number" or "MATRIC NO." and
 * they are all the same column. Demanding one spelling means a human reshapes a
 * spreadsheet before every import, by hand, which is both the most tedious and
 * the most error-prone step in the process.
 *
 * Matching is done on a normalised key (lowercase, non-alphanumerics stripped),
 * so "Matric No." and "matric_no" and "MATRIC NO" collapse to `matricno` and
 * one alias covers all three.
 */
const HEADER_ALIASES: Record<keyof Omit<CsvRow, "line">, string[]> = {
  matricNumber: [
    "matricnumber", "matricno", "matric", "studentid", "studentnumber",
    "indexnumber", "indexno", "id",
  ],
  fullName: ["fullname", "name", "studentname"],
  email: ["email", "emailaddress", "mail"],
  courseCode: ["coursecode", "course", "code", "subject"],
  sectionCode: ["sectioncode", "section", "class", "group", "stream"],
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Split one CSV line, honouring quotes.
 *
 * Hand-rolled rather than a dependency, because the format this needs is small
 * and well-defined: commas inside quotes, and doubled quotes as an escape
 * (`"Mensah, Jr."` and `"She said ""hi"""`). Those are the two things a
 * registrar's export actually produces. Anything more exotic — embedded
 * newlines, alternative delimiters — is out of scope and will be REPORTED
 * rather than silently mangled, which is the important half.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      out.push(current);
      current = "";
    } else current += char;
  }

  out.push(current);
  return out.map((v) => v.trim());
}

export type HeaderResult =
  | { ok: true; indices: Record<keyof Omit<CsvRow, "line">, number> }
  | { ok: false; message: string };

export function matchHeaders(headerLine: string): HeaderResult {
  const headers = splitCsvLine(headerLine).map(normaliseHeader);
  const indices: Partial<Record<keyof Omit<CsvRow, "line">, number>> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof Omit<CsvRow, "line">,
    string[],
  ][]) {
    const index = headers.findIndex((h) => aliases.includes(h));
    if (index !== -1) indices[field] = index;
  }

  const missing = (Object.keys(HEADER_ALIASES) as (keyof Omit<CsvRow, "line">)[]).filter(
    (f) => indices[f] === undefined,
  );

  if (missing.length > 0) {
    // Naming what WAS found is the difference between a fixable error and a
    // guessing game: an admin who sees their own headers echoed back knows
    // immediately whether they uploaded the wrong file or the right file with
    // an odd column name.
    return {
      ok: false,
      message:
        `The file is missing ${missing.length === 1 ? "a column" : "columns"}: ${missing.join(", ")}. ` +
        `Found: ${headers.filter(Boolean).join(", ") || "nothing"}.`,
    };
  }

  return { ok: true, indices: indices as Record<keyof Omit<CsvRow, "line">, number> };
}

/* Deliberately permissive, and stricter than the DB in one place only.
   Everything here is a rule a human can fix in a spreadsheet. */
const rowSchema = z.object({
  matricNumber: z
    .string()
    .min(1, "the matric number is blank")
    .max(40, "the matric number is too long"),
  fullName: z.string().min(1, "the name is blank").max(120, "the name is too long"),
  email: z.string().min(1, "the email is blank").email("the email is not a valid address"),
  courseCode: z.string().min(1, "the course code is blank"),
  sectionCode: z.string().min(1, "the section code is blank"),
});

export type ParseResult = {
  rows: CsvRow[];
  errors: RowError[];
  /** Duplicate (matric, course, section) inside the FILE itself. */
  duplicateLines: number[];
};

export function parseCsv(text: string): ParseResult | { headerError: string } {
  // \r\n, \n, and the lone \r that a spreadsheet exported from an old Mac still
  // produces. Also strips a UTF-8 BOM, which Excel adds and which would
  // otherwise make the first header unmatchable for reasons invisible on screen
  // — the single most baffling CSV bug there is.
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headerError: "That file is empty." };

  const header = matchHeaders(lines[0]!);
  if (!header.ok) return { headerError: header.message };

  if (lines.length === 1) {
    return { headerError: "That file has a header row but no students." };
  }

  const rows: CsvRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const duplicateLines: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = i + 1; // 1-based, header included: the line in THEIR file.
    const cells = splitCsvLine(lines[i]!);

    const raw = {
      matricNumber: cells[header.indices.matricNumber] ?? "",
      fullName: cells[header.indices.fullName] ?? "",
      email: cells[header.indices.email] ?? "",
      courseCode: cells[header.indices.courseCode] ?? "",
      sectionCode: cells[header.indices.sectionCode] ?? "",
    };

    const parsed = rowSchema.safeParse(raw);

    if (!parsed.success) {
      errors.push({
        line,
        // Every failing rule, joined — an admin fixing one blank cell only to
        // find another on the next run will stop trusting the preview.
        message: parsed.error.issues.map((iss) => iss.message).join("; "),
        raw,
      });
      continue;
    }

    const normalised: CsvRow = {
      line,
      matricNumber: parsed.data.matricNumber.trim(),
      fullName: parsed.data.fullName.trim().replace(/\s+/g, " "),
      email: parsed.data.email.trim().toLowerCase(),
      courseCode: parsed.data.courseCode.trim().toUpperCase().replace(/\s+/g, " "),
      sectionCode: parsed.data.sectionCode.trim().toUpperCase(),
    };

    // Duplicates WITHIN the file. Real, and common: two exports concatenated,
    // or a student listed twice. The DB's unique constraint would catch it, but
    // only after the preview promised it would work.
    const key = `${normalised.matricNumber}|${normalised.courseCode}|${normalised.sectionCode}`;
    const firstSeen = seen.get(key);

    if (firstSeen !== undefined) {
      duplicateLines.push(line);
      errors.push({
        line,
        message: `this is the same student and section as line ${firstSeen}`,
        raw,
      });
      continue;
    }

    seen.set(key, line);
    rows.push(normalised);
  }

  return { rows, errors, duplicateLines };
}
