-- Add Reciting activity: progress_events kind + member_progress columns
-- Run once in Supabase SQL Editor.
-- If DROP CONSTRAINT fails, find the check name: 
--   select conname from pg_constraint where conrelid = 'public.progress_events'::regclass and contype = 'c';

alter table public.progress_events drop constraint if exists progress_events_event_kind_check;

alter table public.progress_events
  add constraint progress_events_event_kind_check
  check (event_kind in ('completed', 'memorizing', 'revising', 'reciting'));

alter table public.member_progress
  add column if not exists reciting_juz int,
  add column if not exists reciting_surahs int[] not null default '{}',
  add column if not exists reciting_pct_active_juz numeric(6, 1);
