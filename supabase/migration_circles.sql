-- Suhbah circles: one membership per member (v1). Run after schema.sql.

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

alter table public.messages
  add column if not exists circle_id uuid references public.circles (id) on delete cascade;

create index if not exists messages_circle_created_idx on public.messages (circle_id, created_at desc);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

create policy "circles_select_anon" on public.circles for select to anon using (true);
create policy "circle_members_select_anon" on public.circle_members for select to anon using (true);

-- Optional: enable Realtime for circles (run if your project does not already include these tables)
-- alter publication supabase_realtime add table public.circles;
-- alter publication supabase_realtime add table public.circle_members;
