-- Username + password auth for members (run after schema.sql)
alter table public.members
  add column if not exists username text,
  add column if not exists password_hash text;

create unique index if not exists members_username_lower_idx
  on public.members (lower(trim(username)))
  where username is not null and trim(username) <> '';

comment on column public.members.username is 'Login handle; unique case-insensitive when set.';
comment on column public.members.password_hash is 'scrypt hash from lib/password.ts; never expose to client.';
