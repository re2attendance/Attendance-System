/**
 * The picker options every create/edit form needs, resolved once per page by
 * `listFormOptions()` and passed down. Client-safe on purpose: it mirrors the
 * query's return shape without importing `queries.ts`, which is server-only.
 */
export type FormOptions = {
  departments: { id: string; name: string; code: string | null }[];
  academicYears: { id: string; name: string }[];
  semesters: { id: string; name: string }[];
  instructors: { id: string; fullName: string }[];
  courses: { id: string; code: string; title: string }[];
};
