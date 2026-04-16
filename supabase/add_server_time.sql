-- Run this in Supabase SQL Editor to add the server time function
-- needed for synchronized timer

create or replace function public.get_server_time()
returns timestamptz
language sql
security definer
as $$
  select now();
$$;
