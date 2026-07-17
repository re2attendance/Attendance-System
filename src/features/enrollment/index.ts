/**
 * Public surface of the enrollment feature. Client-safe (ADR-013).
 *
 * csv-import/parse.ts is pure and exported: the parser has no I/O, and a
 * preview UI that wanted to parse before uploading could legitimately use it.
 * csv-import/plan.ts is server-only and is not here.
 */
export { previewRosterImport, commitRosterImport } from "./actions";
export { RosterImport } from "./components/roster-import";
export { parseCsv, matchHeaders, type CsvRow, type RowError } from "./csv-import/parse";
