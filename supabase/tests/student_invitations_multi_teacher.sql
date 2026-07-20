begin;
create extension if not exists pgtap with schema extensions;
select plan(27);
create temporary table invitation_result(value jsonb);
grant all on invitation_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
insert into invitation_result select public.create_student_invitation('Физика',7);
select is((select count(*)::int from public.student_invitations where teacher_id=auth.uid()),1,'teacher creates invitation in active organization');
select is((select organization_id from public.student_invitations where teacher_id=auth.uid()),'30000000-0000-0000-0000-000000000002'::uuid,'invitation uses active organization');
select ok(length((select value->>'token' from invitation_result))>=43,'token contains at least 256 random bits');
select isnt((select token_hash from public.student_invitations where teacher_id=auth.uid()),(select value->>'token' from invitation_result),'database never stores raw token');
select is(public.invitation_registration_conflict(encode(digest((select value->>'token' from invitation_result),'sha256'),'hex'),' TEACHER@USERS.ECLIPSE.LOCAL ','unused.login'),'email_registered','email conflict is normalized server-side');
select is(public.invitation_registration_conflict(encode(digest((select value->>'token' from invitation_result),'sha256'),'hex'),'unused@example.com','ANNA'),'username_taken','username conflict is normalized server-side');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.create_student_invitation('Физика',7)$$,'P0001','forbidden','student cannot create invitation');
select lives_ok(format('select public.accept_student_invitation(%L)',encode(digest((select value->>'token' from invitation_result),'sha256'),'hex')),'existing student accepts invitation');
select is((select count(*)::int from public.teacher_student_links where student_id=auth.uid() and status='active'),2,'one student has two active teachers');
select is((select count(*)::int from public.organization_members where user_id=auth.uid() and role='student'),2,'student remains member of two organizations');
select is((select count(*)::int from public.teacher_student_links where organization_id='30000000-0000-0000-0000-000000000002' and teacher_id='10000000-0000-0000-0000-000000000002' and student_id=auth.uid()),1,'second independent teacher link created');
select lives_ok(format('select public.accept_student_invitation(%L)',encode(digest((select value->>'token' from invitation_result),'sha256'),'hex')),'same-user retry is idempotent');
select is((select count(*)::int from public.teacher_student_links where student_id=auth.uid()),2,'retry creates no duplicate link');
select is(jsonb_array_length(public.student_teachers()),2,'student teachers aggregate returns both teachers');
select ok(jsonb_array_length(public.student_dashboard()->'recentResults')>=0,'student dashboard aggregates safely');
select is((select count(*)::int from public.lessons where student_id=auth.uid()),4,'student calendar keeps lessons across available teachers');

reset role;
insert into public.student_invitations(id,organization_id,teacher_id,token_hash,subject,status,expires_at,created_at,revoked_at,created_by)
values
('81000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',encode(digest('expired-token','sha256'),'hex'),'Физика','pending',now()-interval '1 minute',now()-interval '2 days',null,'10000000-0000-0000-0000-000000000002'),
('81000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',encode(digest('revoked-token','sha256'),'hex'),'Физика','revoked',now()+interval '1 day',now(),now(),'10000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok(format('select public.accept_student_invitation(%L)',encode(digest('expired-token','sha256'),'hex')),'P0001','invitation_expired','expired invitation is rejected');
select throws_ok(format('select public.accept_student_invitation(%L)',encode(digest('revoked-token','sha256'),'hex')),'P0001','invitation_revoked','revoked invitation is rejected');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.homework_assignments),0,'teacher B cannot read teacher A assignments');
select is((select count(*)::int from public.attempts),0,'teacher B cannot read teacher A attempts');
select is((select count(*)::int from public.manual_submissions),0,'teacher B cannot read teacher A manual submissions');
select is((select count(*)::int from public.assignment_results),0,'teacher B cannot read teacher A results');
select is((select count(*)::int from public.teacher_notes),0,'teacher B cannot read teacher A notes');
select is((select count(*)::int from public.lessons where teacher_id<>'10000000-0000-0000-0000-000000000002'),0,'teacher B cannot read teacher A calendar');

select public.archive_teacher_student_link('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.teacher_student_links where student_id='20000000-0000-0000-0000-000000000001' and status='active'),0,'teacher B archived only own visible active link');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.teacher_student_links where student_id=auth.uid() and status='active'),1,'archiving teacher B leaves teacher A link active');
select is((select status::text from public.profiles where id=auth.uid()),'active','student account stays active after one link is archived');

select * from finish();
rollback;
