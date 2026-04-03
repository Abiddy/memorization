-- Log surahs completed from My goals ("Alhamdulillah") — shown on Focus before % Quran.

alter table public.member_progress
  add column if not exists completed_memorizing_surahs int[] not null default '{}',
  add column if not exists completed_revising_surahs int[] not null default '{}',
  add column if not exists completed_reciting_surahs int[] not null default '{}';
