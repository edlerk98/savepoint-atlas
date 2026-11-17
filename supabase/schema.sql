-- Sogilex: database setup for accounts (step 1: sign-in, synced checklist, synced settings).
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run: every statement checks whether its object already exists.
-- Written for a project created with "Automatically expose new tables" switched OFF:
-- the grants below open only these two tables, and only to signed-in users.

-- ---------- Profiles: one row per account ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create the profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Checklist items: one row per item, owned by one account ----------
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack text not null default 'gta6',
  title text not null check (char_length(title) between 1 and 140),
  cat text not null check (char_length(cat) between 1 and 40),
  spoiler smallint not null default 0 check (spoiler between 0 and 2),
  done boolean not null default false,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checklist_items_user_pack on public.checklist_items (user_id, pack, created_at);

alter table public.checklist_items enable row level security;

drop policy if exists "items: own rows only" on public.checklist_items;
create policy "items: own rows only" on public.checklist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checklist_items_touch on public.checklist_items;
create trigger checklist_items_touch
  before update on public.checklist_items
  for each row execute function public.touch_updated_at();

-- ---------- Delete my account ----------
-- Removes the signed-in user from auth.users. Their profile and checklist rows go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Access: signed-in users only, and only through the row-level security policies above ----------
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;
revoke all on public.profiles from anon;
revoke all on public.checklist_items from anon;
