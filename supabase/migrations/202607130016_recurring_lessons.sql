create or replace function public.update_lesson_series(p_lesson uuid,p_scope text,p_starts timestamptz,p_ends timestamptz)
returns int language plpgsql security definer set search_path=public as $$
declare source public.lessons; changed int; delta interval;
begin
  if p_scope not in ('following','series') or not public.is_active_user() then raise exception 'invalid_request'; end if;
  select * into source from public.lessons where id=p_lesson and teacher_id=auth.uid() for update;if not found or source.series_id is null then raise exception 'not_recurring'; end if;
  if p_ends<=p_starts then raise exception 'invalid_time'; end if;delta:=p_starts-source.starts_at;
  update public.lessons set starts_at=starts_at+delta,ends_at=starts_at+delta+(p_ends-p_starts),status=case when delta<>interval '0' then 'moved' else status end
    where series_id=source.series_id and teacher_id=auth.uid() and (p_scope='series' or starts_at>=source.starts_at);
  get diagnostics changed=row_count;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(source.organization_id,auth.uid(),'lesson_series_updated','lesson_series',source.series_id,jsonb_build_object('scope',p_scope,'count',changed));
  return changed;
end $$;
revoke all on function public.update_lesson_series(uuid,text,timestamptz,timestamptz) from public;
grant execute on function public.update_lesson_series(uuid,text,timestamptz,timestamptz) to authenticated;
