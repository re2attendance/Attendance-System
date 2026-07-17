/**
 * Public surface of the courses feature. Client-safe (ADR-013) — queries.ts is
 * server-only and imported directly by pages.
 */
export {
  createCourse,
  updateCourse,
  createSection,
  updateSection,
  createSemester,
} from "./actions";
export {
  createCourseSchema,
  updateCourseSchema,
  createSectionSchema,
  updateSectionSchema,
  createSemesterSchema,
  listParamsSchema,
  courseCodeSchema,
  levelSchema,
  type CreateCourseInput,
  type CreateSectionInput,
  type CreateSemesterInput,
  type ListParams,
} from "./schemas";
