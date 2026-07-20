-- Aggregate the student dashboard across every active teacher link, with an
-- optional teacher filter. The teacher identity is derived from authored data.
drop function if exists public.student_dashboard();

create function public.student_dashboard(p_teacher_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  with active_teachers as (
    select l.teacher_id
    from public.teacher_student_links l
    where l.student_id=auth.uid() and l.status='active'
      and (p_teacher_id is null or l.teacher_id=p_teacher_id)
  ), own_assignments as (
    select a.*,v.title,v.mode,v.teacher_id,coalesce(t.name,'Без темы') topic,
      coalesce(s.name,'Без предмета') subject,o.name organization_name,
      trim(concat(p.first_name,' ',p.last_name)) teacher_name,
      public.assignment_deadline(a.id) effective_deadline
    from public.homework_assignments a
    join public.homework_versions v on v.id=a.homework_version_id
    join active_teachers at on at.teacher_id=v.teacher_id
    join public.organizations o on o.id=v.organization_id
    join public.profiles p on p.id=v.teacher_id
    left join public.topics t on t.id=v.topic_id
    left join public.subjects s on s.id=v.subject_id
    where a.student_id=auth.uid()
  ), official as (
    select r.* from public.assignment_results r
    join public.homework_versions v on v.id=r.homework_version_id
    join active_teachers at on at.teacher_id=v.teacher_id
    where r.student_id=auth.uid()
      and (r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete'))
  )
  select jsonb_build_object(
    'nextLesson',(select jsonb_build_object(
      'id',l.id,'seriesId',l.series_id,'startsAt',l.starts_at,'endsAt',l.ends_at,
      'studentName','','status',l.status,'zoomUrl',l.zoom_url,'teacherId',l.teacher_id,
      'teacherName',trim(concat(p.first_name,' ',p.last_name)),
      'organizationName',o.name,'subject',coalesce(link.subject,'Без предмета'))
      from public.lessons l join active_teachers at on at.teacher_id=l.teacher_id
      join public.profiles p on p.id=l.teacher_id join public.organizations o on o.id=l.organization_id
      left join public.teacher_student_links link on link.teacher_id=l.teacher_id and link.student_id=l.student_id and link.organization_id=l.organization_id
      where l.student_id=auth.uid() and l.starts_at>=now() and l.status<>'cancelled'
      order by l.starts_at limit 1),
    'nextAssignment',(select jsonb_build_object(
      'id',a.id,'homeworkId','','title',a.title,'topic',a.topic,
      'deadline',to_char(a.effective_deadline at time zone a.timezone,'DD.MM.YYYY HH24:MI'),
      'deadlineAt',a.effective_deadline,'status',a.status,'mode',a.mode,
      'teacherId',a.teacher_id,'teacherName',a.teacher_name,
      'organizationName',a.organization_name,'subject',a.subject)
      from own_assignments a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed')
      order by a.effective_deadline limit 1),
    'activeCount',(select count(*) from own_assignments a where a.effective_deadline>=now() and a.status not in ('submitted','reviewed')),
    'overdueCount',(select count(*) from own_assignments a where a.effective_deadline<now() and a.status not in ('submitted','reviewed')),
    'average',coalesce((select round(avg(percentage)) from official),0),
    'completionRate',coalesce((select round(100.0*count(*) filter(where status in ('submitted','reviewed'))/nullif(count(*),0)) from own_assignments),0),
    'recentResults',(select coalesce(jsonb_agg(jsonb_build_object('id',assignment_id,'score',total_score,'maximum',total_maximum,'submittedAt',updated_at) order by updated_at desc),'[]') from (select * from official order by updated_at desc limit 5)x),
    'unreadNotificationCount',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null)
  )
$$;

revoke all on function public.student_dashboard(uuid) from public;
grant execute on function public.student_dashboard(uuid) to authenticated;
