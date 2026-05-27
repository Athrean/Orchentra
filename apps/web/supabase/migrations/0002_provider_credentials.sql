-- Per-user AI provider credentials for Settings > AI Providers.

create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'openrouter')),
  api_key_ciphertext text not null,
  api_key_iv text not null,
  api_key_tag text not null,
  base_url text,
  default_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_credentials_user_provider_key unique (user_id, provider)
);

create index if not exists provider_credentials_user_id_idx on public.provider_credentials(user_id);

drop trigger if exists provider_credentials_touch_updated_at on public.provider_credentials;
create trigger provider_credentials_touch_updated_at
  before update on public.provider_credentials
  for each row execute function public.touch_updated_at();

alter table public.provider_credentials enable row level security;

drop policy if exists "provider_credentials_select_own" on public.provider_credentials;
create policy "provider_credentials_select_own"
  on public.provider_credentials for select
  using (auth.uid() = user_id);

drop policy if exists "provider_credentials_insert_own" on public.provider_credentials;
create policy "provider_credentials_insert_own"
  on public.provider_credentials for insert
  with check (auth.uid() = user_id);

drop policy if exists "provider_credentials_update_own" on public.provider_credentials;
create policy "provider_credentials_update_own"
  on public.provider_credentials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "provider_credentials_delete_own" on public.provider_credentials;
create policy "provider_credentials_delete_own"
  on public.provider_credentials for delete
  using (auth.uid() = user_id);
