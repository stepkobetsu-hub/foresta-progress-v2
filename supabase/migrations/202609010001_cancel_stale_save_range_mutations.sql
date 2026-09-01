-- Deploy the GAS stale-saveRange guard before applying this migration.
alter table public.foresta_v3_mutations
  drop constraint if exists foresta_v3_mutations_status_check;

alter table public.foresta_v3_mutations
  add constraint foresta_v3_mutations_status_check
  check (status in ('accepted','applied','mirror_pending','mirrored','failed','cancelled_stale','SYNCED'));

update public.foresta_v3_mutations
set status = 'cancelled_stale',
    next_attempt_at = null,
    last_error = coalesce(last_error, 'cancelled: saveRange moved to synchronous durable storage'),
    updated_at = now()
where action = 'saveRange'
  and status in ('accepted','applied','mirror_pending','failed');
