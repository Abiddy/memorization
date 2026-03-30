-- Run in Supabase SQL Editor (existing projects)

create table if not exists public.member_progress (
  member_id uuid primary key references public.members (id) on delete cascade,
  activity text not null check (activity in ('memorizing', 'revising')),
  active_juz int not null check (active_juz >= 1 and active_juz <= 30),
  surahs_selected int[] not null default '{}',
  pct_active_juz numeric(6, 1) not null,
  updated_at timestamptz not null default now()
);

create index if not exists member_progress_updated_idx on public.member_progress (updated_at desc);

alter table public.member_progress enable row level security;

create policy "member_progress_select_anon"
  on public.member_progress for select to anon using (true);

alter publication supabase_realtime add table public.member_progress;
