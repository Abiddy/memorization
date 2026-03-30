-- Dual track: memorising + revising independently; memorising uses one surah.
-- Run in Supabase SQL Editor once.

alter table public.member_progress
  add column if not exists memorizing_juz int,
  add column if not exists memorizing_surah int,
  add column if not exists memorizing_pct_active_juz numeric(6, 1),
  add column if not exists revising_juz int,
  add column if not exists revising_surahs int[] default '{}',
  add column if not exists revising_pct_active_juz numeric(6, 1);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_progress' and column_name = 'activity'
  ) then
    update public.member_progress set
      memorizing_juz = case when activity = 'memorizing' then active_juz else null end,
      memorizing_surah = case
        when activity = 'memorizing' and surahs_selected is not null and cardinality(surahs_selected) >= 1
        then surahs_selected[1]
        else null
      end,
      memorizing_pct_active_juz = case when activity = 'memorizing' then pct_active_juz else null end,
      revising_juz = case when activity = 'revising' then active_juz else null end,
      revising_surahs = case when activity = 'revising' then coalesce(surahs_selected, '{}') else '{}' end,
      revising_pct_active_juz = case when activity = 'revising' then pct_active_juz else null end;
  end if;
end $$;

alter table public.member_progress
  drop column if exists activity,
  drop column if exists active_juz,
  drop column if exists surahs_selected,
  drop column if exists pct_active_juz;
