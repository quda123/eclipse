-- Teacher access is scoped to their own authored work, never merely to a shared student.
create function public.teacher_owns_student_version(p_version uuid,p_student uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.homework_versions v join public.teacher_student_links l on l.organization_id=v.organization_id and l.teacher_id=v.teacher_id and l.student_id=p_student
    where v.id=p_version and v.teacher_id=auth.uid() and l.status='active')
$$;
create function public.teacher_owns_student_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.homework_assignments a where a.id=p_assignment and public.teacher_owns_student_version(a.homework_version_id,a.student_id))
$$;
drop policy if exists "teachers read linked assignments" on public.homework_assignments;
create policy "teachers read own linked assignments" on public.homework_assignments for select using(
  public.teacher_owns_student_version(homework_version_id,student_id)
);
drop policy if exists "teachers create linked assignments" on public.homework_assignments;
create policy "teachers create own linked assignments" on public.homework_assignments for insert with check(
  public.teacher_owns_student_version(homework_version_id,student_id)
);
drop policy if exists "teachers read linked attempts" on public.attempts;
create policy "teachers read own attempts" on public.attempts for select using(public.teacher_owns_student_assignment(assignment_id));
drop policy if exists "student submissions" on public.manual_submissions;
create policy "participants read own teacher submissions" on public.manual_submissions for select using(student_id=auth.uid() or public.teacher_owns_student_assignment(assignment_id));
drop policy if exists "participants read official results" on public.assignment_results;
create policy "participants read own teacher results" on public.assignment_results for select using(student_id=auth.uid() or public.teacher_owns_student_version(homework_version_id,student_id));

create or replace function public.create_lesson(p_student uuid,p_starts timestamptz,p_ends timestamptz,p_timezone text,p_zoom_url text default null,p_weekly boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare l public.teacher_student_links;series_id uuid;first_id uuid;occurrence timestamptz;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into l from public.teacher_student_links where organization_id=public.active_organization() and teacher_id=auth.uid() and student_id=p_student and status='active';
  if not found then raise exception 'forbidden'; end if;
  if p_ends<=p_starts or p_starts<now()-interval '5 minutes' or p_ends-p_starts>interval '8 hours' then raise exception 'invalid_time'; end if;
  if coalesce(p_zoom_url,l.default_zoom_url) is not null and coalesce(p_zoom_url,l.default_zoom_url)!~'^https://[^[:space:]]+$' then raise exception 'invalid_video_url'; end if;
  if p_weekly then insert into public.lesson_series(organization_id,teacher_id,student_id,rrule,timezone,zoom_url) values(l.organization_id,auth.uid(),p_student,'FREQ=WEEKLY',left(p_timezone,80),coalesce(p_zoom_url,l.default_zoom_url)) returning id into series_id; end if;
  for occurrence in select p_starts+(n||' weeks')::interval from generate_series(0,case when p_weekly then 51 else 0 end)n loop
    insert into public.lessons(series_id,organization_id,teacher_id,student_id,starts_at,ends_at,timezone,zoom_url,original_occurrence)
    values(series_id,l.organization_id,auth.uid(),p_student,occurrence,occurrence+(p_ends-p_starts),left(p_timezone,80),coalesce(p_zoom_url,l.default_zoom_url),case when p_weekly then occurrence end) returning id into first_id;
  end loop;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(p_student,'lesson','Назначено занятие','/student/calendar','lesson:'||first_id);
  return first_id;
end $$;

create or replace function public.create_homework_v2(
  p_title text,p_mode public.homework_mode,p_deadline timestamptz,p_attempts int,p_student_ids uuid[],p_questions jsonb default '[]',p_manual_tasks jsonb default '[]',
  p_instructions text default '',p_timezone text default 'Europe/Moscow',p_homework uuid default null,p_subject uuid default null,p_topic uuid default null,p_individual_deadlines jsonb default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from unnest(p_student_ids) s where not exists(select 1 from public.teacher_student_links l where l.organization_id=public.active_organization() and l.teacher_id=auth.uid() and l.student_id=s and l.status='active')) then raise exception 'invalid_students'; end if;
  return public.create_homework(p_title,p_mode,p_deadline,p_attempts,p_student_ids,p_questions,p_manual_tasks,p_instructions,p_timezone,p_homework,p_subject,p_topic,p_individual_deadlines);
end $$;
grant execute on function public.create_homework(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) to authenticated;

create function public.enforce_active_assignment_link() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.organization_members where user_id=auth.uid() and role in ('owner','teacher')) and not public.teacher_owns_student_version(new.homework_version_id,new.student_id) then raise exception 'invalid_students'; end if;
  return new;
end $$;
create trigger assignment_requires_active_link before insert on public.homework_assignments for each row execute function public.enforce_active_assignment_link();

create or replace function public.teacher_student_analytics(p_student uuid,p_days int default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;cutoff timestamptz:=case when p_days is null then '-infinity'::timestamptz else now()-(p_days||' days')::interval end;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  if p_days is not null and p_days not in (7,30) then raise exception 'invalid_period'; end if;
  if not exists(select 1 from public.teacher_student_links where organization_id=public.active_organization() and teacher_id=auth.uid() and student_id=p_student and status='active') then raise exception 'forbidden'; end if;
  with scoped as (
    select a.id,a.deadline_at,a.status,v.title,v.mode,coalesce(t.name,'Без темы') topic,public.assignment_deadline(a.id) effective_deadline,r.*,
      coalesce(r.updated_at,public.assignment_deadline(a.id)) metric_at
    from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id left join public.topics t on t.id=v.topic_id left join public.assignment_results r on r.assignment_id=a.id
    where a.student_id=p_student and v.teacher_id=auth.uid() and v.organization_id=public.active_organization()
  ), period_assignments as (select * from scoped where metric_at>=cutoff)
  select jsonb_build_object(
    'summary',(select jsonb_build_object('assigned',count(*),'completed',count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')),'overdue',count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()),'awaiting_review',count(*) filter(where result_status='awaiting_review'),'reviewed',count(*) filter(where result_status='reviewed'),'completion_rate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))/count(*)) end) from period_assignments),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('assignment_id',id,'title',title,'topic',topic,'mode',mode,'deadline',deadline_at,'effective_deadline',effective_deadline,'status',status,'attempts_used',(select count(*) from public.attempts x where x.assignment_id=period_assignments.id),'best_score',automatic_score,'automatic_maximum',automatic_maximum,'submitted_at',updated_at) order by effective_deadline desc),'[]') from period_assignments),
    'topics',(select coalesce(jsonb_agg(row_to_json(x)),'[]') from (select topic,count(*) assigned,count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')) completed,count(*) filter(where result_status='reviewed') reviewed,count(*) filter(where result_status='awaiting_review') awaiting_review,count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()) overdue,coalesce(round(avg(percentage) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))),0) average,coalesce(max(percentage),0) best from period_assignments group by topic order by topic)x),
    'attempts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.assignment_id,'title',v.title,'attempt_number',a.attempt_number,'score',a.score,'maximum',a.maximum_score,'started_at',a.started_at,'submitted_at',a.submitted_at,'duration_seconds',a.duration_seconds) order by a.submitted_at desc),'[]') from public.attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.homework_versions v on v.id=ha.homework_version_id where a.student_id=p_student and v.teacher_id=auth.uid() and a.submitted_at>=cutoff)
  ) into result;
  return result;
end $$;
