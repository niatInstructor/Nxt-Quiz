export const STUDENT_ID_PREFIX = "N24H01";
export const STUDENT_ID_PATTERN = /^N24H01[AB]\d{4}$/;
export const STUDENT_ID_EXAMPLE = "A1234";
export const STUDENT_ID_ERROR =
  "Student College ID must match A1234 or B1234 (N24H01 prefix is added automatically)";

export function normalizeStudentId(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.startsWith(STUDENT_ID_PREFIX)) {
    return trimmed;
  }
  return STUDENT_ID_PREFIX + trimmed;
}

export function isValidStudentId(value: string | null | undefined) {
  if (!value) return false;
  return STUDENT_ID_PATTERN.test(normalizeStudentId(value));
}
