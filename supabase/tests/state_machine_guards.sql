begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.homeworks(id,organization_id,teacher_id,title) values
('5a000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 1'),
('5a000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 2'),
('5a000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 3'),
('5a000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 4');
insert into public.homework_versions(id,homework_id,organization_id,teacher_id,title,mode,attempts_allowed,published_at) values
('5a100000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 1','combined',3,now()),
('5a100000-0000-0000-0000-000000000002','5a000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 2','combined',3,now()),
('5a100000-0000-0000-0000-000000000003','5a000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 3','combined',3,now()),
('5a100000-0000-0000-0000-000000000004','5a000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','State machine 4','combined',3,now());
insert into public.homework_questions(id,homework_version_id,position,prompt) values
('5a200000-0000-0000-0000-000000000002','5a100000-0000-0000-0000-000000000002',1,'State machine question 2'),
('5a200000-0000-0000-0000-000000000003','5a100000-0000-0000-0000-000000000003',1,'State machine question 3'),
('5a200000-0000-0000-0000-000000000004','5a100000-0000-0000-0000-000000000004',1,'State machine question 4');

insert into public.homework_assignments(id,homework_version_id,student_id,deadline_at,timezone,status) values
('5b000000-0000-0000-0000-000000000001','5a100000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',now()+interval '1 day','Europe/Moscow','not_started'),
('5b000000-0000-0000-0000-000000000002','5a100000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',now()+interval '1 day','Europe/Moscow','awaiting_review'),
('5b000000-0000-0000-0000-000000000003','5a100000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',now()-interval '1 day','Europe/Moscow','awaiting_review'),
('5b000000-0000-0000-0000-000000000004','5a100000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',now()+interval '1 day','Europe/Moscow','in_progress');
insert into public.attempts(id,assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key,submitted_at) values
('5c000000-0000-0000-0000-000000000002','5b000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',1,'{}',0,1,'5d000000-0000-0000-0000-000000000002',now()),
('5c000000-0000-0000-0000-000000000003','5b000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',1,'{}',1,1,'5d000000-0000-0000-0000-000000000003',now()),
('5c000000-0000-0000-0000-000000000004','5b000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',1,'{}',1,1,'5d000000-0000-0000-0000-000000000004',now());
insert into public.manual_submissions(id,assignment_id,student_id,version,submitted_at,reviewed_at) values
('5e000000-0000-0000-0000-000000000031','5b000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',1,now()-interval '2 days',now()-interval '1 day'),
('5e000000-0000-0000-0000-000000000032','5b000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',2,now(),null);
insert into public.assignment_deadline_extensions(assignment_id,extended_until,reason,created_by)
values('5b000000-0000-0000-0000-000000000003',now()+interval '1 day','State machine test','10000000-0000-0000-0000-000000000001');
insert into public.organization_members(organization_id,user_id,role)
values('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','teacher');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.start_or_resume_attempt_draft('53000000-0000-0000-0000-000000000002')$$,'P0001','automatic_part_not_allowed','manual homework rejects draft attempts');
select throws_ok($$select * from public.submit_attempt('53000000-0000-0000-0000-000000000002','{}','5d000000-0000-0000-0000-000000000011')$$,'P0001','automatic_part_not_allowed','manual homework rejects automatic submission');
select throws_ok($$select * from public.begin_manual_submission('53000000-0000-0000-0000-000000000001')$$,'P0001','manual_part_not_allowed','automatic homework rejects photo submission');
select throws_ok($$select * from public.begin_manual_submission('5b000000-0000-0000-0000-000000000001')$$,'P0001','automatic_part_required','combined homework rejects photos before automatic attempt');
select lives_ok($$select * from public.begin_manual_submission('5b000000-0000-0000-0000-000000000004')$$,'combined homework allows photos after automatic attempt');
select throws_ok($$select * from public.submit_attempt('5b000000-0000-0000-0000-000000000002','{}','5d000000-0000-0000-0000-000000000012')$$,'P0001','manual_part_already_submitted','awaiting review rejects another automatic attempt');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.grade_manual_submission('56000000-0000-0000-0000-000000000002','{}')$$,'P0001','not_reviewable','returned submission cannot be graded');
select throws_ok($$select * from public.grade_manual_submission('56000000-0000-0000-0000-000000000001','{}')$$,'P0001','not_reviewable','reviewed submission cannot be graded again');

reset role;
select is((public.recalculate_assignment_result('5b000000-0000-0000-0000-000000000003')).result_status::text,'awaiting_review','latest pending v2 overrides reviewed v1');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.manual_review_queue() where id in ('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000002')),0,'queue excludes returned and reviewed submissions');
select is((select count(*)::int from public.manual_review_queue() where id='5e000000-0000-0000-0000-000000000032'),1,'queue contains only latest pending submission');
select ok((select submitted_at<=effective_deadline from public.manual_review_queue() where id='5e000000-0000-0000-0000-000000000032'),'queue uses extended effective deadline');

select is(public.active_organization(),'30000000-0000-0000-0000-000000000001'::uuid,'multiple memberships keep explicit active organization');

reset role;
update public.profiles set status='archived' where id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.get_attempt_result('54000000-0000-0000-0000-000000000001')$$,'P0001','unauthorized','archived JWT cannot use public security definer result RPC');

select * from finish();
rollback;
