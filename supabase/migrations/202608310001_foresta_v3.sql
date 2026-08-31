-- Isolated Foresta V3 storage. Existing elementary and legacy objects are untouched.
create extension if not exists pgcrypto;
create table if not exists public.foresta_v3_sessions (
  token_hash text primary key check (length(token_hash)=64), profile jsonb not null,
  expires_at timestamptz not null, validated_at timestamptz not null default now()
);
-- Production may already contain the earlier V3 shape (user_id/role are NOT
-- NULL there). Keep every existing column and row, and add only the new field.
alter table public.foresta_v3_sessions
  add column if not exists validated_at timestamptz not null default now();
create table if not exists public.foresta_v3_snapshots (
  student_id text not null, view text not null, subject text not null default '', payload jsonb not null,
  source_updated_at timestamptz, updated_at timestamptz not null default now(), primary key(student_id,view,subject)
);
create index if not exists foresta_v3_snapshots_hot on public.foresta_v3_snapshots(student_id,view,subject,updated_at desc);
create table if not exists public.foresta_v3_entities (
  entity_type text not null, entity_id text not null, student_id text not null default '', subject text not null default '',
  event_date date, active boolean not null default true, payload jsonb not null, updated_at timestamptz not null default now(),
  primary key(entity_type,entity_id)
);
create index if not exists foresta_v3_entities_student on public.foresta_v3_entities(student_id,entity_type,subject,event_date desc);
create index if not exists foresta_v3_entities_active on public.foresta_v3_entities(student_id,entity_type,active) where active;
create table if not exists public.foresta_v3_mutations (
  mutation_id uuid primary key, action text not null, student_id text not null default '', payload jsonb not null,
  status text not null default 'accepted' check(status in ('accepted','applied','mirror_pending','mirrored','failed')),
  attempts integer not null default 0, next_attempt_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Upgrade the deployed queue in place before creating the retry index.
alter table public.foresta_v3_mutations
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text;
create index if not exists foresta_v3_mutations_retry on public.foresta_v3_mutations(status,next_attempt_at) where status in ('mirror_pending','failed');
create table if not exists public.foresta_v3_migrations (
  version text primary key, source_snapshot jsonb not null default '{}', import_counts jsonb not null default '{}',
  quarantine_count integer not null default 0, completed_at timestamptz
);
create table if not exists public.foresta_v3_quarantine (
  id bigint generated always as identity primary key, migration_version text not null, source_tab text not null,
  source_row integer, payload jsonb not null, reason text not null, created_at timestamptz not null default now()
);
alter table public.foresta_v3_sessions enable row level security;
alter table public.foresta_v3_snapshots enable row level security;
alter table public.foresta_v3_entities enable row level security;
alter table public.foresta_v3_mutations enable row level security;
alter table public.foresta_v3_migrations enable row level security;
alter table public.foresta_v3_quarantine enable row level security;
-- Deliberately no anon/authenticated policies: only service-role Edge Functions may access V3.
grant usage on schema public to service_role;
grant select,insert,update,delete on table
  public.foresta_v3_sessions,
  public.foresta_v3_snapshots,
  public.foresta_v3_entities,
  public.foresta_v3_mutations,
  public.foresta_v3_migrations,
  public.foresta_v3_quarantine
to service_role;
do $$
declare sequence_name text := pg_get_serial_sequence('public.foresta_v3_quarantine','id');
begin
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to service_role', sequence_name);
  end if;
end $$;
revoke all on table
  public.foresta_v3_sessions,
  public.foresta_v3_snapshots,
  public.foresta_v3_entities,
  public.foresta_v3_mutations,
  public.foresta_v3_migrations,
  public.foresta_v3_quarantine
from anon, authenticated;
