-- Legacy V3 materialized tables are retained for rollback/reference only.
-- Keep them inaccessible to browser clients; Edge Functions use service_role.
alter table public.foresta_v3_dashboard_snapshots enable row level security;
alter table public.foresta_v3_progression_snapshots enable row level security;
alter table public.foresta_v3_reference_snapshots enable row level security;
alter table public.foresta_v3_metrics enable row level security;

revoke all on table
  public.foresta_v3_dashboard_snapshots,
  public.foresta_v3_progression_snapshots,
  public.foresta_v3_reference_snapshots,
  public.foresta_v3_metrics
from anon, authenticated;
