create or replace function public.extend_assignment_deadline(p_assignment uuid,p_until timestamptz,p_reason text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.homework_assignments; v public.homework_versions; extension_id uuid;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  select * into a from public.homework_assignments where id=p_assignment for update;
  if not found or not public.is_linked_teacher(a.student_id) then raise exception 'forbidden'; end if;
  select * into v from public.homework_versions where id=a.homework_version_id and teacher_id=auth.uid();if not found then raise exception 'forbidden'; end if;
  if p_until<=public.assignment_deadline(a.id) then raise exception 'extension_must_be_later'; end if;
  insert into public.assignment_deadline_extensions(assignment_id,extended_until,reason,created_by) values(a.id,p_until,left(p_reason,500),auth.uid()) returning id into extension_id;
  update public.homework_assignments set status=case when status='overdue' then 'not_started' else status end where id=a.id;
  insert into public.notifications(user_id,kind,title,href,dedupe_key) values(a.student_id,'deadline','Срок задания продлён','/student/homework/'||a.id,'extension:'||extension_id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v.organization_id,auth.uid(),'deadline_extended','assignment',a.id,jsonb_build_object('until',p_until,'reason',left(p_reason,500)));
  return extension_id;
end $$;
revoke all on function public.extend_assignment_deadline(uuid,timestamptz,text) from public;
grant execute on function public.extend_assignment_deadline(uuid,timestamptz,text) to authenticated;
