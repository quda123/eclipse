create table public.homework_drafts(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,teacher_id uuid not null references public.profiles,homework_id uuid references public.homeworks on delete cascade,title text not null default '',payload jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now(),created_at timestamptz not null default now());
create unique index homework_drafts_homework_teacher_idx on public.homework_drafts(homework_id,teacher_id) where homework_id is not null;
alter table public.homework_drafts enable row level security;
create policy "teachers manage own drafts" on public.homework_drafts for all using(teacher_id=auth.uid() and public.is_active_user()) with check(teacher_id=auth.uid() and public.is_org_teacher(organization_id));

create or replace function public.save_homework_draft(p_draft uuid,p_homework uuid,p_title text,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; result uuid;
begin
  select organization_id into org from public.organization_members where user_id=auth.uid() and role in ('owner','teacher') limit 1;if org is null or not public.is_active_user() then raise exception 'forbidden'; end if;
  if p_homework is not null and not exists(select 1 from public.homeworks where id=p_homework and teacher_id=auth.uid()) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>200000 then raise exception 'invalid_payload'; end if;
  if p_draft is null then insert into public.homework_drafts(organization_id,teacher_id,homework_id,title,payload) values(org,auth.uid(),p_homework,left(p_title,160),p_payload) returning id into result;
  else update public.homework_drafts set title=left(p_title,160),payload=p_payload,updated_at=now() where id=p_draft and teacher_id=auth.uid() returning id into result;if result is null then raise exception 'draft_not_found'; end if;end if;
  return result;
end $$;
create or replace function public.save_homework_template(p_title text,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare org uuid;result uuid;begin select organization_id into org from public.organization_members where user_id=auth.uid() and role in ('owner','teacher') limit 1;if org is null or not public.is_active_user() then raise exception 'forbidden';end if;insert into public.homework_templates(organization_id,teacher_id,title,payload) values(org,auth.uid(),left(p_title,160),p_payload) returning id into result;return result;end $$;
create or replace function public.archive_homework(p_homework uuid) returns void language plpgsql security definer set search_path=public as $$ declare item public.homeworks;begin select * into item from public.homeworks where id=p_homework and teacher_id=auth.uid() for update;if not found then raise exception 'forbidden';end if;update public.homeworks set archived_at=now() where id=p_homework;insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(item.organization_id,auth.uid(),'homework_archived','homework',item.id);end $$;
revoke all on function public.save_homework_draft(uuid,uuid,text,jsonb),public.save_homework_template(text,jsonb),public.archive_homework(uuid) from public;
grant execute on function public.save_homework_draft(uuid,uuid,text,jsonb),public.save_homework_template(text,jsonb),public.archive_homework(uuid) to authenticated;
