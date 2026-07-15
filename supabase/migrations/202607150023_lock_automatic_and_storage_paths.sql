-- Permanently lock the automatic part after the first manual submission and
-- bind every stored image derivative to the same server-owned path prefix.

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
  if exists(select 1 from public.manual_submissions m where m.assignment_id=a.id and m.submitted_at is not null) then raise exception 'manual_part_already_submitted'; end if;
  if a.status='reviewed' then raise exception 'assignment_already_reviewed'; end if;
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
  if exists(select 1 from public.manual_submissions m where m.assignment_id=a.id and m.submitted_at is not null) then raise exception 'manual_part_already_submitted'; end if;
  if a.status='reviewed' then raise exception 'assignment_already_reviewed'; end if;
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

create or replace function public.finalize_manual_submission(p_submission uuid,p_images jsonb)
returns uuid language plpgsql security definer set search_path=public,storage as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; sv uuid; item jsonb; pos int:=0; expected_prefix text;
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
  expected_prefix:=v.organization_id::text||'/'||v.teacher_id::text||'/'||auth.uid()::text||'/'||a.id::text||'/'||sv::text||'/';
  for item in select value from jsonb_array_elements(p_images) loop
    pos:=pos+1;
    if coalesce(item->>'original_path','') not like expected_prefix||'%'
      or coalesce(item->>'processed_path','') not like expected_prefix||'%'
      or coalesce(item->>'thumbnail_path','') not like expected_prefix||'%' then raise exception 'invalid_path'; end if;
    if not exists(select 1 from storage.objects where bucket_id='homework-originals' and name=item->>'original_path')
      or not exists(select 1 from storage.objects where bucket_id='homework-processed' and name=item->>'processed_path')
      or not exists(select 1 from storage.objects where bucket_id='homework-thumbnails' and name=item->>'thumbnail_path') then raise exception 'upload_incomplete'; end if;
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
