-- Multiple surahs for memorising (replaces single memorizing_surah).
-- Run once in Supabase SQL Editor.

alter table public.member_progress
  add column if not exists memorizing_surahs int[] not null default '{}';

update public.member_progress
set memorizing_surahs = array[memorizing_surah]
where memorizing_surah is not null;

alter table public.member_progress
  drop column if exists memorizing_surah;
