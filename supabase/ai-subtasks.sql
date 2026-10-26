-- Optional, separately approved setup. No ToDo, Auth, Storage or existing policy changes.
-- Service-only durable counters; never store titles, candidate text or tokens.
begin;
create table if not exists public.todo_ai_quotas (
  user_id uuid primary key,
  minute_start timestamptz not null,
  minute_count integer not null check (minute_count between 1 and 3),
  day_start timestamptz not null,
  day_count integer not null check (day_count between 1 and 20)
);
alter table public.todo_ai_quotas enable row level security;
revoke all on public.todo_ai_quotas from public, anon, authenticated;
grant select, insert, update on public.todo_ai_quotas to service_role;

create or replace function public.todo_ai_consume_quota(p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  minute_now timestamptz := date_trunc('minute', statement_timestamp());
  day_now timestamptz := date_trunc('day', statement_timestamp() at time zone 'UTC') at time zone 'UTC';
  accepted uuid;
begin
  if current_user <> 'service_role' or p_user_id is null then
    raise insufficient_privilege;
  end if;
  insert into public.todo_ai_quotas as q (user_id, minute_start, minute_count, day_start, day_count)
  values (p_user_id, minute_now, 1, day_now, 1)
  on conflict (user_id) do update
    set minute_start = minute_now,
        minute_count = case when q.minute_start = minute_now then q.minute_count + 1 else 1 end,
        day_start = day_now,
        day_count = case when q.day_start = day_now then q.day_count + 1 else 1 end
    -- Reject delayed statements from older buckets; never rewind a counter.
    where q.minute_start <= minute_now and q.day_start <= day_now
      and (q.minute_start <> minute_now or q.minute_count < 3)
      and (q.day_start <> day_now or q.day_count < 20)
  returning user_id into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.todo_ai_consume_quota(uuid) from public, anon, authenticated;
grant execute on function public.todo_ai_consume_quota(uuid) to service_role;
commit;
