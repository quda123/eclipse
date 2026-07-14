alter table public.submission_images add column if not exists crop jsonb not null default '{}'::jsonb;
alter table public.submission_images add column if not exists rotation int not null default 0 check(rotation%90=0);
alter table public.manual_submissions add column if not exists reviewed_at timestamptz;
alter table public.manual_submissions add column if not exists review_started_at timestamptz;

create or replace function public.begin_manual_submission(p_assignment uuid)
returns table(submission_id uuid,submission_version_id uuid,version int,path_prefix text)
language plpgsql security definer set search_path=public,storage as $$
declare a public.homework_assignments; v public.homework_versions; s public.manual_submissions; sv uuid; next_version int;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found or a.student_id<>auth.uid() then raise exception 'forbidden'; end if;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.mode not in ('manual','combined') then raise exception 'manual_part_not_allowed'; end if;
  select * into s from public.manual_submissions where assignment_id=a.id order by version desc limit 1 for update;
  if found and s.submitted_at is null then
    select id into sv from public.manual_submission_versions where submission_id=s.id and version=s.version;
    if sv is null then insert into public.manual_submission_versions(submission_id,version) values(s.id,s.version) returning id into sv; end if;
  elsif found and s.returned_at is null then raise exception 'already_submitted';
  else
    next_version:=coalesce(s.version,0)+1;
    insert into public.manual_submissions(assignment_id,student_id,version) values(a.id,auth.uid(),next_version) returning * into s;
    insert into public.manual_submission_versions(submission_id,version) values(s.id,next_version) returning id into sv;
  end if;
  return query select s.id,sv,s.version,v.organization_id::text||'/'||v.teacher_id::text||'/'||auth.uid()::text||'/'||a.id::text||'/'||sv::text;
end $$;

create or replace function public.begin_manual_review(p_submission uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into s from public.manual_submissions where id=p_submission and submitted_at is not null for update;
  if not found then raise exception 'not_submitted'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  update public.manual_submissions set review_started_at=coalesce(review_started_at,now()) where id=s.id and reviewed_at is null;
end $$;

create or replace function public.save_manual_review(p_submission uuid,p_scores jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; entry record; task_position int; points int;
begin
  if not public.is_active_user() or jsonb_typeof(p_scores)<>'object' then raise exception 'invalid_request'; end if;
  select * into s from public.manual_submissions where id=p_submission and submitted_at is not null and reviewed_at is null for update;
  if not found then raise exception 'not_reviewable'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  for entry in select * from jsonb_each_text(p_scores) loop
    select position into task_position from public.manual_tasks where id=entry.key::uuid and homework_version_id=v.id;
    points:=entry.value::int;
    if task_position is null or points not between 0 and 2 then raise exception 'invalid_score'; end if;
    insert into public.manual_task_scores(submission_id,task_number,points) values(s.id,task_position,points)
      on conflict(submission_id,task_number) do update set points=excluded.points;
  end loop;
  update public.manual_submissions set review_started_at=coalesce(review_started_at,now()) where id=s.id;
end $$;

create or replace function public.finalize_manual_submission(p_submission uuid,p_images jsonb)
returns uuid language plpgsql security definer set search_path=public,storage as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; sv uuid; item jsonb; pos int:=0;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  if jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0 or jsonb_array_length(p_images)>15 then raise exception 'invalid_images'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.student_id<>auth.uid() or s.submitted_at is not null then raise exception 'forbidden'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update;
  if now()>public.assignment_deadline(a.id) then raise exception 'deadline_expired'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id;
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
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
    values(v.teacher_id,'submission','Фото-решение ожидает проверки','/teacher/review/'||s.id,'submission:'||sv);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(v.organization_id,auth.uid(),'manual_submitted','manual_submission',s.id,jsonb_build_object('version',s.version,'images',jsonb_array_length(p_images)));
  return s.id;
end $$;

create or replace function public.grade_manual_submission(p_submission uuid,p_scores jsonb)
returns table(manual_score int,manual_maximum int,total_score int,total_maximum int,percentage int)
language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions; a public.homework_assignments; v public.homework_versions; task public.manual_tasks; points int; m_score int:=0; m_max int; auto_score int:=0; auto_max int:=0;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into s from public.manual_submissions where id=p_submission for update;
  if not found or s.submitted_at is null then raise exception 'not_submitted'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update;
  select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() then raise exception 'forbidden'; end if;
  for task in select * from public.manual_tasks where homework_version_id=v.id order by position loop
    points:=coalesce((p_scores->>task.id::text)::int,-1);
    if points not between 0 and 2 then raise exception 'invalid_score'; end if;
    insert into public.manual_task_scores(submission_id,task_number,points) values(s.id,task.position,points)
      on conflict(submission_id,task_number) do update set points=excluded.points;
    m_score:=m_score+points;
  end loop;
  select count(*)*2 into m_max from public.manual_tasks where homework_version_id=v.id;
  select coalesce(max(score),0),coalesce(max(maximum_score),0) into auto_score,auto_max from public.attempts where assignment_id=a.id;
  update public.manual_submissions set reviewed_at=now() where id=s.id;
  update public.homework_assignments set status='reviewed' where id=a.id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(s.student_id,'review','Письменная часть проверена','/student/homework/'||a.id||'/results','review:'||s.id)
    on conflict(user_id,dedupe_key) do update set title=excluded.title,read_at=null,created_at=now();
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(v.organization_id,auth.uid(),'manual_graded','manual_submission',s.id,jsonb_build_object('manual_score',m_score,'manual_maximum',m_max));
  return query select m_score,m_max,auto_score+m_score,auto_max+m_max,case when auto_max+m_max=0 then 0 else round(100.0*(auto_score+m_score)/(auto_max+m_max))::int end;
end $$;

revoke all on function public.begin_manual_submission(uuid) from public;
revoke all on function public.finalize_manual_submission(uuid,jsonb) from public;
revoke all on function public.grade_manual_submission(uuid,jsonb) from public;
revoke all on function public.begin_manual_review(uuid) from public;
revoke all on function public.save_manual_review(uuid,jsonb) from public;
grant execute on function public.begin_manual_submission(uuid),public.finalize_manual_submission(uuid,jsonb),public.grade_manual_submission(uuid,jsonb),public.begin_manual_review(uuid),public.save_manual_review(uuid,jsonb) to authenticated;

create or replace function public.return_manual_submission(p_submission uuid) returns void language plpgsql security definer set search_path=public as $$
declare s public.manual_submissions;a public.homework_assignments;v public.homework_versions;
begin
  select * into s from public.manual_submissions where id=p_submission and submitted_at is not null for update;if not found then raise exception 'not_found'; end if;
  select * into a from public.homework_assignments where id=s.assignment_id for update;select * into v from public.homework_versions where id=a.homework_version_id;
  if v.teacher_id<>auth.uid() or not public.is_active_user() then raise exception 'forbidden'; end if;
  update public.manual_submissions set returned_at=now() where id=s.id;update public.manual_submission_versions set returned_at=now() where submission_id=s.id and version=s.version;update public.homework_assignments set status='returned' where id=a.id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(s.student_id,'review','Решение возвращено на повторную сдачу','/student/homework/'||a.id||'/photos','submission-returned:'||s.id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(v.organization_id,auth.uid(),'manual_returned','manual_submission',s.id);
end $$;
revoke all on function public.return_manual_submission(uuid) from public;grant execute on function public.return_manual_submission(uuid) to authenticated;
