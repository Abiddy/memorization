-- Onboarding flag + per-member goals (run in Supabase SQL Editor)

alter table public.members
  add column if not exists onboarding_completed_at timestamptz;

-- One-time after deploy (marks everyone who already had an account — skip for fresh dev DBs):
-- update public.members set onboarding_completed_at = now() where onboarding_completed_at is null;

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

alter table public.member_goals enable row level security;

create policy "member_goals_select_anon"
  on public.member_goals for select to anon using (true);

-- If Realtime is enabled for your project, run once (ignore error if already added):
-- alter publication supabase_realtime add table public.member_goals;
