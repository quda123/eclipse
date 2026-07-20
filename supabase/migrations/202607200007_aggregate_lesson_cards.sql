-- One server-authoritative lesson feed for teachers and multi-teacher students.
create function public.lesson_cards(p_from timestamptz,p_to timestamptz) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'seriesId',l.series_id,'startsAt',l.starts_at,'endsAt',l.ends_at,
    'studentName',trim(concat(student.first_name,' ',student.last_name)),
    'status',l.status,'zoomUrl',l.zoom_url,'teacherId',l.teacher_id,
    'teacherName',trim(concat(teacher.first_name,' ',teacher.last_name)),
    'organizationName',o.name,'subject',coalesce(link.subject,'Без предмета')
  ) order by l.starts_at),'[]')
  from public.lessons l
  join public.profiles student on student.id=l.student_id
  join public.profiles teacher on teacher.id=l.teacher_id
  join public.organizations o on o.id=l.organization_id
  left join public.teacher_student_links link on link.organization_id=l.organization_id and link.teacher_id=l.teacher_id and link.student_id=l.student_id
  where l.starts_at>=p_from and l.starts_at<p_to and public.is_active_user()
    and (l.teacher_id=auth.uid() or (l.student_id=auth.uid() and link.status='active'))
$$;
revoke all on function public.lesson_cards(timestamptz,timestamptz) from public;
grant execute on function public.lesson_cards(timestamptz,timestamptz) to authenticated;
