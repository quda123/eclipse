create type public.app_role as enum ('owner', 'teacher', 'student');
create type public.member_status as enum ('active', 'archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username = lower(btrim(username)) and username ~ '^[a-zа-яё0-9_.-]+$'),
  first_name text not null,
  last_name text not null,
  class_name text,
  timezone text not null default 'Europe/Moscow',
  must_change_password boolean not null default false,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role public.app_role not null,
  primary key (organization_id, user_id)
);

create table public.teacher_student_links (
  teacher_id uuid not null references public.profiles on delete cascade,
  student_id uuid not null unique references public.profiles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  subject text not null default 'Математика',
  default_zoom_url text,
  created_at timestamptz not null default now(),
  check (teacher_id <> student_id)
);
create index teacher_student_links_teacher_idx on public.teacher_student_links(teacher_id);

alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.teacher_student_links enable row level security;

create function public.is_linked_teacher(student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.teacher_student_links where teacher_id = auth.uid() and student_id = student)
$$;
create policy "profile is private to user or linked teacher" on public.profiles for select using (id = auth.uid() or public.is_linked_teacher(id));
create policy "students see only their own link" on public.teacher_student_links for select using (student_id = auth.uid() or teacher_id = auth.uid());
create policy "members see own membership" on public.organization_members for select using (user_id = auth.uid());
