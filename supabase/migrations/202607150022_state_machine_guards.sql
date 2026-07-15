-- Enforce homework-part order, latest-submission review and active-user reads.

create or replace function public.recalculate_assignment_result(p_assignment uuid)
returns public.assignment_results language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; v public.homework_versions; best public.attempts; latest public.manual_submissions;
  auto_max int; manual_max int; manual_score int:=0; state public.assignment_result_status; result public.assignment_results;
begin
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found then raise exception 'assignment_not_found'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  select * into best from public.attempts where assignment_id=a.id order by score desc,submitted_at asc,id asc limit 1;
  select * into latest from public.manual_submissions where assignment_id=a.id order by version desc limit 1;
  select count(*) into auto_max from public.homework_questions where homework_version_id=v.id;
  select coalesce(sum(max_points),0) into manual_max from public.manual_tasks where homework_version_id=v.id;
  if latest.reviewed_at is not null then
    select coalesce(sum(points),0) into manual_score from public.manual_task_scores where submission_id=latest.id;
  end if;
  state:=case
    when latest.returned_at is not null then 'returned'
    when latest.reviewed_at is not null then 'reviewed'
    when latest.submitted_at is not null then 'awaiting_review'
    when v.mode='automatic' and best.id is not null then 'automatic_complete'
    when v.mode='combined' and best.id is not null then 'manual_pending'
    when v.mode='manual' then 'manual_pending'
    else 'automatic_pending' end;
  insert into public.assignment_results(assignment_id,student_id,homework_version_id,best_attempt_id,reviewed_submission_id,
    automatic_score,automatic_maximum,manual_score,manual_maximum,total_score,total_maximum,percentage,result_status,calculated_at,updated_at)
  values(a.id,a.student_id,v.id,best.id,case when latest.reviewed_at is not null then latest.id end,
    coalesce(best.score,0),auto_max,manual_score,manual_max,coalesce(best.score,0)+manual_score,auto_max+manual_max,
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
declare a public.homework_assignments; v public.homework_versions; allowed int; used int;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into a from public.homework_assignments where id=p_assignment and student_id=auth.uid() for update;
  if not found then raise exception 'forbidden'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.mode='manual' then raise exception 'automatic_part_not_allowed'; end if;
  if a.status='reviewed' then raise exception 'assignment_already_reviewed'; end if;
  if a.status='awaiting_review' then raise exception 'manual_part_already_submitted'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  allowed:=v.attempts_allowed;
  select count(*) into used from public.attempts where attempts.assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  insert into public.attempt_drafts(assignment_id,student_id,answers,started_at) values(a.id,auth.uid(),'{}',now())
    on conflict on constraint attempt_drafts_assignment_id_student_id_key do nothing;
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
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.mode='manual' then raise exception 'automatic_part_not_allowed'; end if;
  if a.status='reviewed' then raise exception 'assignment_already_reviewed'; end if;
  if a.status='awaiting_review' then raise exception 'manual_part_already_submitted'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  allowed:=v.attempts_allowed;
  select count(*) into maximum from public.homework_questions where homework_version_id=v.id;
  select count(*) into used from public.attempts where assignment_id=a.id;
  if used>=allowed then raise exception 'attempts_exhausted'; end if;
  select d.started_at into started from public.attempt_drafts d where d.assignment_id=a.id and d.student_id=auth.uid();
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

create or replace function public.begin_manual_submission(p_assignment uuid)
returns table(submission_id uuid,submission_version_id uuid,version int,path_prefix text)
language plpgsql security definer set search_path=public,storage as $$
declare a public.homework_assignments; v public.homework_versions; s public.manual_submissions; sv uuid; next_version int;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found or a.student_id<>auth.uid() then raise exception 'forbidden'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.mode='automatic' then raise exception 'manual_part_not_allowed'; end if;
  if v.mode='combined' and not exists(select 1 from public.attempts where assignment_id=a.id) then raise exception 'automatic_part_required'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select * into s from public.manual_submissions where assignment_id=a.id order by version desc limit 1 for update;
  if found and s.reviewed_at is not null then raise exception 'assignment_already_reviewed';
  elsif found and s.submitted_at is null then
    select id into sv from public.manual_submission_versions where submission_id=s.id and version=s.version;
    if sv is null then insert into public.manual_submission_versions(submission_id,version) values(s.id,s.version) returning id into sv; end if;
  elsif found and s.returned_at is null then raise exception 'manual_part_already_submitted';
  else
    next_version:=coalesce(s.version,0)+1;
    insert into public.manual_submissions(assignment_id,student_id,version) values(a.id,auth.uid(),next_version) returning * into s;
    insert into public.manual_submission_versions(submission_id,version) values(s.id,next_version) returning id into sv;
  end if;
  return query select s.id,sv,s.version,v.organization_id::text||'/'||v.teacher_id::text||'/'||auth.uid()::text||'/'||a.id::text||'/'||sv::text;
end $$;

create or replace function public.finalize_manual_submission(p_submission uuid,p_images jsonb)
returns uuid language plpgsql security definer set search_path=public,storage as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; sv uuid; item jsonb; pos int:=0;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  if jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0 or jsonb_array_length(p_images)>15 then raise exception 'invalid_images'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.student_id<>auth.uid() or s.submitted_at is not null then raise exception 'forbidden'; end if;
  if exists(select 1 from public.manual_submissions newer where newer.assignment_id=s.assignment_id and newer.version>s.version) then raise exception 'historical_submission'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.mode='automatic' then raise exception 'manual_part_not_allowed'; end if;
  if v.mode='combined' and not exists(select 1 from public.attempts where assignment_id=a.id) then raise exception 'automatic_part_required'; end if;
  if a.status='reviewed' then raise exception 'assignment_already_reviewed'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select id into sv from public.manual_submission_versions where submission_id=s.id and version=s.version;
  for item in select value from jsonb_array_elements(p_images) loop
    pos:=pos+1;
    if not exists(select 1 from storage.objects where bucket_id='homework-originals' and name=item->>'original_path')
      or not exists(select 1 from storage.objects where bucket_id='homework-processed' and name=item->>'processed_path')
      or not exists(select 1 from storage.objects where bucket_id='homework-thumbnails' and name=item->>'thumbnail_path') then raise exception 'upload_incomplete'; end if;
    if split_part(item->>'original_path','/',3)<>auth.uid()::text or split_part(item->>'original_path','/',5)<>sv::text then raise exception 'invalid_path'; end if;
    insert into public.submission_images(submission_id,position,original_path,processed_path,thumbnail_path,original_name,mime_type,size_bytes,width,height,crop,rotation)
      values(s.id,pos,item->>'original_path',item->>'processed_path',item->>'thumbnail_path',left(item->>'original_name',255),item->>'mime_type',(item->>'size_bytes')::bigint,(item->>'width')::int,(item->>'height')::int,coalesce(item->'crop','{}'),coalesce((item->>'rotation')::int,0));
  end loop;
  update public.manual_submissions set submitted_at=now(),returned_at=null where id=s.id;
  update public.manual_submission_versions set submitted_at=now() where id=sv;
  update public.homework_assignments set status='awaiting_review' where id=a.id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(v.teacher_id,'submission','Фото-решение ожидает проверки','/teacher/review/'||s.id,'submission:'||sv);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v.organization_id,auth.uid(),'manual_submitted','manual_submission',s.id,jsonb_build_object('version',s.version,'images',jsonb_array_length(p_images)));
  return s.id;
end $$;

create or replace function public.begin_manual_review(p_submission uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null or s.returned_at is not null or s.reviewed_at is not null then raise exception 'not_reviewable'; end if;
  if exists(select 1 from public.manual_submissions newer where newer.assignment_id=s.assignment_id and newer.version>s.version) then raise exception 'historical_submission'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  update public.manual_submissions set review_started_at=coalesce(review_started_at,now()) where id=s.id;
end $$;

create or replace function public.save_manual_review(p_submission uuid,p_scores jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; entry record; task public.manual_tasks; points int;
begin
  if not public.is_active_user() or jsonb_typeof(p_scores)<>'object' then raise exception 'invalid_request'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null or s.returned_at is not null or s.reviewed_at is not null then raise exception 'not_reviewable'; end if;
  if exists(select 1 from public.manual_submissions newer where newer.assignment_id=s.assignment_id and newer.version>s.version) then raise exception 'historical_submission'; end if;
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
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; task public.manual_tasks; points int; official public.assignment_results;
begin
  if not public.is_active_user() or jsonb_typeof(p_scores)<>'object' then raise exception 'invalid_request'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null or s.returned_at is not null or s.reviewed_at is not null then raise exception 'not_reviewable'; end if;
  if exists(select 1 from public.manual_submissions newer where newer.assignment_id=s.assignment_id and newer.version>s.version) then raise exception 'historical_submission'; end if;
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

create or replace function public.return_manual_submission(p_submission uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null or s.returned_at is not null or s.reviewed_at is not null then raise exception 'not_returnable'; end if;
  if exists(select 1 from public.manual_submissions newer where newer.assignment_id=s.assignment_id and newer.version>s.version) then raise exception 'historical_submission'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update; select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  update public.manual_submissions set returned_at=now() where id=s.id;
  update public.manual_submission_versions set returned_at=now() where submission_id=s.id and version=s.version;
  update public.homework_assignments set status='returned' where id=a.id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(s.student_id,'review','Решение возвращено на повторную сдачу','/student/homework/'||a.id||'/photos','submission-returned:'||s.id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(v.organization_id,auth.uid(),'manual_returned','manual_submission',s.id);
end $$;

create or replace function public.manual_review_queue()
returns table(id uuid,student_first_name text,student_last_name text,homework_title text,topic text,submitted_at timestamptz,effective_deadline timestamptz,image_count bigint)
language sql stable security definer set search_path=public as $$
  select ms.id,p.first_name,p.last_name,v.title,coalesce(t.name,'Без темы'),ms.submitted_at,public.assignment_deadline(a.id),count(si.id)
  from public.manual_submissions ms join public.homework_assignments a on a.id=ms.assignment_id
  join public.homework_versions v on v.id=a.homework_version_id join public.profiles p on p.id=ms.student_id
  left join public.topics t on t.id=v.topic_id left join public.submission_images si on si.submission_id=ms.id
  where public.is_active_user() and v.teacher_id=auth.uid() and ms.submitted_at is not null and ms.returned_at is null and ms.reviewed_at is null
    and not exists(select 1 from public.manual_submissions newer where newer.assignment_id=ms.assignment_id and newer.version>ms.version)
  group by ms.id,p.first_name,p.last_name,v.title,t.name,a.id,ms.submitted_at order by ms.submitted_at desc
$$;
revoke all on function public.manual_review_queue() from public;
grant execute on function public.manual_review_queue() to authenticated;

create or replace function public.get_assignment_result(p_assignment uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('assignment_id',r.assignment_id,'title',v.title,'mode',v.mode,'status',r.result_status,
    'automatic_score',r.automatic_score,'automatic_maximum',r.automatic_maximum,'manual_score',r.manual_score,
    'manual_maximum',r.manual_maximum,'total_score',r.total_score,'total_maximum',r.total_maximum,'percentage',r.percentage,
    'best_attempt_id',r.best_attempt_id,'reviewed_submission_id',r.reviewed_submission_id,
    'attempts_used',(select count(*) from public.attempts x where x.assignment_id=r.assignment_id),
    'attempts_allowed',v.attempts_allowed,'updated_at',r.updated_at)
  from public.assignment_results r join public.homework_versions v on v.id=r.homework_version_id
  where public.is_active_user() and r.assignment_id=p_assignment and (r.student_id=auth.uid() or (v.teacher_id=auth.uid() and public.is_linked_teacher(r.student_id)))
$$;

create or replace function public.get_attempt_result(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select jsonb_build_object('id',a.id,'assignment_id',a.assignment_id,'score',a.score,'maximum_score',a.maximum_score,'attempt_number',a.attempt_number,
    'submitted_at',a.submitted_at,'started_at',a.started_at,'duration_seconds',a.duration_seconds,'attempts_allowed',v.attempts_allowed,
    'attempts_used',(select count(*) from public.attempts x where x.assignment_id=a.assignment_id),'best_score',(select max(x.score) from public.attempts x where x.assignment_id=a.assignment_id),
    'questions',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'position',q.position,'answer',aa.value,'is_correct',aa.is_correct,
      'accepted_answers',(select jsonb_agg(ans.value) from public.question_accepted_answers ans where ans.question_id=q.id)) order by q.position),'[]')
      from public.attempt_answers aa join public.homework_questions q on q.id=aa.question_id where aa.attempt_id=a.id)) into result
  from public.attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.homework_versions v on v.id=ha.homework_version_id
  where a.id=p_attempt and (a.student_id=auth.uid() or (v.teacher_id=auth.uid() and public.is_linked_teacher(a.student_id)));
  if result is null then raise exception 'not_found'; end if;
  return result;
end $$;

-- Archived JWTs must not read aggregate data through SECURITY DEFINER functions.
create or replace function public.student_dashboard() returns jsonb
language sql stable security definer set search_path=public as $$
  with own as (select a.*,v.title,v.mode,coalesce(t.name,'Математика') topic,public.assignment_deadline(a.id) effective_deadline from public.homework_assignments a
    join public.homework_versions v on v.id=a.homework_version_id left join public.topics t on t.id=v.topic_id where a.student_id=auth.uid()),
  official as (select r.* from public.assignment_results r join public.homework_versions v on v.id=r.homework_version_id where r.student_id=auth.uid() and (r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete')))
  select jsonb_build_object('nextLesson',(select jsonb_build_object('id',l.id,'seriesId',l.series_id,'startsAt',l.starts_at,'endsAt',l.ends_at,'studentName','','status',l.status,'zoomUrl',l.zoom_url) from public.lessons l where l.student_id=auth.uid() and l.starts_at>=now() and l.status<>'cancelled' order by l.starts_at limit 1),
    'nextAssignment',(select jsonb_build_object('id',a.id,'homeworkId','','title',a.title,'topic',a.topic,'deadline',to_char(a.effective_deadline at time zone a.timezone,'DD.MM.YYYY HH24:MI'),'deadlineAt',a.effective_deadline,'status',a.status,'mode',a.mode) from own a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed') order by a.effective_deadline limit 1),
    'activeCount',(select count(*) from own a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed')),'overdueCount',(select count(*) from own a where a.effective_deadline<now() and a.status not in ('submitted','reviewed')),
    'average',coalesce((select round(avg(percentage)) from official),0),'completionRate',coalesce((select round(100.0*count(*) filter(where status in ('submitted','reviewed'))/nullif(count(*),0)) from own),0),
    'recentResults',(select coalesce(jsonb_agg(jsonb_build_object('id',assignment_id,'score',total_score,'maximum',total_maximum,'submittedAt',updated_at) order by updated_at desc),'[]') from (select * from official order by updated_at desc limit 5)x),
    'unreadNotificationCount',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null)) where public.is_active_user()
$$;

create or replace function public.teacher_dashboard() returns jsonb
language sql stable security definer set search_path=public as $$
  with linked as (select student_id from public.teacher_student_links where teacher_id=auth.uid()), assigned as (
    select a.*,v.title,public.assignment_deadline(a.id) effective_deadline from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.teacher_id=auth.uid())
  select jsonb_build_object('teacherName',(select first_name from public.profiles where id=auth.uid()),'awaitingReviewCount',(select count(*) from assigned where status='awaiting_review'),
    'overdueCount',(select count(*) from assigned where effective_deadline<now() and status not in ('submitted','reviewed')),'deadlineTodayCount',(select count(*) from assigned where effective_deadline::date=current_date),
    'deadlineTomorrowCount',(select count(*) from assigned where effective_deadline::date=current_date+1),'lessonsTodayCount',(select count(*) from public.lessons where teacher_id=auth.uid() and starts_at::date=current_date),
    'newAutomaticResultsCount',(select count(*) from public.notifications where user_id=auth.uid() and kind='result' and read_at is null),'newPhotoSubmissionsCount',(select count(*) from public.notifications where user_id=auth.uid() and kind='submission' and read_at is null),
    'studentsWithoutFutureLessonCount',(select count(*) from linked x where not exists(select 1 from public.lessons l where l.teacher_id=auth.uid() and l.student_id=x.student_id and l.starts_at>now() and l.status in ('scheduled','moved'))),
    'attentionItems',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'href',href) order by created_at desc),'[]') from (select id,title,href,created_at from public.notifications where user_id=auth.uid() and read_at is null order by created_at desc limit 5)n))
  where public.is_active_user() and exists(select 1 from public.organization_members where user_id=auth.uid() and organization_id=public.active_organization() and role in ('owner','teacher'))
$$;

create or replace function public.teacher_student_analytics(p_student uuid,p_days int default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; cutoff timestamptz:=case when p_days is null then '-infinity'::timestamptz else now()-(p_days||' days')::interval end;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  if p_days is not null and p_days not in (7,30) then raise exception 'invalid_period'; end if;
  if not public.is_linked_teacher(p_student) then raise exception 'forbidden'; end if;
  with scoped as (select a.*,v.title,v.mode,coalesce(t.name,'Без темы') topic,public.assignment_deadline(a.id) effective_deadline,r.*,coalesce(r.updated_at,public.assignment_deadline(a.id)) metric_at
    from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id left join public.topics t on t.id=v.topic_id left join public.assignment_results r on r.assignment_id=a.id where a.student_id=p_student),
  period_assignments as (select * from scoped where metric_at>=cutoff)
  select jsonb_build_object('summary',(select jsonb_build_object('assigned',count(*),'completed',count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')),
    'overdue',count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()),'awaiting_review',count(*) filter(where result_status='awaiting_review'),'reviewed',count(*) filter(where result_status='reviewed'),
    'completion_rate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))/count(*)) end) from period_assignments),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('assignment_id',id,'title',title,'topic',topic,'mode',mode,'deadline',deadline_at,'effective_deadline',effective_deadline,'status',status,
      'attempts_used',(select count(*) from public.attempts x where x.assignment_id=period_assignments.id),'best_score',automatic_score,'automatic_maximum',automatic_maximum,'submitted_at',updated_at) order by effective_deadline desc),'[]') from period_assignments),
    'topics',(select coalesce(jsonb_agg(row_to_json(x)),'[]') from (select topic,count(*) assigned,count(*) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')) completed,
      count(*) filter(where result_status='reviewed') reviewed,count(*) filter(where result_status='awaiting_review') awaiting_review,count(*) filter(where status not in ('submitted','reviewed') and effective_deadline<now()) overdue,
      sum((select count(*) from public.attempts z where z.assignment_id=p.id))::int attempts,coalesce(round(avg(percentage) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete'))),0) average,
      coalesce(max(percentage) filter(where result_status='reviewed' or (mode='automatic' and result_status='automatic_complete')),0) best from period_assignments p group by topic order by topic)x),
    'attempts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.assignment_id,'title',v.title,'attempt_number',a.attempt_number,'score',a.score,'maximum',a.maximum_score,'started_at',a.started_at,'submitted_at',a.submitted_at,'duration_seconds',a.duration_seconds) order by a.submitted_at desc),'[]')
      from public.attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.homework_versions v on v.id=ha.homework_version_id where a.student_id=p_student and a.submitted_at>=cutoff)) into result;
  return result;
end $$;

-- One active-organization implementation; v2 is now only the compatibility entry point.
create or replace function public.create_homework(
  p_title text,p_mode public.homework_mode,p_deadline timestamptz,p_attempts int,p_student_ids uuid[],p_questions jsonb default '[]',p_manual_tasks jsonb default '[]',
  p_instructions text default '',p_timezone text default 'Europe/Moscow',p_homework uuid default null,p_subject uuid default null,p_topic uuid default null,p_individual_deadlines jsonb default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_homework uuid;v_version uuid;v_question uuid;item jsonb;answer text;v_position int:=0;v_version_number int:=1;maximum int;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  v_org:=public.active_organization();
  if not exists(select 1 from public.organization_members where user_id=auth.uid() and organization_id=v_org and role in ('owner','teacher')) then raise exception 'forbidden'; end if;
  if length(btrim(p_title)) not between 1 and 160 or length(p_instructions)>10000 then raise exception 'invalid_homework'; end if;
  if p_attempts not between 1 and 20 or p_deadline<=now() then raise exception 'invalid_settings'; end if;
  if cardinality(p_student_ids)=0 or exists(select 1 from unnest(p_student_ids) s where not exists(select 1 from public.teacher_student_links l where l.teacher_id=auth.uid() and l.student_id=s and l.organization_id=v_org)) then raise exception 'invalid_students'; end if;
  if jsonb_typeof(p_individual_deadlines)<>'object' or exists(select 1 from jsonb_each_text(p_individual_deadlines) d where not (d.key::uuid=any(p_student_ids)) or d.value::timestamptz<=now()) then raise exception 'invalid_individual_deadlines'; end if;
  if p_mode<>'manual' and (jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)=0) then raise exception 'questions_required'; end if;
  if p_mode<>'automatic' and (jsonb_typeof(p_manual_tasks)<>'array' or jsonb_array_length(p_manual_tasks)=0) then raise exception 'manual_tasks_required'; end if;
  if p_subject is not null and not exists(select 1 from public.subjects where id=p_subject and organization_id=v_org) then raise exception 'invalid_subject'; end if;
  if p_topic is not null and not exists(select 1 from public.topics t join public.subjects s on s.id=t.subject_id where t.id=p_topic and s.organization_id=v_org and (p_subject is null or s.id=p_subject)) then raise exception 'invalid_topic'; end if;
  if p_homework is null then insert into public.homeworks(organization_id,teacher_id,title) values(v_org,auth.uid(),btrim(p_title)) returning id into v_homework;
  else
    select id into v_homework from public.homeworks where id=p_homework and teacher_id=auth.uid() and organization_id=v_org and archived_at is null;
    if not found then raise exception 'homework_not_found'; end if;
    select coalesce(max(version),0)+1 into v_version_number from public.homework_versions where homework_id=v_homework;
    update public.homeworks set title=btrim(p_title) where id=v_homework;
  end if;
  insert into public.homework_versions(organization_id,teacher_id,homework_id,title,instructions,mode,attempts_allowed,version,subject_id,topic_id)
    values(v_org,auth.uid(),v_homework,btrim(p_title),p_instructions,p_mode,p_attempts,v_version_number,p_subject,p_topic) returning id into v_version;
  for item in select value from jsonb_array_elements(p_questions) loop
    v_position:=v_position+1;
    if length(btrim(coalesce(item->>'prompt',''))) not between 1 and 2000 then raise exception 'invalid_question'; end if;
    insert into public.homework_questions(homework_version_id,position,prompt) values(v_version,v_position,btrim(item->>'prompt')) returning id into v_question;
    for answer in select value #>> '{}' from jsonb_array_elements(coalesce(item->'answers','[]')) loop
      if length(btrim(answer)) between 1 and 500 then insert into public.question_accepted_answers(question_id,value) values(v_question,btrim(answer)); end if;
    end loop;
    if p_mode<>'manual' and not exists(select 1 from public.question_accepted_answers where question_id=v_question) then raise exception 'answer_required'; end if;
  end loop;
  v_position:=0;
  for item in select value from jsonb_array_elements(p_manual_tasks) loop
    v_position:=v_position+1; maximum:=coalesce((item->>'max_points')::int,2);
    if length(btrim(coalesce(item->>'prompt',''))) not between 1 and 2000 then raise exception 'invalid_manual_task'; end if;
    if maximum not between 1 and 20 then raise exception 'invalid_manual_maximum'; end if;
    insert into public.manual_tasks(homework_version_id,position,prompt,max_points) values(v_version,v_position,btrim(item->>'prompt'),maximum);
  end loop;
  update public.homework_versions set published_at=now() where id=v_version;
  insert into public.homework_assignments(homework_version_id,student_id,deadline_at,timezone)
    select v_version,s,coalesce((p_individual_deadlines->>s::text)::timestamptz,p_deadline),left(coalesce(nullif(p_timezone,''),'Europe/Moscow'),80) from unnest(p_student_ids) s;
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
    select s,'homework','Новое задание: '||btrim(p_title),'/student/homework/'||a.id,'assignment:'||a.id from unnest(p_student_ids) s join public.homework_assignments a on a.homework_version_id=v_version and a.student_id=s;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_org,auth.uid(),'homework_published','homework',v_homework,jsonb_build_object('assignments',cardinality(p_student_ids)));
  perform public.recalculate_assignment_result(a.id) from public.homework_assignments a where a.homework_version_id=v_version;
  return v_homework;
end $$;

create or replace function public.create_homework_v2(
  p_title text,p_mode public.homework_mode,p_deadline timestamptz,p_attempts int,p_student_ids uuid[],p_questions jsonb default '[]',p_manual_tasks jsonb default '[]',
  p_instructions text default '',p_timezone text default 'Europe/Moscow',p_homework uuid default null,p_subject uuid default null,p_topic uuid default null,p_individual_deadlines jsonb default '{}')
returns uuid language sql security definer set search_path=public as $$
  select public.create_homework(p_title,p_mode,p_deadline,p_attempts,p_student_ids,p_questions,p_manual_tasks,p_instructions,p_timezone,p_homework,p_subject,p_topic,p_individual_deadlines)
$$;

revoke all on function public.recalculate_assignment_result(uuid),public.create_homework(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_homework(text,public.homework_mode,timestamptz,int,uuid[],jsonb,jsonb,text,text,uuid,uuid,uuid,jsonb) to authenticated;
