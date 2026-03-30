-- Alif Laam Meem — run in Supabase SQL Editor (or migrate via CLI)

create extension if not exists "pgcrypto";

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint display_name_nonempty check (char_length(trim(display_name)) > 0)
);

create unique index if not exists members_display_name_lower_idx
  on public.members (lower(trim(display_name)));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id) on delete set null,
  display_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  event_kind text not null default 'completed' check (event_kind in ('completed', 'memorizing', 'revising')),
  juz integer check (juz is null or (juz >= 1 and juz <= 30)),
  surah text,
  summary text,
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists progress_events_member_idx on public.progress_events (member_id, created_at desc);

create table if not exists public.member_progress (
  member_id uuid primary key references public.members (id) on delete cascade,
  activity text not null check (activity in ('memorizing', 'revising')),
  active_juz int not null check (active_juz >= 1 and active_juz <= 30),
  surahs_selected int[] not null default '{}',
  pct_active_juz numeric(6, 1) not null,
  updated_at timestamptz not null default now()
);

create index if not exists member_progress_updated_idx on public.member_progress (updated_at desc);

alter table public.members enable row level security;
alter table public.messages enable row level security;
alter table public.progress_events enable row level security;
alter table public.member_progress enable row level security;

-- Browser (anon key): read-only. Writes go through Next.js API using the service role.
create policy "members_select_anon" on public.members for select to anon using (true);
create policy "messages_select_anon" on public.messages for select to anon using (true);
create policy "progress_events_select_anon" on public.progress_events for select to anon using (true);
create policy "member_progress_select_anon" on public.member_progress for select to anon using (true);

-- Realtime: expose inserts to subscribers (anon can listen if you enable Realtime for these tables)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.progress_events;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.member_progress;
