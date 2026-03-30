-- Run once in Supabase SQL Editor if you already applied the original schema.sql
-- (Fresh installs: use updated schema.sql instead — it includes event_kind.)

alter table public.progress_events
  add column if not exists event_kind text not null default 'completed';

alter table public.progress_events
  drop constraint if exists progress_events_event_kind_check;

alter table public.progress_events
  add constraint progress_events_event_kind_check
  check (event_kind in ('completed', 'memorizing', 'revising'));
