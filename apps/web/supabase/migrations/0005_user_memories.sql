-- User-scoped memory store: learnings the assistant saves (errors + fixes,
-- repo patterns, engineer preferences) and recalls later to reduce repeated work.

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repo text,
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  last_recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_memories_user_id_idx on public.user_memories(user_id);
create index if not exists user_memories_user_repo_idx on public.user_memories(user_id, repo);

drop trigger if exists user_memories_touch_updated_at on public.user_memories;
create trigger user_memories_touch_updated_at
  before update on public.user_memories
  for each row execute function public.touch_updated_at();

alter table public.user_memories enable row level security;

drop policy if exists "user_memories_all_own" on public.user_memories;
create policy "user_memories_all_own"
  on public.user_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
