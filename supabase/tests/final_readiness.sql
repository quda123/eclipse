begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select is((select sum(max_points)::int from public.manual_tasks where homework_version_id='51000000-0000-0000-0000-000000000002'),5,'manual maximum is the sum of variable task maximums');
select is((select max_points from public.manual_tasks where homework_version_id='51000000-0000-0000-0000-000000000003'),4,'published task preserves its maximum');
select is((select automatic_score from public.assignment_results where assignment_id='53000000-0000-0000-0000-000000000001'),2,'official automatic result uses the best attempt');
select is((select total_maximum from public.assignment_results where assignment_id='53000000-0000-0000-0000-000000000004'),5,'combined maximum includes variable written maximum');
select is((select total_score from public.assignment_results where assignment_id='53000000-0000-0000-0000-000000000004'),3,'reviewed combined score is durable');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$
  select public.create_homework_v2('Финальная проверка','automatic',now()+interval '2 days',2,
    array['20000000-0000-0000-0000-000000000001']::uuid[],
    '[{"prompt":"1 + 1","answers":["2"]}]','[]','','Europe/Moscow',null,null,null,'{}')
$$,'v2 homework creation is transactional');
select is((select count(*)::int from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Финальная проверка'),1,'v2 creates one assignment');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.active_organization(),'30000000-0000-0000-0000-000000000001'::uuid,'active organization is deterministic with multiple memberships');
create temporary table first_start as select * from public.start_or_resume_attempt_draft((select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Финальная проверка'));
create temporary table second_start as select * from public.start_or_resume_attempt_draft((select assignment_id from first_start));
select is((select started_at from first_start),(select started_at from second_start),'refresh and another tab preserve started_at');
select is((select count(*)::int from public.attempt_drafts where assignment_id=(select assignment_id from first_start)),1,'only one draft exists per student assignment');

select lives_ok($$
  select * from public.submit_attempt((select assignment_id from first_start),
    jsonb_build_object((select q.id::text from public.homework_questions q join public.homework_assignments a on a.homework_version_id=q.homework_version_id where a.id=(select assignment_id from first_start)),'2'),
    '9b000000-0000-0000-0000-000000000001')
$$,'server creates the attempt');
select lives_ok($$select * from public.submit_attempt((select assignment_id from first_start),'{}','9b000000-0000-0000-0000-000000000001')$$,'lost-response retry returns the same attempt');
select is((select count(*)::int from public.attempts where assignment_id=(select assignment_id from first_start)),1,'idempotent retry consumes one attempt');
select is((select result_status::text from public.assignment_results where assignment_id=(select assignment_id from first_start)),'automatic_complete','official result updates after submission');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.notifications where dedupe_key like 'attempt:%' and href like '/teacher/homework/%/result'),1,'idempotent retry creates one teacher notification');
select throws_ok($$update public.manual_task_scores set points=5 where submission_id='56000000-0000-0000-0000-000000000001'$$,'P0001','invalid_score','database rejects score above task maximum');
select is((select count(*)::int from public.notifications where href !~ '^/(student|teacher)/(calendar|notifications|review($|/)|homework/[0-9a-f-]+($|/(photos|result))|results/[0-9a-f-]+|students($|/[0-9a-f-]+)|homework($|/new|/[0-9a-f-]+/(edit|preview))|settings|profile)$'),0,'all notification hrefs map to registered protected routes');
create temporary table exception_times as select id,starts_at from public.lessons where id in ('60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000005');
select lives_ok($$select public.update_lesson_series('60000000-0000-0000-0000-000000000004','series',(select starts_at+interval '1 hour' from public.lessons where id='60000000-0000-0000-0000-000000000004'),(select ends_at+interval '1 hour' from public.lessons where id='60000000-0000-0000-0000-000000000004'))$$,'whole-series edit succeeds');
select is((select starts_at from public.lessons where id='60000000-0000-0000-0000-000000000003'),(select starts_at from exception_times where id='60000000-0000-0000-0000-000000000003'),'moved occurrence remains an exception');
select is((select starts_at from public.lessons where id='60000000-0000-0000-0000-000000000005'),(select starts_at from exception_times where id='60000000-0000-0000-0000-000000000005'),'cancelled occurrence is not recreated or moved');

select * from finish();
rollback;
