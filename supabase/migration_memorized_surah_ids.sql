-- Run in Supabase SQL Editor: cumulative surahs marked as memorised (from "I am…" memorising posts)

alter table public.members
  add column if not exists memorized_surah_ids int[] not null default '{}';
