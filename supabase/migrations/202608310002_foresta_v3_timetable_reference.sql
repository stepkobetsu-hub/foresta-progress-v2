create table if not exists public.foresta_v3_enrollments (
 student_id text primary key, student_name text not null default '', subjects text[] not null,
 english_level text, math_level text, source_row integer not null, source_hash text not null,
 synced_at timestamptz not null default now(), check(cardinality(subjects)>0)
);
create index if not exists foresta_v3_enrollments_subjects on public.foresta_v3_enrollments using gin(subjects);
create table if not exists public.foresta_v3_sync_status (
 sync_name text primary key, status text not null check(status in ('never','running','success','failed')),
 last_started_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz,
 row_count integer not null default 0, attempt_count integer not null default 0,
 next_retry_at timestamptz, last_error text, details jsonb not null default '{}'
);
insert into public.foresta_v3_sync_status(sync_name,status) values('timetable','never') on conflict do nothing;
alter table public.foresta_v3_enrollments enable row level security;
alter table public.foresta_v3_sync_status enable row level security;
create or replace function public.foresta_v3_replace_enrollments(rows jsonb, audit jsonb default '{}') returns integer
language plpgsql security definer set search_path=public as $$
declare n integer; bad1180 boolean;
begin
 if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows)=0 then raise exception 'EMPTY_TIMETABLE_EXPORT'; end if;
 create temporary table incoming on commit drop as
 select student_id, coalesce(student_name,'') student_name, subjects, english_level, math_level, source_row, source_hash
 from jsonb_to_recordset(rows) as x(student_id text,student_name text,subjects text[],english_level text,math_level text,source_row integer,source_hash text);
 if exists(select 1 from incoming where student_id is null or student_id='' or cardinality(subjects)=0) then raise exception 'INVALID_TIMETABLE_ROW'; end if;
 select not(subjects @> array['算数','国語']) into bad1180 from incoming where student_id='1180';
 if bad1180 is null or bad1180 then raise exception 'STUDENT_1180_SUBJECT_INVARIANT'; end if;
 select count(*) into n from incoming;
 -- Replacement occurs in one transaction: any error preserves the last-known-good table.
 delete from public.foresta_v3_enrollments;
 insert into public.foresta_v3_enrollments(student_id,student_name,subjects,english_level,math_level,source_row,source_hash)
 select distinct on(student_id) student_id,student_name,subjects,english_level,math_level,source_row,source_hash from incoming order by student_id,source_row desc;
 update public.foresta_v3_sync_status set status='success',last_success_at=now(),row_count=n,next_retry_at=null,last_error=null,
  details=audit || jsonb_build_object('elementary_missing_multiple_subjects',(select coalesce(jsonb_agg(student_id),'[]') from incoming where subjects && array['国語','算数'] and cardinality(subjects)<2))
 where sync_name='timetable';
 return n;
end $$;
revoke all on function public.foresta_v3_replace_enrollments(jsonb,jsonb) from public,anon,authenticated;
