/**
 * Public surface of the attendance feature. queries.ts is server-only and
 * imported directly by the pages; the rules engine is its own library.
 */
export {
  reportPresent,
  decideAttendance,
  decideAttendanceBulk,
} from "./actions";
export {
  reportPresentSchema,
  decideAttendanceSchema,
  decideAttendanceBulkSchema,
  type ReportPresentInput,
  type DecideAttendanceInput,
  type DecideAttendanceBulkInput,
} from "./schemas";
export { deriveStatus } from "./rules/derive-status";
export type {
  AttendanceStatus,
  SessionStatus,
  DeriveStatusInput,
  RuleSnapshot,
} from "./rules/types";
