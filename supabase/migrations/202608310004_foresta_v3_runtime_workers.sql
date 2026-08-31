-- Complete the V3 read-model and durable mirror worker metadata.
alter table public.foresta_v3_sessions
  add column if not exists user_id text,
  add column if not exists role text,
  add column if not exists last_seen_at timestamptz;

update public.foresta_v3_sessions
set user_id = coalesce(nullif(user_id, ''), profile->>'studentId', profile->>'loginId', 'unknown'),
    role = coalesce(nullif(role, ''), profile->>'role', 'student'),
    last_seen_at = coalesce(last_seen_at, validated_at, now())
where user_id is null or user_id = '' or role is null or role = '' or last_seen_at is null;

alter table public.foresta_v3_mutations
  add column if not exists result jsonb not null default '{}',
  add column if not exists mirrored_at timestamptz;

drop index if exists public.foresta_v3_mutations_retry;
create index foresta_v3_mutations_retry
  on public.foresta_v3_mutations(status, next_attempt_at, created_at)
  where status in ('accepted', 'failed');

-- V3 remains service-role only; browser roles receive no direct table access.
revoke all on table public.foresta_v3_sessions, public.foresta_v3_snapshots, public.foresta_v3_mutations
from anon, authenticated;
grant select, insert, update, delete on table public.foresta_v3_sessions, public.foresta_v3_snapshots, public.foresta_v3_mutations
to service_role;
