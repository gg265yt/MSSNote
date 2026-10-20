-- MSS Grade Tracker: Schema + RLS. Gewichte liegen in categories.weight (keine Redundanz-Tabelle).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  half_points boolean not null default false,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  missing_category_mode text not null default 'renormalize' check (missing_category_mode in ('renormalize','strict')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null, sort_order int not null default 0,
  created_at timestamptz not null default now(), unique (id, user_id)
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  short_name text check (char_length(short_name) <= 10),
  kind text not null default 'grundfach' check (kind in ('grundfach','leistungsfach')),
  color text not null default '#3b82f6', icon text, sort_order int not null default 0,
  created_at timestamptz not null default now(), unique (id, user_id),
  foreign key (semester_id, user_id) references public.semesters(id, user_id) on delete set null (semester_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  weight numeric(5,2) not null default 0 check (weight between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(), unique (id, user_id), unique (subject_id, name),
  foreign key (subject_id, user_id) references public.subjects(id, user_id) on delete cascade
);
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null, category_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  points numeric(4,1) not null check (points between 0 and 15),
  graded_on date not null default current_date, note text,
  created_at timestamptz not null default now(),
  -- Composite-FKs: Kategorie/Fach muessen demselben Nutzer gehoeren (blockiert manipulierte Fremd-IDs)
  foreign key (subject_id, user_id) references public.subjects(id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict
);
create index on public.grades (user_id, subject_id, graded_on);

alter table public.profiles enable row level security;
create policy own_profile on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
do $$ declare t text; begin
  foreach t in array array['semesters','subjects','categories','grades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop; end $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
