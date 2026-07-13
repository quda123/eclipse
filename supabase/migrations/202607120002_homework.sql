create type public.homework_mode as enum ('automatic', 'manual', 'combined');
create type public.assignment_status as enum ('not_started', 'in_progress', 'submitted', 'awaiting_review', 'reviewed', 'overdue', 'returned');

create table public.subjects (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, unique(organization_id, name));
create table public.topics (id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.subjects on delete cascade, name text not null, unique(subject_id, name));
create table public.homework_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, teacher_id uuid not null references public.profiles, subject_id uuid references public.subjects, topic_id uuid references public.topics,
 title text not null, instructions text not null default '', mode public.homework_mode not null, attempts_allowed int not null check(attempts_allowed > 0), version int not null default 1, published_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now()
);
create table public.homework_questions (id uuid primary key default gen_random_uuid(), homework_version_id uuid not null references public.homework_versions on delete cascade, position int not null, prompt text not null, unique(homework_version_id, position));
create table public.question_accepted_answers (id uuid primary key default gen_random_uuid(), question_id uuid not null references public.homework_questions on delete cascade, value text not null);
create table public.homework_assignments (id uuid primary key default gen_random_uuid(), homework_version_id uuid not null references public.homework_versions, student_id uuid not null references public.profiles, deadline_at timestamptz not null, timezone text not null, status public.assignment_status not null default 'not_started', unique(homework_version_id, student_id));
create table public.attempt_drafts (id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.homework_assignments on delete cascade, student_id uuid not null references public.profiles, answers jsonb not null default '{}', updated_at timestamptz not null default now(), unique(assignment_id, student_id));
create table public.attempts (id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.homework_assignments, student_id uuid not null references public.profiles, attempt_number int not null, answers jsonb not null, score int not null, maximum_score int not null, submitted_at timestamptz not null default now(), idempotency_key uuid not null unique, unique(assignment_id, attempt_number));

alter table public.subjects enable row level security; alter table public.topics enable row level security; alter table public.homework_versions enable row level security; alter table public.homework_questions enable row level security; alter table public.question_accepted_answers enable row level security; alter table public.homework_assignments enable row level security; alter table public.attempt_drafts enable row level security; alter table public.attempts enable row level security;
create policy "students read own assignments" on public.homework_assignments for select using(student_id=auth.uid());
create policy "students manage own drafts" on public.attempt_drafts for all using(student_id=auth.uid()) with check(student_id=auth.uid());
create policy "students read own attempts" on public.attempts for select using(student_id=auth.uid());
