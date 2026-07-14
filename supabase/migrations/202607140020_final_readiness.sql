-- Final MVP consistency: durable results, variable written scores and retry-safe attempts.

alter table public.manual_tasks add column if not exists max_points integer not null default 2;
alter table public.manual_tasks drop constraint if exists manual_tasks_max_points_check;
alter table public.manual_tasks add constraint manual_tasks_max_points_check check (max_points between 1 and 20);

alter table public.manual_task_scores drop constraint if exists manual_task_scores_points_check;
alter table public.manual_task_scores add column if not exists manual_task_id uuid references public.manual_tasks(id);
update public.manual_task_scores s set manual_task_id=t.id
from public.manual_submissions ms
join public.homework_assignments a on a.id=ms.assignment_id
join public.manual_tasks t on t.homework_version_id=a.homework_version_id
where ms.id=s.submission_id and t.position=s.task_number and s.manual_task_id is null;
alter table public.manual_task_scores alter column manual_task_id set not null;
create unique index if not exists manual_task_scores_submission_task_idx on public.manual_task_scores(submission_id,manual_task_id);
create or replace function public.validate_manual_task_score() returns trigger language plpgsql set search_path=public as $$
declare maximum int;
begin
  if new.manual_task_id is null then return new; end if;
  select max_points into maximum from public.manual_tasks where id=new.manual_task_id;
  if maximum is null or new.points<0 or new.points>maximum then raise exception 'invalid_score'; end if;
  return new;
end $$;
drop trigger if exists manual_task_score_valid on public.manual_task_scores;
create trigger manual_task_score_valid before insert or update on public.manual_task_scores for each row execute function public.validate_manual_task_score();

do $$ begin
  create type public.assignment_result_status as enum ('automatic_pending','automatic_complete','manual_pending','awaiting_review','reviewed','returned');
exception when duplicate_object then null; end $$;

create table if not exists public.assignment_results (
  assignment_id uuid primary key references public.homework_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  homework_version_id uuid not null references public.homework_versions(id),
  best_attempt_id uuid references public.attempts(id),
  reviewed_submission_id uuid references public.manual_submissions(id),
  automatic_score integer not null default 0 check(automatic_score>=0),
  automatic_maximum integer not null default 0 check(automatic_maximum>=0),
  manual_score integer not null default 0 check(manual_score>=0),
  manual_maximum integer not null default 0 check(manual_maximum>=0),
  total_score integer not null default 0 check(total_score>=0),
  total_maximum integer not null default 0 check(total_maximum>=0),
  percentage integer not null default 0 check(percentage between 0 and 100),
  result_status public.assignment_result_status not null,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(automatic_score<=automatic_maximum and manual_score<=manual_maximum and total_score<=total_maximum)
);
create index if not exists assignment_results_student_idx on public.assignment_results(student_id);
create index if not exists assignment_results_version_idx on public.assignment_results(homework_version_id);
create index if not exists assignment_results_updated_idx on public.assignment_results(updated_at desc);
create index if not exists manual_tasks_version_idx on public.manual_tasks(homework_version_id);
create index if not exists lessons_starts_idx on public.lessons(starts_at);
create index if not exists notifications_user_read_idx on public.notifications(user_id,read_at);
alter table public.assignment_results enable row level security;
create policy "participants read official results" on public.assignment_results for select using(
  student_id=auth.uid() or public.is_linked_teacher(student_id)
);
grant select on public.assignment_results to authenticated;

alter table public.profiles add column if not exists active_organization_id uuid references public.organizations(id);
update public.profiles p set active_organization_id=(
  select m.organization_id from public.organization_members m where m.user_id=p.id order by m.organization_id limit 1
) where active_organization_id is null;
create or replace function public.active_organization()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare result uuid;
begin
  select p.active_organization_id into result from public.profiles p where p.id=auth.uid();
  if result is null or not exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.organization_id=result) then
    raise exception 'active_organization_required';
  end if;
  return result;
end $$;
create or replace function public.set_initial_active_organization() returns trigger language plpgsql security definer set search_path=public as $$
begin update public.profiles set active_organization_id=new.organization_id where id=new.user_id and active_organization_id is null; return new; end $$;
drop trigger if exists membership_sets_active_organization on public.organization_members;
create trigger membership_sets_active_organization after insert on public.organization_members for each row execute function public.set_initial_active_organization();

create or replace function public.recalculate_assignment_result(p_assignment uuid)
returns public.assignment_results language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; v public.homework_versions; best public.attempts; reviewed public.manual_submissions;
  auto_max int; manual_max int; manual_score int:=0; state public.assignment_result_status; result public.assignment_results;
begin
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found then raise exception 'assignment_not_found'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  select * into best from public.attempts where assignment_id=a.id order by score desc,submitted_at asc,id asc limit 1;
  select count(*) into auto_max from public.homework_questions where homework_version_id=v.id;
  select coalesce(sum(max_points),0) into manual_max from public.manual_tasks where homework_version_id=v.id;
  select * into reviewed from public.manual_submissions where assignment_id=a.id and reviewed_at is not null order by version desc limit 1;
  if found then
    select coalesce(sum(s.points),0) into manual_score from public.manual_task_scores s where s.submission_id=reviewed.id;
  end if;
  state:=case
    when a.status='returned' then 'returned'
    when reviewed.id is not null then 'reviewed'
    when a.status='awaiting_review' then 'awaiting_review'
    when v.mode='automatic' and best.id is not null then 'automatic_complete'
    when v.mode='combined' and best.id is not null then 'manual_pending'
    when v.mode='manual' then 'manual_pending'
    else 'automatic_pending' end;
  insert into public.assignment_results(assignment_id,student_id,homework_version_id,best_attempt_id,reviewed_submission_id,
    automatic_score,automatic_maximum,manual_score,manual_maximum,total_score,total_maximum,percentage,result_status,calculated_at,updated_at)
  values(a.id,a.student_id,v.id,best.id,reviewed.id,coalesce(best.score,0),auto_max,manual_score,manual_max,
    coalesce(best.score,0)+manual_score,auto_max+manual_max,
    case when auto_max+manual_max=0 then 0 else round(100.0*(coalesce(best.score,0)+manual_score)/(auto_max+manual_max))::int end,state,now(),now())
  on conflict(assignment_id) do update set best_attempt_id=excluded.best_attempt_id,reviewed_submission_id=excluded.reviewed_submission_id,
    automatic_score=excluded.automatic_score,automatic_maximum=excluded.automatic_maximum,manual_score=excluded.manual_score,
    manual_maximum=excluded.manual_maximum,total_score=excluded.total_score,total_maximum=excluded.total_maximum,
    percentage=excluded.percentage,result_status=excluded.result_status,calculated_at=excluded.calculated_at,updated_at=excluded.updated_at
  returning * into result;
  return result;
end $$;

create or replace function public.start_or_resume_attempt_draft(p_assignment uuid)
returns table(assignment_id uuid,answers jsonb,started_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; allowed int; used int;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into a from public.homework_assignments where id=p_assignment and student_id=auth.uid() for update;
  if not found then raise exception 'forbidden'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select attempts_allowed into allowed from public.homework_versions where id=a.homework_version_id;
  select count(*) into used from public.attempts where attempts.assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  insert into public.attempt_drafts(assignment_id,student_id,answers,started_at)
    values(a.id,auth.uid(),'{}',now()) on conflict on constraint attempt_drafts_assignment_id_student_id_key do nothing;
  update public.homework_assignments set status='in_progress' where id=a.id and status='not_started';
  return query select d.assignment_id,d.answers,d.started_at,d.updated_at from public.attempt_drafts d where d.assignment_id=a.id and d.student_id=auth.uid();
end $$;

create or replace function public.submit_attempt(p_assignment uuid,p_answers jsonb,p_idempotency uuid)
returns table(attempt_id uuid,score int,maximum_score int,attempt_number int)
language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; v public.homework_versions; allowed int; used int; new_id uuid; correct_count int; maximum int; existing public.attempts; started timestamptz;
begin
  if not public.is_active_user() or p_idempotency is null or jsonb_typeof(p_answers)<>'object' then raise exception 'invalid_request'; end if;
  select * into existing from public.attempts where idempotency_key=p_idempotency;
  if found then
    if existing.student_id<>auth.uid() or existing.assignment_id<>p_assignment then raise exception 'idempotency_conflict'; end if;
    return query select existing.id,existing.score,existing.maximum_score,existing.attempt_number; return;
  end if;
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found or a.student_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  allowed:=v.attempts_allowed;
  select count(*) into maximum from public.homework_questions q where q.homework_version_id=v.id;
  select count(*) into used from public.attempts where assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  select started_at into started from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid();
  if started is null then select x.started_at into started from public.start_or_resume_attempt_draft(a.id) x; end if;
  select count(*) into correct_count from public.homework_questions q where q.homework_version_id=a.homework_version_id and exists(
    select 1 from public.question_accepted_answers aa where aa.question_id=q.id and public.normalize_answer(aa.value)=public.normalize_answer(p_answers->>q.id::text));
  insert into public.attempts(assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key,started_at,duration_seconds)
    values(a.id,auth.uid(),used+1,p_answers,correct_count,maximum,p_idempotency,started,greatest(0,extract(epoch from now()-started)::int)) returning id into new_id;
  insert into public.attempt_answers(attempt_id,question_id,value,is_correct)
    select new_id,q.id,coalesce(p_answers->>q.id::text,''),exists(select 1 from public.question_accepted_answers aa where aa.question_id=q.id and public.normalize_answer(aa.value)=public.normalize_answer(p_answers->>q.id::text))
    from public.homework_questions q where q.homework_version_id=a.homework_version_id;
  update public.homework_assignments set status=case when v.mode='combined' then 'in_progress'::public.assignment_status else 'submitted'::public.assignment_status end where id=a.id;
  delete from public.attempt_drafts where assignment_id=a.id and student_id=auth.uid();
  perform public.recalculate_assignment_result(a.id);
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(v.teacher_id,'result','Ученик отправил тест','/teacher/homework/'||a.id||'/result','attempt:'||new_id);
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(auth.uid(),'result','Результат попытки готов','/student/homework/'||a.id||'/result','attempt-result:'||new_id);
  if used+1>=allowed then insert into public.notifications(user_id,kind,title,href,dedupe_key) values(v.teacher_id,'result','Ученик использовал все попытки','/teacher/homework/'||a.id||'/result','attempts-used:'||a.id); end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v.organization_id,auth.uid(),'test_submitted','attempt',new_id,jsonb_build_object('score',correct_count,'maximum',maximum));
  return query select new_id,correct_count,maximum,used+1;
end $$;

create or replace function public.get_assignment_result(p_assignment uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('assignment_id',r.assignment_id,'title',v.title,'mode',v.mode,'status',r.result_status,
    'automatic_score',r.automatic_score,'automatic_maximum',r.automatic_maximum,'manual_score',r.manual_score,
    'manual_maximum',r.manual_maximum,'total_score',r.total_score,'total_maximum',r.total_maximum,'percentage',r.percentage,
    'best_attempt_id',r.best_attempt_id,'reviewed_submission_id',r.reviewed_submission_id,
    'attempts_used',(select count(*) from public.attempts x where x.assignment_id=r.assignment_id),
    'attempts_allowed',v.attempts_allowed,'updated_at',r.updated_at)
  from public.assignment_results r join public.homework_versions v on v.id=r.homework_version_id
  where r.assignment_id=p_assignment and (r.student_id=auth.uid() or public.is_linked_teacher(r.student_id))
$$;

revoke all on function public.recalculate_assignment_result(uuid),public.start_or_resume_attempt_draft(uuid),public.get_assignment_result(uuid),public.active_organization() from public;
grant execute on function public.start_or_resume_attempt_draft(uuid),public.get_assignment_result(uuid),public.active_organization() to authenticated;

create or replace function public.create_homework_v2(
  p_title text,p_mode public.homework_mode,p_deadline timestamptz,p_attempts int,p_student_ids uuid[],
  p_questions jsonb default '[]',p_manual_tasks jsonb default '[]',p_instructions text default '',
  p_timezone text default 'Europe/Moscow',p_homework uuid default null,p_subject uuid default null,p_topic uuid default null,
  p_individual_deadlines jsonb default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; version_id uuid; item jsonb; position_value int:=0; active_org uuid;
begin
  active_org:=public.active_organization();
  if exists(select 1 from unnest(p_student_ids) student where not exists(
    select 1 from public.teacher_student_links l where l.teacher_id=auth.uid() and l.student_id=student and l.organization_id=active_org
  )) then raise exception 'invalid_students'; end if;
  result:=public.create_homework(p_title,p_mode,p_deadline,p_attempts,p_student_ids,p_questions,p_manual_tasks,p_instructions,p_timezone,p_homework,p_subject,p_topic,p_individual_deadlines);
  select v.id into version_id from public.homework_versions v where v.homework_id=result and v.teacher_id=auth.uid() order by v.version desc limit 1;
  for item in select value from jsonb_array_elements(p_manual_tasks) loop
    position_value:=position_value+1;
    if coalesce((item->>'max_points')::int,2) not between 1 and 20 then raise exception 'invalid_manual_maximum'; end if;
    update public.manual_tasks set max_points=coalesce((item->>'max_points')::int,2) where homework_version_id=version_id and position=position_value;
  end loop;
  perform public.recalculate_assignment_result(a.id) from public.homework_assignments a where a.homework_version_id=version_id;
  return result;
end $$;

create or replace function public.save_manual_review(p_submission uuid,p_scores jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions;a public.homework_assignments;v public.homework_versions;entry record;task public.manual_tasks;points int;
begin
  if not public.is_active_user() or jsonb_typeof(p_scores)<>'object' then raise exception 'invalid_request'; end if;
  select * into s from public.manual_submissions where id=p_submission and submitted_at is not null and reviewed_at is null for update;
  if not found then raise exception 'not_reviewable'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id; select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  for entry in select * from jsonb_each_text(p_scores) loop
    select * into task from public.manual_tasks where id=entry.key::uuid and homework_version_id=v.id;
    points:=entry.value::int;
    if task.id is null or points<0 or points>task.max_points then raise exception 'invalid_score'; end if;
    insert into public.manual_task_scores(submission_id,task_number,manual_task_id,points) values(s.id,task.position,task.id,points)
      on conflict(submission_id,manual_task_id) do update set points=excluded.points,task_number=excluded.task_number;
  end loop;
  update public.manual_submissions set review_started_at=coalesce(review_started_at,now()) where id=s.id;
end $$;

create or replace function public.grade_manual_submission(p_submission uuid,p_scores jsonb)
returns table(manual_score int,manual_maximum int,total_score int,total_maximum int,percentage int)
language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions;a public.homework_assignments;v public.homework_versions;task public.manual_tasks;points int;official public.assignment_results;
begin
  if not public.is_active_user() or jsonb_typeof(p_scores)<>'object' then raise exception 'invalid_request'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null then raise exception 'not_submitted'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update; select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  for task in select * from public.manual_tasks where homework_version_id=v.id order by position loop
    points:=coalesce((p_scores->>task.id::text)::int,-1);
    if points<0 or points>task.max_points then raise exception 'invalid_score'; end if;
    insert into public.manual_task_scores(submission_id,task_number,manual_task_id,points) values(s.id,task.position,task.id,points)
      on conflict(submission_id,manual_task_id) do update set points=excluded.points,task_number=excluded.task_number;
  end loop;
  update public.manual_submissions set reviewed_at=now() where id=s.id;
  update public.homework_assignments set status='reviewed' where id=a.id;
  official:=public.recalculate_assignment_result(a.id);
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(s.student_id,'review','Письменная часть проверена','/student/homework/'||a.id||'/result','manual-reviewed:'||s.id)
    on conflict(user_id,dedupe_key) do update set title=excluded.title,href=excluded.href,read_at=null;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v.organization_id,auth.uid(),'manual_graded','manual_submission',s.id,jsonb_build_object('manual_score',official.manual_score,'manual_maximum',official.manual_maximum));
  return query select official.manual_score,official.manual_maximum,official.total_score,official.total_maximum,official.percentage;
end $$;

-- Existing finalization/return functions keep uploads atomic; triggers keep the official result synchronized.
create or replace function public.sync_assignment_result_from_manual() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalculate_assignment_result(new.assignment_id); return new; end $$;
drop trigger if exists manual_submission_result_sync on public.manual_submissions;
create trigger manual_submission_result_sync after update of submitted_at,reviewed_at,returned_at on public.manual_submissions for each row execute function public.sync_assignment_result_from_manual();
create or replace function public.sync_assignment_result_from_status() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalculate_assignment_result(new.id); return new; end $$;
drop trigger if exists assignment_status_result_sync on public.homework_assignments;
create trigger assignment_status_result_sync after update of status on public.homework_assignments for each row execute function public.sync_assignment_result_from_status();

create or replace function public.update_lesson_occurrence(p_lesson uuid,p_starts timestamptz default null,p_ends timestamptz default null,p_status public.lesson_status default null,p_zoom_url text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.lessons; next_start timestamptz; next_status public.lesson_status; event_key text;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into l from public.lessons where id=p_lesson and teacher_id=auth.uid() for update;if not found then raise exception 'forbidden'; end if;
  if p_starts is not null and (p_ends is null or p_ends<=p_starts) then raise exception 'invalid_time'; end if;
  if p_zoom_url is not null and p_zoom_url!~'^https://[^[:space:]]+$' then raise exception 'invalid_zoom_url'; end if;
  next_start:=coalesce(p_starts,l.starts_at); next_status:=coalesce(p_status,case when p_starts is not null then 'moved' else l.status end);
  update public.lessons set starts_at=next_start,ends_at=coalesce(p_ends,ends_at),status=next_status,zoom_url=coalesce(p_zoom_url,zoom_url) where id=p_lesson;
  event_key:=case when next_status='cancelled' then 'lesson-cancelled:'||p_lesson when next_status='scheduled' then 'lesson-restored:'||p_lesson||':'||next_start when p_starts is not null then 'lesson-moved:'||p_lesson||':'||next_start else 'lesson-updated:'||p_lesson||':'||next_status end;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(l.student_id,'lesson',case when next_status='cancelled' then 'Занятие отменено' when p_starts is not null then 'Занятие перенесено' else 'Занятие изменено' end,'/student/calendar',event_key) on conflict(user_id,dedupe_key) do nothing;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(l.organization_id,auth.uid(),'lesson_updated','lesson',p_lesson,jsonb_build_object('status',next_status,'starts',next_start));
end $$;

update public.notifications n set href='/student/homework/'||a.id||'/result'
from public.manual_submissions s join public.homework_assignments a on a.id=s.assignment_id
where n.href='/student/homework/'||a.id||'/results';

create or replace function public.update_lesson_series(p_lesson uuid,p_scope text,p_starts timestamptz,p_ends timestamptz)
returns int language plpgsql security definer set search_path=public as $$
declare source public.lessons;changed int;delta interval;
begin
  if p_scope not in ('following','series') or not public.is_active_user() then raise exception 'invalid_request'; end if;
  select * into source from public.lessons where id=p_lesson and teacher_id=auth.uid() for update;
  if not found or source.series_id is null then raise exception 'not_recurring'; end if;
  if p_ends<=p_starts then raise exception 'invalid_time'; end if; delta:=p_starts-source.starts_at;
  update public.lessons set starts_at=starts_at+delta,ends_at=ends_at+delta+(p_ends-p_starts-(source.ends_at-source.starts_at))
    where series_id=source.series_id and teacher_id=auth.uid() and status='scheduled'
      and (p_scope='series' or starts_at>=source.starts_at);
  get diagnostics changed=row_count;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(source.student_id,'lesson','Расписание серии изменено','/student/calendar','lesson-series:'||source.series_id||':'||p_scope||':'||p_starts) on conflict(user_id,dedupe_key) do nothing;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(source.organization_id,auth.uid(),'lesson_series_updated','lesson_series',source.series_id,jsonb_build_object('scope',p_scope,'count',changed));
  return changed;
end $$;

create or replace function public.student_dashboard() returns jsonb
language sql stable security definer set search_path=public as $$
  with own_assignments as (
    select a.*,v.title,v.mode,coalesce(t.name,'Математика') topic,public.assignment_deadline(a.id) effective_deadline
    from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id
    left join public.topics t on t.id=v.topic_id where a.student_id=auth.uid()
  ), official as (
    select r.* from public.assignment_results r join public.homework_versions v on v.id=r.homework_version_id
    where r.student_id=auth.uid() and (r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete'))
  )
  select jsonb_build_object(
    'nextLesson',(select jsonb_build_object('id',l.id,'seriesId',l.series_id,'startsAt',l.starts_at,'endsAt',l.ends_at,'studentName','','status',l.status,'zoomUrl',l.zoom_url) from public.lessons l where l.student_id=auth.uid() and l.starts_at>=now() and l.status<>'cancelled' order by l.starts_at limit 1),
    'nextAssignment',(select jsonb_build_object('id',a.id,'homeworkId','','title',a.title,'topic',a.topic,'deadline',to_char(a.effective_deadline at time zone a.timezone,'DD.MM.YYYY HH24:MI'),'deadlineAt',a.effective_deadline,'status',a.status,'mode',a.mode) from own_assignments a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed') order by a.effective_deadline limit 1),
    'activeCount',(select count(*) from own_assignments a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed')),
    'overdueCount',(select count(*) from own_assignments a where a.effective_deadline<now() and a.status not in ('submitted','reviewed')),
    'average',coalesce((select round(avg(percentage)) from official),0),
    'completionRate',coalesce((select round(100.0*count(*) filter(where status in ('submitted','reviewed'))/nullif(count(*),0)) from own_assignments),0),
    'recentResults',(select coalesce(jsonb_agg(jsonb_build_object('id',assignment_id,'score',total_score,'maximum',total_maximum,'submittedAt',updated_at) order by updated_at desc),'[]') from (select * from official order by updated_at desc limit 5)x),
    'unreadNotificationCount',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null)
  )
$$;
revoke all on function public.student_dashboard() from public;
grant execute on function public.student_dashboard() to authenticated;

create or replace function public.teacher_dashboard() returns jsonb
language sql stable security definer set search_path=public as $$
  with linked as (select student_id from public.teacher_student_links where teacher_id=auth.uid()),
  assigned as (
    select a.*,v.title,public.assignment_deadline(a.id) effective_deadline from public.homework_assignments a
    join public.homework_versions v on v.id=a.homework_version_id where v.teacher_id=auth.uid()
  )
  select jsonb_build_object(
    'teacherName',(select first_name from public.profiles where id=auth.uid()),
    'awaitingReviewCount',(select count(*) from assigned where status='awaiting_review'),
    'overdueCount',(select count(*) from assigned where effective_deadline<now() and status not in ('submitted','reviewed')),
    'deadlineTodayCount',(select count(*) from assigned where effective_deadline::date=current_date),
    'deadlineTomorrowCount',(select count(*) from assigned where effective_deadline::date=current_date+1),
    'lessonsTodayCount',(select count(*) from public.lessons where teacher_id=auth.uid() and starts_at::date=current_date),
    'newAutomaticResultsCount',(select count(*) from public.notifications where user_id=auth.uid() and kind='result' and read_at is null),
    'newPhotoSubmissionsCount',(select count(*) from public.notifications where user_id=auth.uid() and kind='submission' and read_at is null),
    'studentsWithoutFutureLessonCount',(select count(*) from linked x where not exists(select 1 from public.lessons l where l.teacher_id=auth.uid() and l.student_id=x.student_id and l.starts_at>now() and l.status in ('scheduled','moved'))),
    'attentionItems',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'href',href) order by created_at desc),'[]') from (select id,title,href,created_at from public.notifications where user_id=auth.uid() and read_at is null order by created_at desc limit 5)n)
  )
$$;
revoke all on function public.teacher_dashboard() from public;
grant execute on function public.teacher_dashboard() to authenticated;

create or replace function public.assignment_cards()
returns table(id uuid,homework_id uuid,title text,topic text,mode public.homework_mode,status public.assignment_status,effective_deadline timestamptz)
language sql stable security definer set search_path=public as $$
  select a.id,v.homework_id,v.title,coalesce(t.name,'Математика'),v.mode,a.status,public.assignment_deadline(a.id)
  from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id left join public.topics t on t.id=v.topic_id
  where public.is_active_user() and (a.student_id=auth.uid() or v.teacher_id=auth.uid())
  order by public.assignment_deadline(a.id)
$$;
revoke all on function public.assignment_cards() from public;
grant execute on function public.assignment_cards() to authenticated;

create or replace function public.teacher_student_summary()
returns table(id uuid,first_name text,last_name text,username text,class_name text,status public.member_status,subject text,default_zoom_url text,average_result int,overdue_count int,last_activity timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.first_name,p.last_name,p.username,p.class_name,p.status,l.subject,l.default_zoom_url,
    coalesce(round(avg(r.percentage) filter(where r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete')))::int,0),
    count(distinct a.id) filter(where a.status not in ('submitted','reviewed') and public.assignment_deadline(a.id)<now())::int,
    greatest(p.updated_at,coalesce(max(r.updated_at),'-infinity'),coalesce(max(ms.submitted_at),'-infinity'))
  from public.teacher_student_links l join public.profiles p on p.id=l.student_id
  left join public.homework_assignments a on a.student_id=p.id
  left join public.homework_versions v on v.id=a.homework_version_id
  left join public.assignment_results r on r.assignment_id=a.id
  left join public.manual_submissions ms on ms.assignment_id=a.id
  where l.teacher_id=auth.uid() and public.is_active_user()
  group by p.id,p.first_name,p.last_name,p.username,p.class_name,p.status,l.subject,l.default_zoom_url,p.updated_at
  order by p.last_name,p.first_name
$$;

create or replace function public.student_learning_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'assigned',count(distinct a.id),
    'completed',count(distinct a.id) filter(where r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete')),
    'overdue',count(distinct a.id) filter(where a.status not in ('submitted','reviewed') and public.assignment_deadline(a.id)<now()),
    'awaiting_review',count(distinct a.id) filter(where r.result_status='awaiting_review'),
    'average_percentage',coalesce(round(avg(r.percentage) filter(where r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete'))),0),
    'best_percentage',coalesce(max(r.percentage) filter(where r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete')),0)
  ) from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id left join public.assignment_results r on r.assignment_id=a.id
  where a.student_id=auth.uid() and public.is_active_user()
$$;

create or replace function public.teacher_student_analytics(p_student uuid,p_days int default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;cutoff timestamptz:=case when p_days is null then '-infinity'::timestamptz else now()-(p_days||' days')::interval end;
begin
  if p_days is not null and p_days not in (7,30) then raise exception 'invalid_period'; end if;
  if not public.is_linked_teacher(p_student) then raise exception 'forbidden'; end if;
  with scoped as (
    select a.*,v.title,v.mode,v.topic_id,coalesce(t.name,'Без темы') topic,public.assignment_deadline(a.id) effective_deadline,r.*,
      coalesce(r.updated_at,public.assignment_deadline(a.id)) metric_at
    from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id
    left join public.topics t on t.id=v.topic_id left join public.assignment_results r on r.assignment_id=a.id
    where a.student_id=p_student
  ), period_assignments as (select * from scoped where metric_at>=cutoff)
  select jsonb_build_object(
    'summary',(select jsonb_build_object('assigned',count(*),'completed',count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')),
      'overdue',count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()),'awaiting_review',count(*) filter(where result_status='awaiting_review'),
      'reviewed',count(*) filter(where result_status='reviewed'),'completion_rate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))/count(*)) end) from period_assignments),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('assignment_id',id,'title',title,'topic',topic,'mode',mode,'deadline',deadline_at,
      'effective_deadline',effective_deadline,'status',status,'attempts_used',(select count(*) from public.attempts x where x.assignment_id=period_assignments.id),
      'best_score',automatic_score,'automatic_maximum',automatic_maximum,'submitted_at',updated_at) order by effective_deadline desc),'[]') from period_assignments),
    'topics',(select coalesce(jsonb_agg(row_to_json(x)),'[]') from (select topic,count(*) assigned,
      count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')) completed,
      count(*) filter(where result_status='reviewed') reviewed,count(*) filter(where result_status='awaiting_review') awaiting_review,
      count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()) overdue,
      sum((select count(*) from public.attempts z where z.assignment_id=p.id))::int attempts,
      coalesce(round(avg(percentage) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))),0) average,
      coalesce(max(percentage) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')),0) best
      from period_assignments p group by topic order by topic)x),
    'attempts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.assignment_id,'title',v.title,'attempt_number',a.attempt_number,'score',a.score,'maximum',a.maximum_score,'started_at',a.started_at,'submitted_at',a.submitted_at,'duration_seconds',a.duration_seconds) order by a.submitted_at desc),'[]') from public.attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.homework_versions v on v.id=ha.homework_version_id where a.student_id=p_student and a.submitted_at>=cutoff)
  ) into result;
  return result;
end $$;

revoke all on function public.create_homework_v2(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_homework_v2(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) to authenticated;

-- Seed official rows for existing assignments without changing historical attempts.
do $$ declare item record; begin for item in select id from public.homework_assignments loop perform public.recalculate_assignment_result(item.id); end loop; end $$;
