-- =========================================================
-- DayFlow — database for user accounts (Supabase)
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again (it skips what already exists).
-- =========================================================

-- One row per task. `data` holds the whole task exactly as the app stores it,
-- so the app's normalize() stays the only place that defines a task.
create table if not exists public.tasks (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  deleted    boolean     not null default false, -- kept so other devices learn about deletions
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists tasks_user_updated on public.tasks (user_id, updated_at);

-- Per-user settings (when the day starts and ends, overlap questions).
create table if not exists public.user_settings (
  user_id    uuid        primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- The server's clock stamps every write, so devices can ask "what changed since…".
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before insert or update on public.user_settings
  for each row execute function public.touch_updated_at();

-- Row-level security: every person can only see and change their own rows.
alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- "Delete account" in the app (required by the App Store). Removes the login;
-- the cascades above remove the person's tasks and settings.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
