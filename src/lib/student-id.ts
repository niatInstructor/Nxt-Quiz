export const STUDENT_ID_PATTERN = /^N24H01[AB]\d{4}$/;
export const STUDENT_ID_EXAMPLE = "N24H01A1234";
export const STUDENT_ID_ERROR =
  "Student College ID must match N24H01A1234 or N24H01B1234";

export function normalizeStudentId(value: string) {
  return value.trim().toUpperCase();
}

export function isValidStudentId(value: string | null | undefined) {
  if (!value) return false;
  return STUDENT_ID_PATTERN.test(normalizeStudentId(value));
}
