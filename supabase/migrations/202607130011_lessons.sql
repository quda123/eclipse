create or replace function public.create_lesson(p_student uuid,p_starts timestamptz,p_ends timestamptz,p_timezone text,p_zoom_url text default null,p_weekly boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare l public.teacher_student_links; series_id uuid; first_id uuid; occurrence timestamptz;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into l from public.teacher_student_links where teacher_id=auth.uid() and student_id=p_student;
  if not found then raise exception 'forbidden'; end if;
  if p_ends<=p_starts or p_starts<now()-interval '5 minutes' or p_ends-p_starts>interval '8 hours' then raise exception 'invalid_time'; end if;
  if coalesce(p_zoom_url,l.default_zoom_url) is not null and coalesce(p_zoom_url,l.default_zoom_url)!~'^https://[^[:space:]]+$' then raise exception 'invalid_zoom_url'; end if;
  if p_weekly then
    insert into public.lesson_series(organization_id,teacher_id,student_id,rrule,timezone,zoom_url) values(l.organization_id,auth.uid(),p_student,'FREQ=WEEKLY',left(p_timezone,80),coalesce(p_zoom_url,l.default_zoom_url)) returning id into series_id;
  end if;
  for occurrence in select p_starts+(n||' weeks')::interval from generate_series(0,case when p_weekly then 51 else 0 end)n loop
    insert into public.lessons(series_id,organization_id,teacher_id,student_id,starts_at,ends_at,timezone,zoom_url,original_occurrence)
      values(series_id,l.organization_id,auth.uid(),p_student,occurrence,occurrence+(p_ends-p_starts),left(p_timezone,80),coalesce(p_zoom_url,l.default_zoom_url),case when p_weekly then occurrence end) returning id into first_id;
  end loop;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(p_student,'lesson','Назначено занятие','/student/calendar','lesson:'||first_id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(l.organization_id,auth.uid(),'lesson_created','lesson',first_id,jsonb_build_object('weekly',p_weekly));
  return first_id;
end $$;

create or replace function public.update_lesson_occurrence(p_lesson uuid,p_starts timestamptz default null,p_ends timestamptz default null,p_status public.lesson_status default null,p_zoom_url text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.lessons;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into l from public.lessons where id=p_lesson and teacher_id=auth.uid() for update;if not found then raise exception 'forbidden'; end if;
  if p_starts is not null and (p_ends is null or p_ends<=p_starts) then raise exception 'invalid_time'; end if;
  if p_zoom_url is not null and p_zoom_url!~'^https://[^[:space:]]+$' then raise exception 'invalid_zoom_url'; end if;
  update public.lessons set starts_at=coalesce(p_starts,starts_at),ends_at=coalesce(p_ends,ends_at),status=coalesce(p_status,case when p_starts is not null then 'moved' else status end),zoom_url=coalesce(p_zoom_url,zoom_url) where id=p_lesson;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(l.student_id,'lesson',case when p_status='cancelled' then 'Занятие отменено' when p_starts is not null then 'Занятие перенесено' else 'Занятие изменено' end,'/student/calendar','lesson-update:'||p_lesson||':'||extract(epoch from now())::bigint);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(l.organization_id,auth.uid(),'lesson_updated','lesson',p_lesson,jsonb_build_object('status',p_status,'starts',p_starts));
end $$;

revoke all on function public.create_lesson(uuid,timestamptz,timestamptz,text,text,boolean),public.update_lesson_occurrence(uuid,timestamptz,timestamptz,public.lesson_status,text) from public;
grant execute on function public.create_lesson(uuid,timestamptz,timestamptz,text,text,boolean),public.update_lesson_occurrence(uuid,timestamptz,timestamptz,public.lesson_status,text) to authenticated;
