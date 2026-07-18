/**
 * Public surface of the reps feature. Client-safe — queries.ts is server-only
 * and imported directly by the page.
 */
export { appointRep, revokeRep, listSectionRoster } from "./actions";
