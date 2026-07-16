begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

select lives_ok($$
  select public.create_homework(
    'Интеграционный тест', 'automatic', now()+interval '2 days', 1,
    array['20000000-0000-0000-0000-000000000001']::uuid[],
    '[{"prompt":"2 + 2", "answers":["4"]},{"prompt":"Столица России", "answers":["Москва","москва"]}]'::jsonb,
    '[]'::jsonb, '', 'Europe/Moscow', null,
    '40000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000002',
    '{}'::jsonb
  )
$$, 'teacher creates a complete homework transaction');

select is((select count(*)::int from public.homeworks where title='Интеграционный тест'),1,'homework exists after successful transaction');
select is((select count(*)::int from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where v.title='Интеграционный тест'),2,'all questions exist');
select is((select count(*)::int from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),1,'assignment exists');

select throws_ok($$
  select public.create_homework(
    'Должно откатиться', 'automatic', now()+interval '2 days', 1,
    array['20000000-0000-0000-0000-000000000001']::uuid[],
    '[{"prompt":"Без ответа", "answers":[]}]'::jsonb,
    '[]'::jsonb, '', 'Europe/Moscow', null, null, null, '{}'::jsonb
  )
$$,'P0001','answer_required','invalid homework is rejected');
select is((select count(*)::int from public.homeworks where title='Должно откатиться'),0,'failed creation leaves no partial homework');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$
  select * from public.submit_attempt(
    (select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),
    jsonb_build_object(
      (select q.id::text from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where v.title='Интеграционный тест' and q.position=1),'4',
      (select q.id::text from public.homework_questions q join public.homework_versions v on v.id=q.homework_version_id where v.title='Интеграционный тест' and q.position=2),'МОСКВА'
    ),
    '9a000000-0000-0000-0000-000000000001'
  )
$$,'student submits a server-scored attempt');

select lives_ok($$
  select * from public.submit_attempt(
    (select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),
    '{}'::jsonb,
    '9a000000-0000-0000-0000-000000000001'
  )
$$,'repeating an idempotency key returns the existing attempt');

select is((select count(*)::int from public.attempts at join public.homework_assignments a on a.id=at.assignment_id join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),1,'idempotent retry does not create a duplicate');
select is((select max(at.score)::int from public.attempts at join public.homework_assignments a on a.id=at.assignment_id join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),2,'normalization and multiple accepted answers are scored on the server');

select throws_ok($$
  select * from public.submit_attempt(
    (select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),
    '{}'::jsonb,
    '9a000000-0000-0000-0000-000000000002'
  )
$$,'P0001','attempts_exhausted','attempt limit is enforced by the backend');

reset role;
update public.homework_assignments set deadline_at=now()-interval '1 minute'
where id=(select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$
  select * from public.submit_attempt(
    (select a.id from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id where v.title='Интеграционный тест'),
    '{}'::jsonb,
    '9a000000-0000-0000-0000-000000000003'
  )
$$,'P0001','deadline_expired','deadline is enforced using server time');

select * from finish();
rollback;
