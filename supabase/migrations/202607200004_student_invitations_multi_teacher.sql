-- Personal, single-use student invitations and multi-teacher student accounts.
create type public.invitation_status as enum ('pending','accepted','expired','revoked');

alter table public.profiles add column if not exists email text;
create unique index profiles_email_unique on public.profiles(lower(btrim(email))) where email is not null;

alter table public.teacher_student_links drop constraint if exists teacher_student_links_student_id_key;
alter table public.teacher_student_links add column if not exists status public.member_status not null default 'active';
alter table public.teacher_student_links add column if not exists archived_at timestamptz;
alter table public.teacher_student_links add constraint teacher_student_links_unique unique(organization_id,teacher_id,student_id);
create index teacher_student_links_student_idx on public.teacher_student_links(student_id,status);

create table public.student_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  teacher_id uuid not null references public.profiles,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  status public.invitation_status not null default 'pending',
  subject text not null default 'Математика' check(length(btrim(subject)) between 1 and 80),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles,
  check(expires_at > created_at),
  check((status='accepted')=(accepted_by is not null and accepted_at is not null)),
  check((status='revoked')=(revoked_at is not null))
);
create index student_invitations_teacher_idx on public.student_invitations(teacher_id);
create index student_invitations_organization_idx on public.student_invitations(organization_id);
create index student_invitations_status_idx on public.student_invitations(status);
create index student_invitations_expires_idx on public.student_invitations(expires_at);
alter table public.student_invitations enable row level security;
create policy "teachers read own invitations" on public.student_invitations for select
  using(teacher_id=auth.uid() and organization_id=public.active_organization());

create or replace function public.is_linked_teacher(student uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_active_user() and exists(
    select 1 from public.teacher_student_links
    where teacher_id=auth.uid() and student_id=student and status='active'
  )
$$;

create or replace function public.create_student_invitation(p_subject text default 'Математика',p_days int default 7)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_org uuid;v_id uuid;v_token text;v_expires timestamptz;
begin
  if not public.is_active_user() then raise exception 'unauthorized'; end if;
  v_org:=public.active_organization();
  if not exists(select 1 from public.organization_members where organization_id=v_org and user_id=auth.uid() and role in ('owner','teacher')) then raise exception 'forbidden'; end if;
  if p_days not between 1 and 30 or length(btrim(p_subject)) not between 1 and 80 then raise exception 'invalid_invitation'; end if;
  v_token:=rtrim(translate(encode(gen_random_bytes(32),'base64'),'+/','-_'),'=');
  v_expires:=now()+make_interval(days=>p_days);
  insert into public.student_invitations(organization_id,teacher_id,token_hash,subject,expires_at,created_by)
  values(v_org,auth.uid(),encode(digest(v_token,'sha256'),'hex'),btrim(p_subject),v_expires,auth.uid()) returning id into v_id;
  return jsonb_build_object('id',v_id,'token',v_token,'expiresAt',v_expires);
end $$;

create or replace function public.list_student_invitations() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status::text end,
    'subject',i.subject,'createdAt',i.created_at,'expiresAt',i.expires_at,
    'acceptedBy',case when i.accepted_by is null then null else concat_ws(' ',p.first_name,p.last_name) end
  ) order by i.created_at desc),'[]')
  from public.student_invitations i left join public.profiles p on p.id=i.accepted_by
  where i.teacher_id=auth.uid() and i.organization_id=public.active_organization() and public.is_active_user()
$$;

create or replace function public.revoke_student_invitation(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.student_invitations set status='revoked',revoked_at=now()
  where id=p_id and teacher_id=auth.uid() and organization_id=public.active_organization() and status='pending' and expires_at>now();
  if not found then raise exception 'invitation_not_revocable'; end if;
end $$;

create or replace function public.inspect_student_invitation(p_token_hash text) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce((select jsonb_build_object(
    'state',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status::text end,
    'teacherName',concat_ws(' ',p.first_name,p.last_name),'organizationName',o.name,'subject',i.subject,'expiresAt',i.expires_at)
    from public.student_invitations i join public.profiles p on p.id=i.teacher_id join public.organizations o on o.id=i.organization_id
    where i.token_hash=p_token_hash),jsonb_build_object('state','not_found'))
$$;

create or replace function public.invitation_registration_conflict(p_token_hash text,p_email text,p_username text) returns text
language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not exists(select 1 from public.student_invitations where token_hash=p_token_hash and status='pending' and expires_at>now()) then return 'invitation_unavailable'; end if;
  if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) then return 'email_registered'; end if;
  if exists(select 1 from public.profiles where username=lower(btrim(p_username))) then return 'username_taken'; end if;
  return null;
end $$;

create or replace function public.accept_student_invitation_for(
  p_user uuid,p_token_hash text,p_username text default null,p_first_name text default null,p_last_name text default null,p_email text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare i public.student_invitations;v_username text;v_email text;v_teacher_name text;
begin
  select * into i from public.student_invitations where token_hash=p_token_hash for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if i.status='accepted' then
    if i.accepted_by=p_user then
      select concat_ws(' ',first_name,last_name) into v_teacher_name from public.profiles where id=i.teacher_id;
      return jsonb_build_object('teacherName',v_teacher_name,'organizationId',i.organization_id,'alreadyAccepted',true);
    end if;
    raise exception 'invitation_unavailable';
  end if;
  if i.status='revoked' then raise exception 'invitation_revoked'; end if;
  if i.expires_at<=now() then update public.student_invitations set status='expired' where id=i.id; raise exception 'invitation_expired'; end if;

  if exists(select 1 from public.organization_members where user_id=p_user and role in ('owner','teacher')) then raise exception 'teacher_cannot_accept'; end if;
  if not exists(select 1 from public.profiles where id=p_user) then
    v_username:=lower(btrim(coalesce(p_username,'')));
    v_email:=lower(btrim(coalesce(p_email,'')));
    if v_username !~ '^[a-zа-яё0-9_.-]{3,40}$' then raise exception 'invalid_username'; end if;
    if length(btrim(coalesce(p_first_name,''))) not between 1 and 80 or length(btrim(coalesce(p_last_name,''))) not between 1 and 80 then raise exception 'invalid_name'; end if;
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
    insert into public.profiles(id,username,first_name,last_name,email,must_change_password)
    values(p_user,v_username,btrim(p_first_name),btrim(p_last_name),v_email,false);
  elsif not exists(select 1 from public.organization_members where user_id=p_user and role='student') then
    raise exception 'teacher_cannot_accept';
  end if;

  if exists(select 1 from public.teacher_student_links where organization_id=i.organization_id and teacher_id=i.teacher_id and student_id=p_user and status='active') then raise exception 'already_connected'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(i.organization_id,p_user,'student') on conflict do nothing;
  insert into public.teacher_student_links(organization_id,teacher_id,student_id,subject,status,archived_at)
  values(i.organization_id,i.teacher_id,p_user,i.subject,'active',null)
  on conflict(organization_id,teacher_id,student_id) do update set status='active',archived_at=null,subject=excluded.subject;
  update public.student_invitations set status='accepted',accepted_by=p_user,accepted_at=now() where id=i.id and status='pending';
  select concat_ws(' ',first_name,last_name) into v_teacher_name from public.profiles where id=i.teacher_id;
  return jsonb_build_object('teacherName',v_teacher_name,'organizationId',i.organization_id);
end $$;

create or replace function public.accept_student_invitation(p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return public.accept_student_invitation_for(auth.uid(),p_token_hash);
end $$;

create or replace function public.handle_invited_student_signup() returns trigger
language plpgsql security definer set search_path=public as $$
declare m jsonb:=new.raw_user_meta_data;h text;
begin
  h:=m->>'invitation_token_hash';
  if h is not null then
    perform public.accept_student_invitation_for(new.id,h,m->>'username',m->>'first_name',m->>'last_name',new.email);
  end if;
  return new;
end $$;
drop trigger if exists invited_student_signup on auth.users;
create trigger invited_student_signup after insert on auth.users for each row execute function public.handle_invited_student_signup();

create or replace function public.student_teachers() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('teacherId',l.teacher_id,'teacherName',concat_ws(' ',p.first_name,p.last_name),'organizationName',o.name,'subject',l.subject,'status',l.status,'joinedAt',l.created_at) order by p.first_name,p.last_name),'[]')
  from public.teacher_student_links l join public.profiles p on p.id=l.teacher_id join public.organizations o on o.id=l.organization_id
  where l.student_id=auth.uid() and public.is_active_user()
$$;

create or replace function public.archive_teacher_student_link(p_student uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.teacher_student_links set status='archived',archived_at=now()
  where teacher_id=auth.uid() and student_id=p_student and organization_id=public.active_organization() and status='active';
  if not found then raise exception 'link_not_found'; end if;
end $$;

revoke all on function public.accept_student_invitation_for(uuid,text,text,text,text,text) from public;
revoke all on function public.create_student_invitation(text,int),public.list_student_invitations(),public.revoke_student_invitation(uuid),public.accept_student_invitation(text),public.student_teachers(),public.archive_teacher_student_link(uuid) from public;
grant execute on function public.create_student_invitation(text,int),public.list_student_invitations(),public.revoke_student_invitation(uuid),public.accept_student_invitation(text),public.student_teachers(),public.archive_teacher_student_link(uuid) to authenticated;
revoke all on function public.inspect_student_invitation(text) from public;
grant execute on function public.inspect_student_invitation(text) to anon,authenticated;
revoke all on function public.invitation_registration_conflict(text,text,text) from public;
grant execute on function public.invitation_registration_conflict(text,text,text) to anon,authenticated;

drop function if exists public.assignment_cards();
create function public.assignment_cards()
returns table(id uuid,homework_id uuid,title text,topic text,mode public.homework_mode,status public.assignment_status,effective_deadline timestamptz,teacher_id uuid,teacher_name text,organization_name text,subject text)
language sql stable security definer set search_path=public as $$
  select a.id,v.homework_id,v.title,coalesce(t.name,'Без темы'),v.mode,a.status,public.assignment_deadline(a.id),v.teacher_id,
    concat_ws(' ',p.first_name,p.last_name),o.name,coalesce(s.name,l.subject,'Без предмета')
  from public.homework_assignments a join public.homework_versions v on v.id=a.homework_version_id
  join public.profiles p on p.id=v.teacher_id join public.organizations o on o.id=v.organization_id
  left join public.subjects s on s.id=v.subject_id left join public.topics t on t.id=v.topic_id
  left join public.teacher_student_links l on l.organization_id=v.organization_id and l.teacher_id=v.teacher_id and l.student_id=a.student_id
  where public.is_active_user() and (a.student_id=auth.uid() or (v.teacher_id=auth.uid() and l.status='active'))
  order by public.assignment_deadline(a.id)
$$;
revoke all on function public.assignment_cards() from public;
grant execute on function public.assignment_cards() to authenticated;

create or replace function public.teacher_student_summary()
returns table(id uuid,first_name text,last_name text,username text,class_name text,status public.member_status,subject text,default_zoom_url text,average_result int,overdue_count int,last_activity timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.first_name,p.last_name,p.username,p.class_name,l.status,l.subject,l.default_zoom_url,
    coalesce(round(avg(r.percentage) filter(where r.result_status='reviewed' or (v.mode='automatic' and r.result_status='automatic_complete')))::int,0),
    count(distinct a.id) filter(where a.status not in ('submitted','reviewed') and public.assignment_deadline(a.id)<now())::int,
    greatest(p.updated_at,coalesce(max(r.updated_at),'-infinity'),coalesce(max(ms.submitted_at),'-infinity'))
  from public.teacher_student_links l join public.profiles p on p.id=l.student_id
  left join public.homework_versions v on v.teacher_id=auth.uid() and v.organization_id=l.organization_id
  left join public.homework_assignments a on a.student_id=p.id and a.homework_version_id=v.id
  left join public.assignment_results r on r.assignment_id=a.id left join public.manual_submissions ms on ms.assignment_id=a.id
  where l.teacher_id=auth.uid() and l.organization_id=public.active_organization() and l.status='active' and public.is_active_user()
  group by p.id,p.first_name,p.last_name,p.username,p.class_name,l.status,l.subject,l.default_zoom_url,p.updated_at
  order by p.last_name,p.first_name
$$;
