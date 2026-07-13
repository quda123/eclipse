alter table public.organizations enable row level security;
create policy "members read organization" on public.organizations for select using(exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid()));
create policy "owners manage organization" on public.organizations for update using(exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid() and m.role='owner'));
create policy "users update own profile" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create function public.is_org_owner(org uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid() and role='owner') $$;
create policy "owners manage memberships" on public.organization_members for all using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
create policy "teachers manage links" on public.teacher_student_links for all using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());

create policy "lesson participants read series" on public.lesson_series for select using(student_id=auth.uid() or teacher_id=auth.uid());
create policy "teachers manage series" on public.lesson_series for all using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
create policy "teachers manage lessons" on public.lessons for all using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
create policy "students create submissions" on public.manual_submissions for insert with check(student_id=auth.uid() and exists(select 1 from public.homework_assignments a where a.id=assignment_id and a.student_id=auth.uid() and now()<=public.assignment_deadline(a.id)));
create policy "participants read submission versions" on public.manual_submission_versions for select using(exists(select 1 from public.manual_submissions s where s.id=submission_id and (s.student_id=auth.uid() or public.is_linked_teacher(s.student_id))));
create policy "participants read submission images" on public.submission_images for select using(exists(select 1 from public.manual_submissions s where s.id=submission_id and (s.student_id=auth.uid() or public.is_linked_teacher(s.student_id))));
create policy "students manage draft images" on public.submission_images for all using(exists(select 1 from public.manual_submissions s where s.id=submission_id and s.student_id=auth.uid() and s.submitted_at is null)) with check(exists(select 1 from public.manual_submissions s where s.id=submission_id and s.student_id=auth.uid() and s.submitted_at is null));
create policy "participants read manual scores" on public.manual_task_scores for select using(exists(select 1 from public.manual_submissions s where s.id=submission_id and (s.student_id=auth.uid() or public.is_linked_teacher(s.student_id))));
create policy "teachers grade manual scores" on public.manual_task_scores for all using(exists(select 1 from public.manual_submissions s where s.id=submission_id and public.is_linked_teacher(s.student_id))) with check(exists(select 1 from public.manual_submissions s where s.id=submission_id and public.is_linked_teacher(s.student_id)));
create policy "org teachers read audit" on public.audit_logs for select using(public.is_org_teacher(organization_id));

create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger drafts_touch before update on public.attempt_drafts for each row execute function public.touch_updated_at();

create function public.mark_all_notifications_read() returns int language plpgsql security definer set search_path=public as $$
declare changed int; begin update public.notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and read_at is null; get diagnostics changed=row_count; return changed; end $$;
