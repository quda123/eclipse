begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

create temporary table test_submission as
select * from public.begin_manual_submission('53000000-0000-0000-0000-000000000002');
select is((select count(*)::int from test_submission),1,'student starts one manual submission version');

reset role;
insert into storage.objects(bucket_id,name)
select bucket, path_prefix||'/page-1.jpg'
from test_submission
cross join unnest(array['homework-originals','homework-processed','homework-thumbnails']) bucket;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$
  select public.finalize_manual_submission(
    (select submission_id from test_submission),
    jsonb_build_array(jsonb_build_object(
      'original_path',(select path_prefix||'/page-1.jpg' from test_submission),
      'processed_path',(select path_prefix||'/page-1.jpg' from test_submission),
      'thumbnail_path',(select path_prefix||'/page-1.jpg' from test_submission),
      'original_name','page-1.jpg','mime_type','image/jpeg','size_bytes',1024,
      'width',1200,'height',1600,'crop','{}'::jsonb,'rotation',0
    ))
  )
$$,'student finalizes a fully staged submission');
select is((select status::text from public.homework_assignments where id='53000000-0000-0000-0000-000000000002'),'awaiting_review','assignment awaits teacher review');
select is((select count(*)::int from public.submission_images where submission_id=(select submission_id from test_submission)),1,'submitted image metadata is immutable in the submission');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.notifications where dedupe_key='submission:'||(select submission_version_id from test_submission)::text),1,'teacher receives one deduplicated review notification');
select lives_ok($$
  select public.save_manual_review(
    (select submission_id from test_submission),
    (select jsonb_build_object(id::text,1) from public.manual_tasks where homework_version_id='51000000-0000-0000-0000-000000000002' and position=1)
  )
$$,'teacher saves a partial review draft');
select is((select points from public.manual_task_scores where submission_id=(select submission_id from test_submission) and task_number=1),1,'partial score persists for reopening');
select lives_ok($$
  select * from public.grade_manual_submission(
    (select submission_id from test_submission),
    (select jsonb_object_agg(id::text,2) from public.manual_tasks where homework_version_id='51000000-0000-0000-0000-000000000002')
  )
$$,'linked teacher grades every manual task transactionally');
select is((select status::text from public.homework_assignments where id='53000000-0000-0000-0000-000000000002'),'reviewed','grading updates assignment status');
select is((select sum(points)::int from public.manual_task_scores where submission_id=(select submission_id from test_submission)),4,'manual score uses exactly two points per task');

select * from finish();
rollback;
