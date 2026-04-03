-- Per-track goal deadlines (replaces single horizon + target_end).
-- Safe for: (a) DBs that ran migration_onboarding_goals.sql with horizon/target_end, or
-- (b) DBs already created from schema.sql with memorize_*_target_end only (no-ops / harmless).

alter table public.member_goals
  add column if not exists memorize_target_end date,
  add column if not exists revise_target_end date,
  add column if not exists recite_target_end date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_goals'
      and column_name = 'target_end'
  ) then
    update public.member_goals
    set
      memorize_target_end = coalesce(memorize_target_end, target_end),
      revise_target_end = coalesce(revise_target_end, target_end),
      recite_target_end = coalesce(recite_target_end, target_end)
    where target_end is not null;
  end if;
end $$;

update public.member_goals
set
  memorize_target_end = coalesce(memorize_target_end, current_date + 7),
  revise_target_end = coalesce(revise_target_end, current_date + 7),
  recite_target_end = coalesce(recite_target_end, current_date + 7)
where memorize_target_end is null
   or revise_target_end is null
   or recite_target_end is null;

alter table public.member_goals
  alter column memorize_target_end set not null,
  alter column revise_target_end set not null,
  alter column recite_target_end set not null;

alter table public.member_goals drop column if exists horizon;
alter table public.member_goals drop column if exists target_end;
