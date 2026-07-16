create or replace function public.get_attempt_result(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',a.id,'assignment_id',a.assignment_id,'score',a.score,'maximum_score',a.maximum_score,'attempt_number',a.attempt_number,
    'submitted_at',a.submitted_at,'started_at',a.started_at,'duration_seconds',a.duration_seconds,
    'attempts_allowed',v.attempts_allowed,'attempts_used',(select count(*) from public.attempts x where x.assignment_id=a.assignment_id),
    'best_score',(select max(x.score) from public.attempts x where x.assignment_id=a.assignment_id),
    'questions',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'position',q.position,'answer',aa.value,'is_correct',aa.is_correct,'accepted_answers',(select jsonb_agg(ans.value) from public.question_accepted_answers ans where ans.question_id=q.id)) order by q.position),'[]'::jsonb) from public.attempt_answers aa join public.homework_questions q on q.id=aa.question_id where aa.attempt_id=a.id)
  ) into result
  from public.attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.homework_versions v on v.id=ha.homework_version_id
  where a.id=p_attempt and (a.student_id=auth.uid() or (v.teacher_id=auth.uid() and public.is_linked_teacher(a.student_id)));
  if result is null then raise exception 'not_found'; end if;
  return result;
end $$;

revoke all on function public.get_attempt_result(uuid) from public;
grant execute on function public.get_attempt_result(uuid) to authenticated;
