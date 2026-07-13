create policy "members read subjects" on public.subjects for select using (
  exists(select 1 from public.organization_members m where m.organization_id=subjects.organization_id and m.user_id=auth.uid())
);
create policy "members read topics" on public.topics for select using (
  exists(select 1 from public.subjects s join public.organization_members m on m.organization_id=s.organization_id where s.id=topics.subject_id and m.user_id=auth.uid())
);
create policy "students read assigned versions" on public.homework_versions for select using (
  exists(select 1 from public.homework_assignments a where a.homework_version_id=homework_versions.id and a.student_id=auth.uid())
);
create policy "students read assigned questions" on public.homework_questions for select using (
  exists(select 1 from public.homework_assignments a where a.homework_version_id=homework_questions.homework_version_id and a.student_id=auth.uid())
);
create policy "teachers manage questions" on public.homework_questions for all using (
  exists(select 1 from public.homework_versions v where v.id=homework_questions.homework_version_id and public.is_org_teacher(v.organization_id))
) with check (
  exists(select 1 from public.homework_versions v where v.id=homework_questions.homework_version_id and public.is_org_teacher(v.organization_id))
);
create policy "teachers manage accepted answers" on public.question_accepted_answers for all using (
  exists(select 1 from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where q.id=question_accepted_answers.question_id and public.is_org_teacher(v.organization_id))
) with check (
  exists(select 1 from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where q.id=question_accepted_answers.question_id and public.is_org_teacher(v.organization_id))
);
create policy "teachers read linked attempts" on public.attempts for select using(public.is_linked_teacher(student_id));
create policy "students update own submissions" on public.manual_submissions for update using(student_id=auth.uid()) with check(student_id=auth.uid());
