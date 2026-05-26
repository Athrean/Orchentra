-- Web product schema: Supabase-Auth-scoped tables.
-- Applied by `bun run db:reset` (local stack) or `bun run db:push` (remote).
-- Canonical execution graph (executions, nodes, monitored_repos, ...) lives
-- in packages/db and is owned by the server. The web does NOT redefine those.

-- ============================================================================
-- profiles: one row per auth.users row, populated on first sign-in.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  github_username text,
  llm_provider text default 'anthropic',
  llm_key_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is inserted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, github_username)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'user_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Touch updated_at on UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- cli_installs: one row per (user, machine_id). CLI heartbeats refresh last_seen_at.
-- ============================================================================
create table if not exists public.cli_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  machine_id text not null,
  hostname text,
  os text,
  cli_version text,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now(),
  constraint cli_installs_user_machine_key unique (user_id, machine_id)
);

create index if not exists cli_installs_user_id_idx on public.cli_installs(user_id);

-- ============================================================================
-- Row Level Security.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.cli_installs enable row level security;

-- profiles: owner can read/update own row. Insert is handled by the trigger.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- cli_installs: owner can read/write own devices.
drop policy if exists "cli_installs_select_own" on public.cli_installs;
create policy "cli_installs_select_own"
  on public.cli_installs for select
  using (auth.uid() = user_id);

drop policy if exists "cli_installs_insert_own" on public.cli_installs;
create policy "cli_installs_insert_own"
  on public.cli_installs for insert
  with check (auth.uid() = user_id);

drop policy if exists "cli_installs_update_own" on public.cli_installs;
create policy "cli_installs_update_own"
  on public.cli_installs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cli_installs_delete_own" on public.cli_installs;
create policy "cli_installs_delete_own"
  on public.cli_installs for delete
  using (auth.uid() = user_id);
