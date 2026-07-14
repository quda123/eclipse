begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Seeded Anna is student A; Maxim is student B. Both are authenticated separately below.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.profiles where id='20000000-0000-0000-0000-000000000001'),1,'student can read own profile after login');
select is((select count(*)::int from public.organization_members where user_id='20000000-0000-0000-0000-000000000001' and role='student'),1,'student can resolve own role after login');
select is((select count(*)::int from public.profiles where id='20000000-0000-0000-0000-000000000002'),0,'student A cannot read student B profile');
select is((select count(*)::int from public.homework_assignments where student_id='20000000-0000-0000-0000-000000000002'),0,'student A cannot read student B assignments');
select is((select count(*)::int from public.attempts where student_id='20000000-0000-0000-0000-000000000002'),0,'student A cannot read student B attempts');
select is((select count(*)::int from public.teacher_notes),0,'student cannot read teacher notes');
select throws_ok($$insert into public.manual_task_scores(submission_id,task_number,points) values(gen_random_uuid(),1,2)$$,'42501',null,'student cannot write manual scores');
select throws_ok($$insert into public.homework_assignments(homework_version_id,student_id,deadline_at,timezone) values('51000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',now()+interval '1 day','Europe/Moscow')$$,'42501',null,'student cannot create assignments');
select throws_ok($$insert into storage.objects(bucket_id,name) values('homework-originals','30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/assignment/version/file.jpg')$$,'42501',null,'student A cannot upload into student B path');
select throws_ok($$insert into storage.objects(bucket_id,name) values('homework-processed','30000000-0000-0000-0000-000000000002/10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003/assignment/version/file.jpg')$$,'42501',null,'student A cannot upload into another tenant path');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.profiles where id='20000000-0000-0000-0000-000000000003'),0,'teacher A cannot read teacher B student profile');
select is((select count(*)::int from public.teacher_student_links where student_id='20000000-0000-0000-0000-000000000003'),0,'teacher A cannot read teacher B links');

select * from finish();
rollback;
