-- Run in Supabase SQL Editor so new sign-ups appear in the member avatar stack without refresh.
alter publication supabase_realtime add table public.members;
