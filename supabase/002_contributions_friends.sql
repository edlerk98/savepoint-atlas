-- Sogilex 002: player contributions with review, and friends.
-- Run once in Supabase: SQL Editor > New query > paste > Run (after schema.sql). Safe to re-run.

-- ============ Admins (who may review submissions) ============
-- No policies: the table is invisible through the API. Add yourself with the snippet in the README.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ============ Pack entries: the shared, verified checklist ============
create table if not exists public.pack_entries (
  id uuid primary key default gen_random_uuid(),
  pack text not null default 'gta6',
  title text not null check (char_length(title) between 3 and 140),
  cat text not null check (cat in ('Main Story', 'Side Quests', 'Collectibles', 'Exploration', 'Challenges')),
  spoiler smallint not null default 0 check (spoiler between 0 and 2),
  note text not null default '' check (char_length(note) <= 1000),
  source text not null check (char_length(source) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists pack_entries_pack_status on public.pack_entries (pack, status, created_at);

alter table public.pack_entries enable row level security;

-- Everyone (signed in or not) sees approved entries; submitters see their own; admins see everything.
drop policy if exists "entries: read" on public.pack_entries;
create policy "entries: read" on public.pack_entries
  for select to anon, authenticated
  using (status = 'approved' or submitted_by = (select auth.uid()) or (select public.is_admin()));

-- Signed-in players submit; a submission always starts pending and unreviewed.
drop policy if exists "entries: submit" on public.pack_entries;
create policy "entries: submit" on public.pack_entries
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending' and review_note = '' and reviewed_at is null);

-- Only admins review or edit.
drop policy if exists "entries: review" on public.pack_entries;
create policy "entries: review" on public.pack_entries
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admins delete anything; players can withdraw their own pending submissions.
drop policy if exists "entries: delete" on public.pack_entries;
create policy "entries: delete" on public.pack_entries
  for delete to authenticated
  using ((select public.is_admin()) or (submitted_by = (select auth.uid()) and status = 'pending'));

-- Spam brake: at most 50 pending submissions per player.
create or replace function public.limit_pending_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.pack_entries where submitted_by = new.submitted_by and status = 'pending') >= 50 then
    raise exception 'You have 50 submissions waiting for review. Please wait for some to be reviewed.';
  end if;
  return new;
end;
$$;
drop trigger if exists pack_entries_limit on public.pack_entries;
create trigger pack_entries_limit before insert on public.pack_entries
  for each row execute function public.limit_pending_entries();

grant select on public.pack_entries to anon, authenticated;
grant insert, update, delete on public.pack_entries to authenticated;

-- Link a player's checklist item to the pack entry it came from.
alter table public.checklist_items add column if not exists entry_id uuid references public.pack_entries (id) on delete set null;
create unique index if not exists checklist_items_user_entry on public.checklist_items (user_id, entry_id) where entry_id is not null;

-- ============ Friends ============
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;

drop policy if exists "friends: see own" on public.friendships;
create policy "friends: see own" on public.friendships
  for select to authenticated using ((select auth.uid()) in (requester, addressee));

drop policy if exists "friends: remove own" on public.friendships;
create policy "friends: remove own" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (requester, addressee));

grant select, delete on public.friendships to authenticated;

-- Send a request by handle. Returns 'sent', 'accepted' (they had already asked you) or 'exists'.
create or replace function public.send_friend_request(target_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if (select handle from public.profiles where id = me) is null then
    raise exception 'Set your handle on the Account page first, so friends know who is asking.';
  end if;
  select id into other from public.profiles where handle = lower(trim(target_handle));
  if other is null then raise exception 'No player has that handle.'; end if;
  if other = me then raise exception 'That is your own handle.'; end if;
  if exists (select 1 from public.friendships where requester = other and addressee = me and status = 'pending') then
    update public.friendships set status = 'accepted' where requester = other and addressee = me;
    return 'accepted';
  end if;
  if exists (select 1 from public.friendships where (requester = me and addressee = other) or (requester = other and addressee = me)) then
    return 'exists';
  end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'You have 50 requests waiting. Wait for some answers first.';
  end if;
  insert into public.friendships (requester, addressee) values (me, other);
  return 'sent';
end;
$$;

-- Accept or decline a request sent to you.
create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if accept then
    update public.friendships set status = 'accepted'
      where id = request_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = request_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Your friends and requests, with handles (profiles are otherwise private).
create or replace function public.my_friends()
returns table (friendship_id uuid, handle text, status text, direction text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         p.handle,
         f.status,
         case when f.requester = auth.uid() then 'outgoing' else 'incoming' end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at;
$$;

-- Progress for you and your accepted friends: counts only, verified pack entries only. Never item titles or notes.
create or replace function public.friend_progress(p_pack text default 'gta6')
returns table (handle text, is_me boolean, cat text, done integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select auth.uid() as uid
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  )
  select p.handle,
         pe.uid = auth.uid(),
         ci.cat,
         count(*) filter (where ci.done)::integer,
         count(*)::integer
  from people pe
  join public.profiles p on p.id = pe.uid
  join public.checklist_items ci on ci.user_id = pe.uid and ci.pack = p_pack and ci.entry_id is not null
  where auth.uid() is not null
  group by p.handle, pe.uid, ci.cat;
$$;

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.friend_progress(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.friend_progress(text) to authenticated;
