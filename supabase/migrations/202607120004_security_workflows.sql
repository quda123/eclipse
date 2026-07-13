create table public.homeworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  teacher_id uuid not null references public.profiles,
  title text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.homework_versions add column homework_id uuid references public.homeworks on delete cascade;
create table public.homework_templates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  teacher_id uuid not null references public.profiles, title text not null, payload jsonb not null, archived_at timestamptz, created_at timestamptz not null default now()
);
create table public.assignment_deadline_extensions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.homework_assignments on delete cascade,
  extended_until timestamptz not null, reason text not null default '', created_by uuid not null references public.profiles, created_at timestamptz not null default now()
);
create table public.attempt_answers (
  attempt_id uuid not null references public.attempts on delete cascade, question_id uuid not null references public.homework_questions,
  value text not null, is_correct boolean not null, primary key(attempt_id,question_id)
);
create table public.manual_submission_versions (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.manual_submissions on delete cascade,
  version int not null, submitted_at timestamptz, returned_at timestamptz, created_at timestamptz not null default now(), unique(submission_id,version)
);

create index homework_assignments_deadline_idx on public.homework_assignments(deadline_at);
create index homework_versions_teacher_idx on public.homework_versions(teacher_id,created_at desc);
create index attempts_assignment_idx on public.attempts(assignment_id,attempt_number);
create index audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);

create function public.is_org_teacher(org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid() and role in ('owner','teacher'))
$$;
create function public.assignment_deadline(assignment uuid) returns timestamptz language sql stable security definer set search_path=public as $$
  select coalesce((select max(extended_until) from public.assignment_deadline_extensions where assignment_id=assignment),a.deadline_at)
  from public.homework_assignments a where a.id=assignment
$$;

alter table public.homeworks enable row level security;
alter table public.homework_templates enable row level security;
alter table public.assignment_deadline_extensions enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.manual_submission_versions enable row level security;

create policy "org teachers manage homeworks" on public.homeworks for all using(public.is_org_teacher(organization_id)) with check(public.is_org_teacher(organization_id));
create policy "org teachers manage versions" on public.homework_versions for all using(public.is_org_teacher(organization_id)) with check(public.is_org_teacher(organization_id));
create policy "org teachers manage templates" on public.homework_templates for all using(public.is_org_teacher(organization_id)) with check(public.is_org_teacher(organization_id));
create policy "teachers read linked assignments" on public.homework_assignments for select using(public.is_linked_teacher(student_id));
create policy "teachers create linked assignments" on public.homework_assignments for insert with check(public.is_linked_teacher(student_id));
create policy "participants read extensions" on public.assignment_deadline_extensions for select using(exists(select 1 from public.homework_assignments a where a.id=assignment_id and (a.student_id=auth.uid() or public.is_linked_teacher(a.student_id))));
create policy "teachers add extensions" on public.assignment_deadline_extensions for insert with check(exists(select 1 from public.homework_assignments a where a.id=assignment_id and public.is_linked_teacher(a.student_id)));
create policy "participants read attempt answers" on public.attempt_answers for select using(exists(select 1 from public.attempts a where a.id=attempt_id and (a.student_id=auth.uid() or public.is_linked_teacher(a.student_id))));

create function public.submit_attempt(p_assignment uuid,p_answers jsonb,p_idempotency uuid)
returns table(attempt_id uuid,score int,maximum_score int,attempt_number int) language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; allowed int; used int; new_id uuid; correct_count int;
begin
  select * into a from public.homework_assignments where id=p_assignment for update;
  if a.student_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select hv.attempts_allowed into allowed from public.homework_versions hv where hv.id=a.homework_version_id;
  select count(*) into used from public.attempts where assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  select count(*) into correct_count from public.homework_questions q
  where q.homework_version_id=a.homework_version_id and exists(
    select 1 from public.question_accepted_answers aa where aa.question_id=q.id
    and lower(regexp_replace(trim(aa.value),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(p_answers->>q.id::text,'')),'\s+',' ','g'))
  );
  insert into public.attempts(assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key)
  values(a.id,auth.uid(),used+1,p_answers,correct_count,(select count(*) from public.homework_questions where homework_version_id=a.homework_version_id),p_idempotency)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into new_id;
  update public.homework_assignments set status='submitted' where id=a.id;
  delete from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid();
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  select hv.organization_id,auth.uid(),'test_submitted','attempt',new_id,jsonb_build_object('score',correct_count) from public.homework_versions hv where hv.id=a.homework_version_id;
  return query select new_id,at.score,at.maximum_score,at.attempt_number from public.attempts at where at.id=new_id;
end $$;

create policy "student upload originals" on storage.objects for insert to authenticated with check(bucket_id='homework-originals' and split_part(name,'/',3)=auth.uid()::text);
create policy "participants read originals" on storage.objects for select to authenticated using(bucket_id='homework-originals' and (split_part(name,'/',3)=auth.uid()::text or split_part(name,'/',2)=auth.uid()::text));
create policy "student upload processed" on storage.objects for insert to authenticated with check(bucket_id in ('homework-processed','homework-thumbnails') and split_part(name,'/',3)=auth.uid()::text);
create policy "participants read processed" on storage.objects for select to authenticated using(bucket_id in ('homework-processed','homework-thumbnails') and (split_part(name,'/',3)=auth.uid()::text or split_part(name,'/',2)=auth.uid()::text));
