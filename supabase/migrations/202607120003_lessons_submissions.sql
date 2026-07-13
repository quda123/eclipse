do $$ begin
  create type public.lesson_status as enum ('scheduled','moved','cancelled','completed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.notification_kind as enum ('homework','deadline','result','lesson','submission','review');
exception when duplicate_object then null;
end $$;

create table public.lesson_series (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, teacher_id uuid not null references public.profiles, student_id uuid not null references public.profiles, rrule text not null, timezone text not null, zoom_url text, created_at timestamptz not null default now());
create table public.lessons (id uuid primary key default gen_random_uuid(), series_id uuid references public.lesson_series, organization_id uuid not null references public.organizations on delete cascade, teacher_id uuid not null references public.profiles, student_id uuid not null references public.profiles, starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null, zoom_url text, status public.lesson_status not null default 'scheduled', original_occurrence timestamptz, created_at timestamptz not null default now(), check(ends_at > starts_at));
create table public.teacher_notes (student_id uuid primary key references public.profiles on delete cascade, teacher_id uuid not null references public.profiles, body text not null default '', updated_at timestamptz not null default now());
create table public.manual_submissions (id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.homework_assignments, student_id uuid not null references public.profiles, version int not null default 1, submitted_at timestamptz, returned_at timestamptz, unique(assignment_id,version));
create table public.submission_images (id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.manual_submissions on delete cascade, position int not null, original_path text not null, processed_path text not null, thumbnail_path text not null, original_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 20971520), width int, height int, unique(submission_id,position));
create table public.manual_task_scores (submission_id uuid not null references public.manual_submissions on delete cascade, task_number int not null, points int not null check(points between 0 and 2), primary key(submission_id,task_number));
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade, kind public.notification_kind not null, title text not null, href text not null, dedupe_key text not null, read_at timestamptz, created_at timestamptz not null default now(), unique(user_id,dedupe_key));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, actor_id uuid references public.profiles, action text not null, entity_type text not null, entity_id uuid not null, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create index lessons_student_start_idx on public.lessons(student_id,starts_at); create index notifications_unread_idx on public.notifications(user_id,created_at desc) where read_at is null; create index submissions_review_idx on public.manual_submissions(submitted_at) where submitted_at is not null and returned_at is null;

alter table public.lesson_series enable row level security; alter table public.lessons enable row level security; alter table public.teacher_notes enable row level security; alter table public.manual_submissions enable row level security; alter table public.submission_images enable row level security; alter table public.manual_task_scores enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security;
create policy "lesson participants read" on public.lessons for select using(student_id=auth.uid() or teacher_id=auth.uid());
create policy "teacher notes private" on public.teacher_notes for all using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
create policy "own notifications" on public.notifications for select using(user_id=auth.uid());
create policy "own notifications update" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "student submissions" on public.manual_submissions for select using(student_id=auth.uid() or public.is_linked_teacher(student_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('homework-originals','homework-originals',false,20971520,array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
 ('homework-processed','homework-processed',false,20971520,array['image/jpeg','image/png','image/webp']),
 ('homework-thumbnails','homework-thumbnails',false,2097152,array['image/jpeg','image/webp']);
