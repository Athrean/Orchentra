-- Web onboarding schema: GitHub App installs + repo subscriptions + step state.
-- Applied by `bun run db:reset` (local stack) or `bun run db:push` (remote).
-- Web-owned. The server keeps its own `github_installations` table; this is
-- the user-scoped projection consumed by the web product surface.

-- ============================================================================
-- user_installations: one row per (user, GH App installation). Populated by
-- the install callback at /api/github/install-callback after a successful
-- GH App install. Read by the onboarding flow + dashboard scoping.
-- ============================================================================
create table if not exists public.user_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  permissions jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suspended_at timestamptz,
  constraint user_installations_user_installation_key unique (user_id, installation_id)
);

create index if not exists user_installations_user_id_idx on public.user_installations(user_id);
create index if not exists user_installations_installation_id_idx on public.user_installations(installation_id);

drop trigger if exists user_installations_touch_updated_at on public.user_installations;
create trigger user_installations_touch_updated_at
  before update on public.user_installations
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- repo_subscriptions: per-user opt-in list of repos to surface in the
-- dashboard. Subset of the repos GH selected for the installation.
-- ============================================================================
create table if not exists public.repo_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id bigint not null,
  repo_full_name text not null,
  repo_id bigint,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repo_subscriptions_user_repo_key unique (user_id, repo_full_name)
);

create index if not exists repo_subscriptions_user_id_idx on public.repo_subscriptions(user_id);
create index if not exists repo_subscriptions_installation_id_idx on public.repo_subscriptions(installation_id);
create index if not exists repo_subscriptions_enabled_idx on public.repo_subscriptions(user_id, enabled);

drop trigger if exists repo_subscriptions_touch_updated_at on public.repo_subscriptions;
create trigger repo_subscriptions_touch_updated_at
  before update on public.repo_subscriptions
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- onboarding_state: resumable wizard state. One row per user, created lazily
-- on first /onboarding visit.
-- ============================================================================
create table if not exists public.onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  step text not null default 'welcome' check (step in ('welcome', 'install_app', 'select_repos', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists onboarding_state_touch_updated_at on public.onboarding_state;
create trigger onboarding_state_touch_updated_at
  before update on public.onboarding_state
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security.
-- ============================================================================
alter table public.user_installations enable row level security;
alter table public.repo_subscriptions enable row level security;
alter table public.onboarding_state enable row level security;

drop policy if exists "user_installations_select_own" on public.user_installations;
create policy "user_installations_select_own"
  on public.user_installations for select
  using (auth.uid() = user_id);

drop policy if exists "user_installations_insert_own" on public.user_installations;
create policy "user_installations_insert_own"
  on public.user_installations for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_installations_update_own" on public.user_installations;
create policy "user_installations_update_own"
  on public.user_installations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_installations_delete_own" on public.user_installations;
create policy "user_installations_delete_own"
  on public.user_installations for delete
  using (auth.uid() = user_id);

drop policy if exists "repo_subscriptions_select_own" on public.repo_subscriptions;
create policy "repo_subscriptions_select_own"
  on public.repo_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "repo_subscriptions_insert_own" on public.repo_subscriptions;
create policy "repo_subscriptions_insert_own"
  on public.repo_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "repo_subscriptions_update_own" on public.repo_subscriptions;
create policy "repo_subscriptions_update_own"
  on public.repo_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "repo_subscriptions_delete_own" on public.repo_subscriptions;
create policy "repo_subscriptions_delete_own"
  on public.repo_subscriptions for delete
  using (auth.uid() = user_id);

drop policy if exists "onboarding_state_select_own" on public.onboarding_state;
create policy "onboarding_state_select_own"
  on public.onboarding_state for select
  using (auth.uid() = user_id);

drop policy if exists "onboarding_state_insert_own" on public.onboarding_state;
create policy "onboarding_state_insert_own"
  on public.onboarding_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "onboarding_state_update_own" on public.onboarding_state;
create policy "onboarding_state_update_own"
  on public.onboarding_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "onboarding_state_delete_own" on public.onboarding_state;
create policy "onboarding_state_delete_own"
  on public.onboarding_state for delete
  using (auth.uid() = user_id);
