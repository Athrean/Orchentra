-- Settings surfaces: project API keys, alert rules/history, notification prefs,
-- and avatar storage.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create table if not exists public.project_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists project_api_keys_user_id_idx on public.project_api_keys(user_id);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  signal text not null,
  comparator text not null,
  threshold text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_rules_user_id_idx on public.alert_rules(user_id);

drop trigger if exists alert_rules_touch_updated_at on public.alert_rules;
create trigger alert_rules_touch_updated_at
  before update on public.alert_rules
  for each row execute function public.touch_updated_at();

create table if not exists public.alert_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete set null,
  status text not null default 'recorded',
  message text not null,
  fired_at timestamptz not null default now()
);

create index if not exists alert_history_user_id_idx on public.alert_history(user_id);
create index if not exists alert_history_rule_id_idx on public.alert_history(rule_id);

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  slack_dm boolean not null default false,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_prefs_touch_updated_at on public.notification_prefs;
create trigger notification_prefs_touch_updated_at
  before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

alter table public.project_api_keys enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_history enable row level security;
alter table public.notification_prefs enable row level security;

drop policy if exists "project_api_keys_all_own" on public.project_api_keys;
create policy "project_api_keys_all_own"
  on public.project_api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "alert_rules_all_own" on public.alert_rules;
create policy "alert_rules_all_own"
  on public.alert_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "alert_history_all_own" on public.alert_history;
create policy "alert_history_all_own"
  on public.alert_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notification_prefs_all_own" on public.notification_prefs;
create policy "notification_prefs_all_own"
  on public.notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
