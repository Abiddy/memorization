-- Surah-first progress: drop juz / % of juz columns (surah arrays are source of truth).
-- Run after prior member_progress migrations.

alter table public.member_progress
  drop column if exists memorizing_juz,
  drop column if exists memorizing_pct_active_juz,
  drop column if exists revising_juz,
  drop column if exists revising_pct_active_juz,
  drop column if exists reciting_juz,
  drop column if exists reciting_pct_active_juz;
