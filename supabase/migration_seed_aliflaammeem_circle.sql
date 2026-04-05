-- One-time: put every member into Suhbah circle "AlifLaamMeem" (v1 single-circle model).
-- Run after migration_circles.sql.
--
-- Clears circle_members, ensures one circle named AlifLaamMeem, then adds all members.
-- Does not delete existing circles rows (preserves message FKs).

DELETE FROM public.circle_members;

INSERT INTO public.circles (name, created_by)
SELECT 'AlifLaamMeem', m.id
FROM public.members m
WHERE NOT EXISTS (SELECT 1 FROM public.circles WHERE name = 'AlifLaamMeem')
ORDER BY m.created_at ASC NULLS LAST
LIMIT 1;

INSERT INTO public.circle_members (circle_id, member_id, role)
SELECT c.id, m.id,
  CASE WHEN m.id = c.created_by THEN 'owner' ELSE 'member' END
FROM (
  SELECT id, created_by FROM public.circles WHERE name = 'AlifLaamMeem' ORDER BY created_at ASC LIMIT 1
) c
CROSS JOIN public.members m;
