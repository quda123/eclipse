create or replace function public.generate_scheduled_notifications(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path=public as $$
declare changed int:=0; rows_changed int;
begin
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
  select a.student_id,'deadline',case when public.assignment_deadline(a.id)::date=p_now::date then 'Срок задания сегодня' else 'Срок задания завтра' end,'/student/homework/'||a.id,'deadline:'||a.id||':'||public.assignment_deadline(a.id)::date
  from public.homework_assignments a where a.status not in ('submitted','reviewed') and public.assignment_deadline(a.id)::date in (p_now::date,(p_now+interval '1 day')::date)
  on conflict(user_id,dedupe_key) do nothing;get diagnostics rows_changed=row_count;changed:=changed+rows_changed;
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
  select l.student_id,'lesson','Занятие скоро начнётся','/student/calendar','lesson-soon:'||l.id
  from public.lessons l where l.status in ('scheduled','moved') and l.starts_at>p_now and l.starts_at<=p_now+interval '1 hour'
  on conflict(user_id,dedupe_key) do nothing;get diagnostics rows_changed=row_count;changed:=changed+rows_changed;
  insert into public.notifications(user_id,kind,title,href,dedupe_key)
  select l.teacher_id,'lesson','Занятие скоро начнётся','/teacher/calendar','lesson-soon:'||l.id
  from public.lessons l where l.status in ('scheduled','moved') and l.starts_at>p_now and l.starts_at<=p_now+interval '1 hour'
  on conflict(user_id,dedupe_key) do nothing;get diagnostics rows_changed=row_count;return changed+rows_changed;
end $$;
revoke all on function public.generate_scheduled_notifications(timestamptz) from public;
grant execute on function public.generate_scheduled_notifications(timestamptz) to service_role;
