/**
 * Public surface of the calendar feature. Client-safe (ADR-013): schemas,
 * types and "use server" actions only — queries.ts carries `server-only` and is
 * imported directly by the app layer.
 */
export { declareCalendarEvent, previewDeclaration } from "./actions";
export { DeclareDayForm } from "./components/declare-day-form";
