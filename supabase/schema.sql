-- Alif Laam Meem — run in Supabase SQL Editor (or migrate via CLI)

create extension if not exists "pgcrypto";

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  username text,
  password_hash text,
  memorized_surah_ids int[] not null default '{}',
  created_at timestamptz not null default now(),
  onboarding_completed_at timestamptz,
  constraint display_name_nonempty check (char_length(trim(display_name)) > 0)
);

create unique index if not exists members_display_name_lower_idx
  on public.members (lower(trim(display_name)));

create unique index if not exists members_username_lower_idx
  on public.members (lower(trim(username)))
  where username is not null and trim(username) <> '';

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token uuid not null default gen_random_uuid() unique,
  created_by uuid not null references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint circles_name_nonempty check (char_length(trim(name)) > 0)
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, member_id)
);

create unique index if not exists circle_members_one_circle_per_member_idx
  on public.circle_members (member_id);

create index if not exists circle_members_circle_idx on public.circle_members (circle_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id) on delete set null,
  display_name text not null,
  body text not null,
  circle_id uuid references public.circles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  event_kind text not null default 'completed' check (event_kind in ('completed', 'memorizing', 'revising', 'reciting')),
  juz integer check (juz is null or (juz >= 1 and juz <= 30)),
  surah text,
  summary text,
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_circle_created_idx on public.messages (circle_id, created_at desc);
create index if not exists progress_events_member_idx on public.progress_events (member_id, created_at desc);

create table if not exists public.member_progress (
  member_id uuid primary key references public.members (id) on delete cascade,
  memorizing_surahs int[] not null default '{}',
  revising_surahs int[] not null default '{}',
  reciting_surahs int[] not null default '{}',
  completed_memorizing_surahs int[] not null default '{}',
  completed_revising_surahs int[] not null default '{}',
  completed_reciting_surahs int[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists member_progress_updated_idx on public.member_progress (updated_at desc);

create table if not exists public.member_goals (
  member_id uuid primary key references public.members (id) on delete cascade,
  memorize_target_end date not null,
  revise_target_end date not null,
  recite_target_end date not null,
  memorizing_surah_ids int[] not null default '{}',
  revising_surah_ids int[] not null default '{}',
  reciting_surah_ids int[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists member_goals_updated_idx on public.member_goals (updated_at desc);

alter table public.members enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.messages enable row level security;
alter table public.progress_events enable row level security;
alter table public.member_progress enable row level security;
alter table public.member_goals enable row level security;

-- Browser (anon key): read-only. Writes go through Next.js API using the service role.
create policy "members_select_anon" on public.members for select to anon using (true);
create policy "circles_select_anon" on public.circles for select to anon using (true);
create policy "circle_members_select_anon" on public.circle_members for select to anon using (true);
create policy "messages_select_anon" on public.messages for select to anon using (true);
create policy "progress_events_select_anon" on public.progress_events for select to anon using (true);
create policy "member_progress_select_anon" on public.member_progress for select to anon using (true);
create policy "member_goals_select_anon" on public.member_goals for select to anon using (true);

-- Realtime: expose inserts to subscribers (anon can listen if you enable Realtime for these tables)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.progress_events;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.member_progress;
alter publication supabase_realtime add table public.member_goals;
