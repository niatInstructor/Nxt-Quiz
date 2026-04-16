# React Quiz Platform Blueprint

## Recommendation

Use Supabase as the primary backend: Supabase Auth for Google OAuth, Postgres for normalized exam data, Row Level Security for data isolation, Edge Functions or Next.js route handlers for privileged actions, and Supabase Realtime for waiting-room presence and admin start events.

Firebase is also viable for realtime listeners, but this app needs relational analytics across 300+ attempts, question difficulty, topic performance, participant status, and audit trails. Postgres makes those queries natural and keeps scoring logic close to the data.

Official docs referenced:

- Supabase Google OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase Presence: https://supabase.com/docs/guides/realtime/presence
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Firebase Google Auth alternative: https://firebase.google.com/docs/auth/web/google-signin
- Firestore realtime listeners alternative: https://firebase.google.com/docs/firestore/query-data/listen

## Product Surfaces

### Student Interface

Routes:

- `/login`: Google OAuth only.
- `/onboarding`: mandatory Student College ID form after first login.
- `/exam/join`: Exam ID entry.
- `/exam/[examId]/waiting`: waiting room with capacity, connection state, and admin-start status.
- `/exam/[examId]/take`: timed quiz interface.
- `/exam/[examId]/review`: final preview before submission.
- `/exam/[examId]/submitted`: receipt and locked final state.

Required behavior:

- Block exam entry until profile has `student_college_id`.
- Join waiting room only through a valid Exam ID.
- Subscribe to exam status and presence for waiting room updates.
- Start quiz only after server marks the exam `in_progress`.
- Use server timestamps for `starts_at`, `server_started_at`, and `server_due_at`.
- Store answer updates incrementally, not only at final submission.
- Show answered, skipped, bookmarked, unanswered, and cleared-answer states.
- Lock changes when the server-side due time passes.

### Admin Portal

Routes:

- `/admin`: summary of active, upcoming, and closed exams.
- `/admin/exams/new`: generate Exam ID, choose question set, duration, and capacity.
- `/admin/exams/[examId]/waiting`: monitor joined students and capacity.
- `/admin/exams/[examId]/control`: master start switch and exam status controls.
- `/admin/exams/[examId]/analytics`: post-exam dashboard.

Required behavior:

- Generate unique Exam IDs server-side.
- Show realtime waiting-room counts and connected student identities.
- Start the exam by a single server-authorized action.
- Prevent multiple starts once `starts_at` is set.
- Recompute analytics from stored answers, never from client-submitted scores.

## Architecture

### Frontend

Recommended stack for this repo:

- Next.js App Router.
- React Server Components for secure admin/student page shells.
- Client components for realtime subscriptions and quiz interactions.
- Server Actions or Route Handlers for privileged writes.
- Supabase JS client with browser client for user-scoped reads/writes.
- Supabase service-role client only on the server for admin-only operations.

State model:

- Auth/session state: Supabase Auth.
- Durable exam state: Postgres tables.
- Realtime coordination: Supabase Realtime channels.
- Local UI-only state: current question index, open filters, review panel state.
- Draft answer state: optimistic client state mirrored to `attempt_answers`.

Suggested client modules:

- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/features/auth/onboarding-form.tsx`
- `src/features/exams/join-exam-form.tsx`
- `src/features/exams/waiting-room.tsx`
- `src/features/exams/exam-shell.tsx`
- `src/features/exams/question-panel.tsx`
- `src/features/exams/question-navigator.tsx`
- `src/features/exams/review-screen.tsx`
- `src/features/admin/admin-exam-controls.tsx`
- `src/features/admin/analytics-dashboard.tsx`

### Backend

Core tables:

- `profiles`: user role, email, display data, required student college ID.
- `exams`: Exam ID, duration, capacity, status, server start timestamp.
- `exam_participants`: waiting room membership and lifecycle state.
- `questions`: reusable MCQ bank.
- `exam_questions`: selected question set and display order.
- `attempts`: one attempt per student per exam.
- `attempt_answers`: answer, bookmark, skip, clear, and timing state.
- `exam_events`: audit log for joins, starts, submits, disconnects.
- `student_exam_questions`: safe read view for students that excludes `correct_option_id`.

Privileged operations:

- `createExam`: admin only, creates exam and picks questions.
- `joinExam`: authenticated student only, validates Exam ID and capacity.
- `startExam`: admin only, atomically sets `starts_at`, creates attempts, broadcasts event.
- `submitAttempt`: student or timeout job, calculates score server-side.
- `closeExam`: admin or scheduled job, finalizes late attempts.

## Session Lifecycle

1. Student signs in with Google.
2. App checks `profiles.student_college_id`.
3. If missing, redirect to `/onboarding`.
4. Student enters Exam ID.
5. Server validates exam existence, waiting status, capacity, prior submission, and Student College ID.
6. Student is inserted or refreshed in `exam_participants`.
7. Student enters waiting room.
8. Waiting room subscribes to presence, exam status changes, and admin broadcast events.
9. Admin presses Start Exam.
10. Server transaction locks the exam, verifies admin role, sets status/start/end timestamps, creates attempts, writes an audit event, and broadcasts `exam_started`.
11. Student clients navigate to `/take`.
12. Timer is calculated from `attempt.server_due_at - current_server_time`.
13. Answers autosave to `attempt_answers`.
14. Student opens final review and submits.
15. Server scores attempt and locks it.

## Timer Design

The timer must not depend on the student's device clock.

- Store `server_started_at` and `server_due_at` on each attempt.
- On page load, fetch Supabase server time using an RPC such as `select now()`.
- Compute client drift as `server_now - Date.now()`.
- Display remaining time as `server_due_at - adjusted_client_now`.
- Refresh drift every 60 seconds and on tab visibility changes.
- On expiration, call `submitAttempt` automatically.
- Server rejects answer writes after `server_due_at`.

## Quiz Interaction Model

Each question can have these independent state fields:

- `selected_option_id`: `A`, `B`, `C`, `D`, or null.
- `is_bookmarked`: true or false.
- `is_skipped`: true or false.
- `answered_at`: timestamp when an answer is selected.
- `cleared_at`: timestamp when answer is cleared.

Actions:

- Bookmark: toggles `is_bookmarked`; does not affect answer.
- Skip: sets `is_skipped = true`; keeps question visible in review.
- Select answer: sets `selected_option_id`, clears `is_skipped`, sets `answered_at`.
- Clear selected answer: sets `selected_option_id = null`, sets `cleared_at`; bookmark remains unchanged.

Review categories:

- Answered: `selected_option_id is not null`.
- Skipped: `is_skipped = true and selected_option_id is null`.
- Bookmarked: `is_bookmarked = true`.
- Unanswered: no answer and not skipped.

## Analytics Dashboard

Top-level metrics:

- total registered participants,
- total started attempts,
- total submitted attempts,
- average score,
- median score,
- highest and lowest score,
- completion rate,
- average time to submit.

Question metrics:

- correct percentage per question,
- incorrect distribution by option,
- skip rate,
- clear-answer rate,
- bookmark rate,
- average time spent where tracked,
- difficulty index: `correct_count / submitted_count`.

Topic metrics:

- average score by topic,
- weakest topics,
- strongest topics,
- topic-wise correctness by difficulty.

Suggested visualizations:

- score distribution histogram,
- topic performance bar chart,
- question difficulty table,
- option distractor analysis chart,
- completion funnel,
- participant table with filters.

## Security Rules

- Only Google OAuth should be enabled for students.
- Admin role must be assigned manually in the database or by a protected admin-only route.
- Students can read only their own profile, participant row, attempt, and answer rows.
- Students can read exam questions only after joining that exam, through a view that excludes correct answers.
- Students cannot read `correct_option_id` during an active exam.
- Clients must never submit or update score values.
- Service-role key must stay server-only.
- Start exam and submit exam must be server-side transactions.
- RLS should be enabled on every public table.

## Scaling Notes For 300+ Concurrent Students

- 300 concurrent students is modest for this architecture if writes are small and indexed.
- Autosave should debounce answer writes, for example 300-700 ms.
- Avoid writing every timer tick.
- Presence should track connection state only, not full answer state.
- Question data should be fetched once at exam start and cached in memory for the session.
- Use indexes on `exam_id`, `user_id`, `attempt_id`, `question_id`, and `topic`.
- Use database views or materialized views for heavy post-exam analytics.

## Implementation Phases

### Phase 1: Foundation

- Replace NextAuth with Supabase Auth or bridge NextAuth carefully through server routes.
- Add profile onboarding and required Student College ID.
- Add database schema and RLS policies.
- Seed the 50-question MCQ bank from `src/data/react-mcq-50.json`.

### Phase 2: Exam Flow

- Build admin Exam ID generation.
- Build student Exam ID join.
- Build waiting room and realtime presence.
- Implement admin start transaction.
- Implement student quiz page and server-synced timer.

### Phase 3: Submission And Review

- Add bookmark, skip, clear answer, and autosave.
- Add final review screen.
- Add server-side scoring RPC.
- Add auto-submit on timeout.

### Phase 4: Analytics

- Add analytics SQL views.
- Build admin dashboard charts.
- Add CSV export for participants and question performance.
- Add audit log view for exam events.
