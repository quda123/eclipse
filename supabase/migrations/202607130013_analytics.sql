create or replace function public.teacher_student_summary()
returns table(id uuid,first_name text,last_name text,username text,class_name text,status public.member_status,subject text,default_zoom_url text,average_result int,overdue_count int,last_activity timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.first_name,p.last_name,p.username,p.class_name,p.status,l.subject,l.default_zoom_url,
    coalesce(round(avg(case when a.maximum_score>0 then 100.0*a.score/a.maximum_score end))::int,0),
    count(distinct ha.id) filter(where ha.status not in ('submitted','reviewed') and public.assignment_deadline(ha.id)<now())::int,
    greatest(p.updated_at,coalesce(max(a.submitted_at),'-infinity'),coalesce(max(ms.submitted_at),'-infinity'))
  from public.teacher_student_links l join public.profiles p on p.id=l.student_id
  left join public.homework_assignments ha on ha.student_id=p.id
  left join public.attempts a on a.assignment_id=ha.id
  left join public.manual_submissions ms on ms.assignment_id=ha.id
  where l.teacher_id=auth.uid() and public.is_active_user()
  group by p.id,p.first_name,p.last_name,p.username,p.class_name,p.status,l.subject,l.default_zoom_url,p.updated_at
  order by p.last_name,p.first_name
$$;

create or replace function public.student_learning_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'assigned',count(distinct ha.id),'completed',count(distinct ha.id) filter(where ha.status in ('submitted','reviewed')),
    'overdue',count(distinct ha.id) filter(where ha.status not in ('submitted','reviewed') and public.assignment_deadline(ha.id)<now()),
    'awaiting_review',count(distinct ha.id) filter(where ha.status='awaiting_review'),
    'average_percentage',coalesce(round(avg(case when a.maximum_score>0 then 100.0*a.score/a.maximum_score end)),0),
    'best_percentage',coalesce(max(case when a.maximum_score>0 then round(100.0*a.score/a.maximum_score) end),0)
  ) from public.homework_assignments ha left join public.attempts a on a.assignment_id=ha.id
  where ha.student_id=auth.uid() and public.is_active_user()
$$;
revoke all on function public.teacher_student_summary(),public.student_learning_summary() from public;
grant execute on function public.teacher_student_summary(),public.student_learning_summary() to authenticated;
