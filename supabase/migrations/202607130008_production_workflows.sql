-- Production hardening: teacher isolation and atomic homework workflows.

create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;

alter table public.attempt_drafts add column if not exists started_at timestamptz not null default now();
alter table public.attempts add column if not exists started_at timestamptz;
alter table public.attempts add column if not exists duration_seconds int check(duration_seconds is null or duration_seconds>=0);

create table public.manual_tasks (
  id uuid primary key default gen_random_uuid(), homework_version_id uuid not null references public.homework_versions on delete cascade,
  position int not null check(position>0), prompt text not null check(length(btrim(prompt)) between 1 and 2000), unique(homework_version_id,position)
);
alter table public.manual_tasks enable row level security;
create policy "students read assigned manual tasks" on public.manual_tasks for select using(exists(
  select 1 from public.homework_assignments a where a.homework_version_id=manual_tasks.homework_version_id and a.student_id=auth.uid()
));
create policy "teachers manage own draft manual tasks" on public.manual_tasks for all using(exists(
  select 1 from public.homework_versions v where v.id=homework_version_id and v.teacher_id=auth.uid() and v.published_at is null
)) with check(exists(
  select 1 from public.homework_versions v where v.id=homework_version_id and v.teacher_id=auth.uid() and v.published_at is null
));
create policy "teachers read own manual tasks" on public.manual_tasks for select using(exists(select 1 from public.homework_versions v where v.id=homework_version_id and v.teacher_id=auth.uid()));

create or replace function public.owns_homework(p_teacher uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_teacher=auth.uid() or exists(
    select 1 from public.organization_members m
    join public.organization_members target on target.organization_id=m.organization_id and target.user_id=p_teacher
    where m.user_id=auth.uid() and m.role='owner'
  )
$$;

drop policy if exists "org teachers manage homeworks" on public.homeworks;
drop policy if exists "org teachers manage versions" on public.homework_versions;
drop policy if exists "org teachers manage templates" on public.homework_templates;
drop policy if exists "teachers manage questions" on public.homework_questions;
drop policy if exists "teachers manage accepted answers" on public.question_accepted_answers;

create policy "teachers manage own homeworks" on public.homeworks for all
  using(public.owns_homework(teacher_id)) with check(teacher_id=auth.uid() and public.is_org_teacher(organization_id));
create policy "teachers read own versions" on public.homework_versions for select using(public.owns_homework(teacher_id));
create policy "teachers create own versions" on public.homework_versions for insert with check(teacher_id=auth.uid() and public.is_org_teacher(organization_id));
create policy "teachers update own drafts" on public.homework_versions for update
  using(teacher_id=auth.uid() and published_at is null) with check(teacher_id=auth.uid() and published_at is null);
create policy "teachers manage own templates" on public.homework_templates for all
  using(public.owns_homework(teacher_id)) with check(teacher_id=auth.uid() and public.is_org_teacher(organization_id));
create policy "teachers manage own draft questions" on public.homework_questions for all using(
  exists(select 1 from public.homework_versions v where v.id=homework_version_id and v.teacher_id=auth.uid() and v.published_at is null)
) with check(
  exists(select 1 from public.homework_versions v where v.id=homework_version_id and v.teacher_id=auth.uid() and v.published_at is null)
);
create policy "teachers read own questions" on public.homework_questions for select using(exists(select 1 from public.homework_versions v where v.id=homework_version_id and public.owns_homework(v.teacher_id)));
create policy "teachers manage own draft answers" on public.question_accepted_answers for all using(
  exists(select 1 from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where q.id=question_id and v.teacher_id=auth.uid() and v.published_at is null)
) with check(
  exists(select 1 from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where q.id=question_id and v.teacher_id=auth.uid() and v.published_at is null)
);
create policy "teachers read own accepted answers" on public.question_accepted_answers for select using(exists(select 1 from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where q.id=question_id and public.owns_homework(v.teacher_id)));

create or replace function public.create_homework(
  p_title text, p_mode public.homework_mode, p_deadline timestamptz,
  p_attempts int, p_student_ids uuid[], p_questions jsonb default '[]'::jsonb,
  p_manual_tasks jsonb default '[]'::jsonb, p_instructions text default '', p_timezone text default 'Europe/Moscow', p_homework uuid default null, p_subject uuid default null, p_topic uuid default null,
  p_individual_deadlines jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_org uuid; v_homework uuid; v_version uuid; v_question uuid; item jsonb; answer text; v_position int:=0; v_version_number int:=1;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'unauthorized'; end if;
  if length(btrim(p_title)) not between 1 and 160 or length(p_instructions)>10000 then raise exception 'invalid_homework'; end if;
  if p_attempts not between 1 and 20 or p_deadline<=now() then raise exception 'invalid_settings'; end if;
  select organization_id into v_org from public.organization_members
    where user_id=auth.uid() and role in ('owner','teacher') order by role='owner' desc limit 1;
  if v_org is null then raise exception 'forbidden'; end if;
  if cardinality(p_student_ids)=0 or exists(
    select 1 from unnest(p_student_ids) s where not exists(
      select 1 from public.teacher_student_links l where l.teacher_id=auth.uid() and l.student_id=s and l.organization_id=v_org
    )
  ) then raise exception 'invalid_students'; end if;
  if jsonb_typeof(p_individual_deadlines)<>'object' or exists(
    select 1 from jsonb_each_text(p_individual_deadlines) d
    where not (d.key::uuid=any(p_student_ids))
      or d.value::timestamptz<=now()
  ) then raise exception 'invalid_individual_deadlines'; end if;
  if p_mode<>'manual' and (jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)=0) then raise exception 'questions_required'; end if;
  if p_mode<>'automatic' and (jsonb_typeof(p_manual_tasks)<>'array' or jsonb_array_length(p_manual_tasks)=0) then raise exception 'manual_tasks_required'; end if;
  if p_subject is not null and not exists(select 1 from public.subjects where id=p_subject and organization_id=v_org) then raise exception 'invalid_subject'; end if;
  if p_topic is not null and not exists(select 1 from public.topics t join public.subjects s on s.id=t.subject_id where t.id=p_topic and s.organization_id=v_org and (p_subject is null or s.id=p_subject)) then raise exception 'invalid_topic'; end if;

  if p_homework is null then
    insert into public.homeworks(organization_id,teacher_id,title) values(v_org,auth.uid(),btrim(p_title)) returning id into v_homework;
  else
    select id into v_homework from public.homeworks where id=p_homework and teacher_id=auth.uid() and archived_at is null;
    if not found then raise exception 'homework_not_found'; end if;
    select coalesce(max(version),0)+1 into v_version_number from public.homework_versions where homework_id=v_homework;
    update public.homeworks set title=btrim(p_title) where id=v_homework;
  end if;
  insert into public.homework_versions(organization_id,teacher_id,homework_id,title,instructions,mode,attempts_allowed,version,subject_id,topic_id)
    values(v_org,auth.uid(),v_homework,btrim(p_title),p_instructions,p_mode,p_attempts,v_version_number,p_subject,p_topic) returning id into v_version;
  for item in select value from jsonb_array_elements(p_questions) loop
    v_position:=v_position+1;
    if length(btrim(coalesce(item->>'prompt',''))) not between 1 and 2000 then raise exception 'invalid_question'; end if;
    insert into public.homework_questions(homework_version_id,position,prompt)
      values(v_version,v_position,btrim(item->>'prompt')) returning id into v_question;
    for answer in select value #>> '{}' from jsonb_array_elements(coalesce(item->'answers','[]'::jsonb)) loop
      if length(btrim(answer)) between 1 and 500 then insert into public.question_accepted_answers(question_id,value) values(v_question,btrim(answer)); end if;
    end loop;
    if p_mode<>'manual' and not exists(select 1 from public.question_accepted_answers where question_id=v_question) then raise exception 'answer_required'; end if;
  end loop;
  v_position:=0;
  for item in select value from jsonb_array_elements(p_manual_tasks) loop
    v_position:=v_position+1;
    if length(btrim(coalesce(item->>'prompt',''))) not between 1 and 2000 then raise exception 'invalid_manual_task'; end if;
    insert into public.manual_tasks(homework_version_id,position,prompt) values(v_version,v_position,btrim(item->>'prompt'));
  end loop;
  update public.homework_versions set published_at=now() where id=v_version;
  insert into public.homework_assignments(homework_version_id,student_id,deadline_at,timezone)
    select v_version,s,coalesce((p_individual_deadlines->>s::text)::timestamptz,p_deadline),left(coalesce(nullif(p_timezone,''),'Europe/Moscow'),80) from unnest(p_student_ids) s;
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
    select s,'homework','Новое задание: '||btrim(p_title),'/student/homework/'||a.id,'assignment:'||a.id
    from unnest(p_student_ids) s join public.homework_assignments a on a.homework_version_id=v_version and a.student_id=s;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_org,auth.uid(),'homework_published','homework',v_homework,jsonb_build_object('assignments',cardinality(p_student_ids)));
  return v_homework;
end $$;

create or replace function public.normalize_answer(value text) returns text
language sql immutable parallel safe as $$ select lower(regexp_replace(btrim(normalize(coalesce(value,''),NFKC)),'\s+',' ','g')) $$;

create or replace function public.submit_attempt(p_assignment uuid,p_answers jsonb,p_idempotency uuid)
returns table(attempt_id uuid,score int,maximum_score int,attempt_number int)
language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; allowed int; used int; new_id uuid; correct_count int; maximum int; existing public.attempts;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  if p_idempotency is null or jsonb_typeof(p_answers)<>'object' then raise exception 'invalid_request'; end if;
  select * into existing from public.attempts where idempotency_key=p_idempotency;
  if found then
    if existing.student_id<>auth.uid() or existing.assignment_id<>p_assignment then raise exception 'idempotency_conflict'; end if;
    return query select existing.id,existing.score,existing.maximum_score,existing.attempt_number; return;
  end if;
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found or a.student_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select hv.attempts_allowed,count(q.id) into allowed,maximum from public.homework_versions hv
    left join public.homework_questions q on q.homework_version_id=hv.id where hv.id=a.homework_version_id group by hv.attempts_allowed;
  select count(*) into used from public.attempts where assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  select count(*) into correct_count from public.homework_questions q where q.homework_version_id=a.homework_version_id and exists(
    select 1 from public.question_accepted_answers aa where aa.question_id=q.id and public.normalize_answer(aa.value)=public.normalize_answer(p_answers->>q.id::text)
  );
  insert into public.attempts(assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key,started_at,duration_seconds)
    values(a.id,auth.uid(),used+1,p_answers,correct_count,maximum,p_idempotency,(select started_at from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid()),greatest(0,extract(epoch from now()-coalesce((select started_at from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid()),now()))::int)) returning id into new_id;
  insert into public.attempt_answers(attempt_id,question_id,value,is_correct)
    select new_id,q.id,coalesce(p_answers->>q.id::text,''),exists(select 1 from public.question_accepted_answers aa where aa.question_id=q.id and public.normalize_answer(aa.value)=public.normalize_answer(p_answers->>q.id::text))
    from public.homework_questions q where q.homework_version_id=a.homework_version_id;
  update public.homework_assignments set status=case when hv.mode='combined' then 'awaiting_review'::public.assignment_status else 'submitted'::public.assignment_status end
    from public.homework_versions hv where public.homework_assignments.id=a.id and hv.id=a.homework_version_id;
  delete from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid();
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
    select hv.teacher_id,'result','Ученик отправил тест','/teacher/results/'||new_id,'attempt:'||new_id from public.homework_versions hv where hv.id=a.homework_version_id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(auth.uid(),'result','Результат попытки готов','/student/results/'||new_id,'attempt-result:'||new_id);
  if used+1>=allowed then insert into public.notifications(user_id,kind,title,href,dedupe_key) select hv.teacher_id,'result','Ученик использовал все попытки','/teacher/results/'||new_id,'attempts-used:'||a.id from public.homework_versions hv where hv.id=a.homework_version_id; end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    select hv.organization_id,auth.uid(),'test_submitted','attempt',new_id,jsonb_build_object('score',correct_count,'maximum',maximum) from public.homework_versions hv where hv.id=a.homework_version_id;
  return query select new_id,correct_count,maximum,used+1;
end $$;

revoke all on function public.create_homework(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_homework(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.submit_attempt(uuid,jsonb,uuid) from public;
grant execute on function public.submit_attempt(uuid,jsonb,uuid) to authenticated;
