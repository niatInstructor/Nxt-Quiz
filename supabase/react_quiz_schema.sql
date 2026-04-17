create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('student', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'exam_status') then
    create type exam_status as enum ('draft', 'waiting', 'in_progress', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'participant_status') then
    create type participant_status as enum ('waiting', 'active', 'submitted', 'disconnected', 'kicked');
  end if;

  if not exists (select 1 from pg_type where typname = 'question_difficulty') then
    create type question_difficulty as enum ('Basic', 'Intermediate');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  student_college_id text,
  role user_role not null default 'student',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_student_college_id_unique
  on public.profiles (student_college_id)
  where student_college_id is not null;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  exam_code text not null unique,
  title text not null,
  duration_seconds integer not null default 2400 check (duration_seconds > 0),
  capacity integer not null default 300 check (capacity > 0),
  status exam_status not null default 'draft',
  starts_at timestamptz,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  topic text not null,
  difficulty question_difficulty not null,
  question_type text not null default 'theory',
  question text not null,
  code_snippet text,
  options jsonb not null,
  correct_option_id text not null check (correct_option_id in ('A', 'B', 'C', 'D')),
  explanation text not null,
  tags text[] not null default '{}',
  points integer not null default 1 check (points > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.exam_questions (
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id text not null references public.questions(id),
  position integer not null check (position > 0),
  points integer not null default 1 check (points > 0),
  primary key (exam_id, question_id),
  unique (exam_id, position)
);

create table if not exists public.exam_participants (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status participant_status not null default 'waiting',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  unique (exam_id, user_id)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status participant_status not null default 'active',
  server_started_at timestamptz not null,
  server_due_at timestamptz not null,
  submitted_at timestamptz,
  total_score numeric(6, 2),
  max_score numeric(6, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, user_id)
);

create table if not exists public.attempt_answers (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id text not null references public.questions(id),
  selected_option_id text check (selected_option_id in ('A', 'B', 'C', 'D')),
  is_bookmarked boolean not null default false,
  is_skipped boolean not null default false,
  answered_at timestamptz,
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create table if not exists public.exam_events (
  id bigint generated always as identity primary key,
  exam_id uuid not null references public.exams(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists exams_status_idx on public.exams(status);
create index if not exists exam_participants_exam_id_idx on public.exam_participants(exam_id);
create index if not exists exam_participants_user_id_idx on public.exam_participants(user_id);
create index if not exists attempts_exam_id_idx on public.attempts(exam_id);
create index if not exists attempts_user_id_idx on public.attempts(user_id);
create index if not exists attempt_answers_question_id_idx on public.attempt_answers(question_id);
create index if not exists questions_topic_idx on public.questions(topic);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_exams_updated_at on public.exams;
create trigger touch_exams_updated_at
before update on public.exams
for each row execute function public.touch_updated_at();

drop trigger if exists touch_attempts_updated_at on public.attempts;
create trigger touch_attempts_updated_at
before update on public.attempts
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_exam_participant(p_exam_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_participants
    where exam_id = p_exam_id
      and user_id = auth.uid()
      and status <> 'kicked'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.complete_onboarding(p_student_college_id text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_student_college_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_student_college_id := upper(trim(p_student_college_id));

  if length(v_student_college_id) < 3 or length(v_student_college_id) > 64 then
    raise exception 'Student College ID must be between 3 and 64 characters';
  end if;

  update public.profiles
  set student_college_id = v_student_college_id,
      onboarded_at = coalesce(onboarded_at, now())
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_participants enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.exam_events enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_own_student_id on public.profiles;
drop policy if exists exams_select_joined_or_admin on public.exams;
drop policy if exists exam_participants_select_own_or_admin on public.exam_participants;
drop policy if exists exam_participants_update_own_presence on public.exam_participants;
drop policy if exists questions_select_admin on public.questions;
drop policy if exists questions_select_for_joined_exam_or_admin on public.questions;
drop policy if exists exam_questions_select_for_joined_exam_or_admin on public.exam_questions;
drop policy if exists attempts_select_own_or_admin on public.attempts;
drop policy if exists attempt_answers_select_own_or_admin on public.attempt_answers;
drop policy if exists attempt_answers_upsert_own_before_due on public.attempt_answers;
drop policy if exists attempt_answers_insert_own_before_due on public.attempt_answers;
drop policy if exists attempt_answers_update_own_before_due on public.attempt_answers;
drop policy if exists exam_events_select_admin on public.exam_events;

create policy profiles_select_own_or_admin
on public.profiles
for select
using (id = auth.uid() or public.is_admin());

create policy exams_select_joined_or_admin
on public.exams
for select
using (public.is_admin() or public.is_exam_participant(id));

create policy exam_participants_select_own_or_admin
on public.exam_participants
for select
using (user_id = auth.uid() or public.is_admin());

create policy exam_participants_update_own_presence
on public.exam_participants
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy questions_select_admin
on public.questions
for select
using (public.is_admin());

create policy exam_questions_select_for_joined_exam_or_admin
on public.exam_questions
for select
using (public.is_admin() or public.is_exam_participant(exam_id));

create policy attempts_select_own_or_admin
on public.attempts
for select
using (user_id = auth.uid() or public.is_admin());

create policy attempt_answers_select_own_or_admin
on public.attempt_answers
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
  )
);

create policy attempt_answers_insert_own_before_due
on public.attempt_answers
for insert
with check (
  exists (
    select 1
    from public.attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
      and a.status = 'active'
      and now() <= a.server_due_at
  )
);

create policy attempt_answers_update_own_before_due
on public.attempt_answers
for update
using (
  exists (
    select 1
    from public.attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
      and a.status = 'active'
      and now() <= a.server_due_at
  )
)
with check (
  exists (
    select 1
    from public.attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
      and a.status = 'active'
      and now() <= a.server_due_at
  )
);

create policy exam_events_select_admin
on public.exam_events
for select
using (public.is_admin());

create or replace view public.student_exam_questions as
select
  eq.exam_id,
  eq.position,
  eq.points,
  q.id,
  q.topic,
  q.difficulty,
  q.question_type,
  q.question,
  q.code_snippet,
  q.options,
  q.tags
from public.exam_questions eq
join public.questions q on q.id = eq.question_id
where public.is_admin() or public.is_exam_participant(eq.exam_id);

create or replace function public.start_exam(p_exam_id uuid)
returns public.exams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.exams;
begin
  if not public.is_admin() then
    raise exception 'Only admins can start exams';
  end if;

  select *
  into v_exam
  from public.exams
  where id = p_exam_id
  for update;

  if not found then
    raise exception 'Exam not found';
  end if;

  if v_exam.status <> 'waiting' then
    raise exception 'Exam must be waiting before it can start';
  end if;

  update public.exams
  set status = 'in_progress',
      starts_at = now(),
      closes_at = now() + make_interval(secs => duration_seconds)
  where id = p_exam_id
  returning * into v_exam;

  insert into public.attempts (exam_id, user_id, server_started_at, server_due_at, max_score)
  select
    p_exam_id,
    ep.user_id,
    v_exam.starts_at,
    v_exam.closes_at,
    coalesce(sum(eq.points), 0)
  from public.exam_participants ep
  left join public.exam_questions eq on eq.exam_id = ep.exam_id
  where ep.exam_id = p_exam_id
    and ep.status = 'waiting'
  group by ep.user_id
  on conflict (exam_id, user_id) do nothing;

  update public.exam_participants
  set status = 'active',
      started_at = v_exam.starts_at
  where exam_id = p_exam_id
    and status = 'waiting';

  insert into public.exam_events (exam_id, actor_user_id, event_type, payload)
  values (p_exam_id, auth.uid(), 'exam_started', jsonb_build_object('starts_at', v_exam.starts_at));

  return v_exam;
end;
$$;

create or replace function public.submit_attempt(p_attempt_id uuid)
returns public.attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts;
  v_score numeric(6, 2);
  v_max_score numeric(6, 2);
begin
  select *
  into v_attempt
  from public.attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Attempt not found';
  end if;

  if v_attempt.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  select
    coalesce(sum(case when aa.selected_option_id = q.correct_option_id then eq.points else 0 end), 0),
    coalesce(sum(eq.points), 0)
  into v_score, v_max_score
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  left join public.attempt_answers aa
    on aa.question_id = eq.question_id
   and aa.attempt_id = p_attempt_id
  where eq.exam_id = v_attempt.exam_id;

  update public.attempts
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      total_score = v_score,
      max_score = v_max_score
  where id = p_attempt_id
  returning * into v_attempt;

  update public.exam_participants
  set status = 'submitted',
      submitted_at = v_attempt.submitted_at
  where exam_id = v_attempt.exam_id
    and user_id = v_attempt.user_id;

  insert into public.exam_events (exam_id, actor_user_id, event_type, payload)
  values (
    v_attempt.exam_id,
    v_attempt.user_id,
    'attempt_submitted',
    jsonb_build_object('attempt_id', p_attempt_id, 'score', v_score, 'max_score', v_max_score)
  );

  return v_attempt;
end;
$$;

create or replace view public.exam_question_analytics as
select
  e.id as exam_id,
  q.id as question_id,
  q.topic,
  q.difficulty,
  count(a.id) filter (where a.status = 'submitted') as submitted_attempts,
  count(aa.attempt_id) filter (where aa.selected_option_id = q.correct_option_id) as correct_count,
  count(aa.attempt_id) filter (where aa.selected_option_id is null and aa.is_skipped) as skipped_count,
  count(aa.attempt_id) filter (where aa.is_bookmarked) as bookmarked_count,
  round(
    100.0 * count(aa.attempt_id) filter (where aa.selected_option_id = q.correct_option_id)
    / nullif(count(a.id) filter (where a.status = 'submitted'), 0),
    2
  ) as correct_percentage
from public.exams e
join public.exam_questions eq on eq.exam_id = e.id
join public.questions q on q.id = eq.question_id
left join public.attempts a on a.exam_id = e.id
left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
where public.is_admin()
group by e.id, q.id, q.topic, q.difficulty;
