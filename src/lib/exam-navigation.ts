"use client";

const EXAM_NAVIGATION_GRACE_KEY = "exam-navigation-grace-until";
const EXAM_NAVIGATION_GRACE_MS = 3000;

export function markExamNavigationIntent() {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    EXAM_NAVIGATION_GRACE_KEY,
    String(Date.now() + EXAM_NAVIGATION_GRACE_MS),
  );
}

export function hasActiveExamNavigationIntent() {
  if (typeof window === "undefined") return false;

  const rawValue = window.sessionStorage.getItem(EXAM_NAVIGATION_GRACE_KEY);
  if (!rawValue) return false;

  const expiresAt = Number(rawValue);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    window.sessionStorage.removeItem(EXAM_NAVIGATION_GRACE_KEY);
    return false;
  }

  return true;
}
