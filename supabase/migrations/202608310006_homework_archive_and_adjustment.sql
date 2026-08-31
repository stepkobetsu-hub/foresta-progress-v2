-- Immediate V3 homework archive/restore/delete read-model consistency and
-- teacher-controlled next-homework visibility overrides.
create table if not exists public.foresta_v3_homework_overrides (
  homework_id text primary key,
  student_id text not null,
  subject text not null default '',
  hidden boolean not null default false,
  actor_id text not null default '',
  updated_at timestamptz not null default now(),
  item jsonb not null default '{}'::jsonb
);
create index if not exists foresta_v3_homework_overrides_student
  on public.foresta_v3_homework_overrides(student_id,subject,hidden);
alter table public.foresta_v3_homework_overrides enable row level security;
revoke all on table public.foresta_v3_homework_overrides from anon,authenticated;
grant select,insert,update,delete on table public.foresta_v3_homework_overrides to service_role;

create or replace function public.foresta_v3_apply_homework_snapshot_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare ids text[]; requested_count integer; found_count integer; dash jsonb; arch jsonb; active_items jsonb; archived_items jsonb; moved jsonb;
begin
  if new.action not in ('archiveHomework','restoreHomework','deleteHomework') then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.mutation_id::text));
  if exists(select 1 from public.foresta_v3_mutations where mutation_id=new.mutation_id) then return new; end if;
  select coalesce(array_agg(value),array[]::text[]) into ids from jsonb_array_elements_text(coalesce(new.payload->'request'->'homeworkIds','[]'::jsonb));
  requested_count:=coalesce(array_length(ids,1),0); if requested_count=0 then raise exception 'INVALID_HOMEWORK_IDS'; end if;
  select payload into dash from public.foresta_v3_snapshots where student_id=new.student_id and view='getStudentDashboard' and subject='' for update;
  if dash is null then raise exception 'SNAPSHOT_NOT_READY'; end if;
  insert into public.foresta_v3_snapshots(student_id,view,subject,payload,source_updated_at,updated_at)
  values(new.student_id,'getHomeworkArchive','',jsonb_build_object('student',dash->'student','homework','[]'::jsonb,'canDelete',true),now(),now())
  on conflict(student_id,view,subject) do nothing;
  select payload into arch from public.foresta_v3_snapshots where student_id=new.student_id and view='getHomeworkArchive' and subject='' for update;
  active_items:=coalesce(dash->'homework','[]'::jsonb); archived_items:=coalesce(arch->'homework','[]'::jsonb);
  if new.action='archiveHomework' then
    select count(*),coalesce(jsonb_agg(elem||jsonb_build_object('archived',true,'canArchive',false)),'[]'::jsonb) into found_count,moved
    from jsonb_array_elements(active_items) elem where elem->>'homeworkId'=any(ids) and coalesce(elem->>'completed','false')='true';
    if found_count<>requested_count then raise exception 'HOMEWORK_NOT_COMPLETE'; end if;
    select coalesce(jsonb_agg(elem),'[]'::jsonb) into active_items from jsonb_array_elements(active_items) elem where not(elem->>'homeworkId'=any(ids));
    archived_items:=moved||archived_items;
  elsif new.action='restoreHomework' then
    select count(*),coalesce(jsonb_agg(elem||jsonb_build_object('archived',false,'canArchive',true)),'[]'::jsonb) into found_count,moved
    from jsonb_array_elements(archived_items) elem where elem->>'homeworkId'=any(ids);
    if found_count<>requested_count then raise exception 'ARCHIVED_HOMEWORK_NOT_FOUND'; end if;
    select coalesce(jsonb_agg(elem),'[]'::jsonb) into archived_items from jsonb_array_elements(archived_items) elem where not(elem->>'homeworkId'=any(ids));
    active_items:=moved||active_items;
  else
    select count(*) into found_count from jsonb_array_elements(archived_items) elem where elem->>'homeworkId'=any(ids);
    if found_count<>requested_count then raise exception 'ARCHIVED_HOMEWORK_NOT_FOUND'; end if;
    select coalesce(jsonb_agg(elem),'[]'::jsonb) into archived_items from jsonb_array_elements(archived_items) elem where not(elem->>'homeworkId'=any(ids));
  end if;
  update public.foresta_v3_snapshots set payload=jsonb_set(dash,'{homework}',active_items,true),updated_at=now() where student_id=new.student_id and view='getStudentDashboard' and subject='';
  update public.foresta_v3_snapshots set payload=jsonb_set(arch,'{homework}',archived_items,true),updated_at=now() where student_id=new.student_id and view='getHomeworkArchive' and subject='';
  delete from public.foresta_v3_homework_overrides where student_id=new.student_id and homework_id=any(ids);
  return new;
end $$;
revoke all on function public.foresta_v3_apply_homework_snapshot_mutation() from public,anon,authenticated;
grant execute on function public.foresta_v3_apply_homework_snapshot_mutation() to service_role;
drop trigger if exists foresta_v3_homework_snapshot_before_queue on public.foresta_v3_mutations;
create trigger foresta_v3_homework_snapshot_before_queue before insert on public.foresta_v3_mutations for each row execute function public.foresta_v3_apply_homework_snapshot_mutation();

create or replace function public.foresta_v3_filter_hidden_homework_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
declare hidden_ids text[];
begin
  if new.view<>'getStudentDashboard' or new.student_id='__global__' then return new; end if;
  select coalesce(array_agg(homework_id),array[]::text[]) into hidden_ids from public.foresta_v3_homework_overrides where student_id=new.student_id and hidden=true;
  if coalesce(array_length(hidden_ids,1),0)>0 then
    new.payload:=jsonb_set(new.payload,'{homework}',coalesce((select jsonb_agg(elem) from jsonb_array_elements(coalesce(new.payload->'homework','[]'::jsonb)) elem where not(elem->>'homeworkId'=any(hidden_ids))),'[]'::jsonb),true);
  end if;
  return new;
end $$;
drop trigger if exists foresta_v3_filter_hidden_homework_on_snapshot on public.foresta_v3_snapshots;
create trigger foresta_v3_filter_hidden_homework_on_snapshot before insert or update on public.foresta_v3_snapshots for each row execute function public.foresta_v3_filter_hidden_homework_snapshot();

create or replace function public.foresta_v3_adjust_homework_visibility(p_student_id text,p_subject text,p_all_ids text[],p_keep_ids text[],p_actor_id text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare dash jsonb; active_items jsonb; hid text; one_item jsonb; is_keep boolean; hidden_count integer:=0; restored_count integer:=0;
begin
  select payload into dash from public.foresta_v3_snapshots where student_id=p_student_id and view='getStudentDashboard' and subject='' for update;
  if dash is null then raise exception 'SNAPSHOT_NOT_READY'; end if;
  active_items:=coalesce(dash->'homework','[]'::jsonb);
  foreach hid in array coalesce(p_all_ids,array[]::text[]) loop
    one_item:=null;
    select elem into one_item from jsonb_array_elements(active_items) elem where elem->>'homeworkId'=hid limit 1;
    if one_item is null then select item into one_item from public.foresta_v3_homework_overrides where homework_id=hid and student_id=p_student_id and hidden=true; end if;
    if one_item is null or coalesce(one_item->>'subject','')<>p_subject or coalesce(one_item->>'source','')<>'teacher' or coalesce(one_item->>'archived','false')='true' then raise exception 'HOMEWORK_NOT_ADJUSTABLE'; end if;
    is_keep:=hid=any(coalesce(p_keep_ids,array[]::text[]));
    if is_keep then
      if not exists(select 1 from jsonb_array_elements(active_items) elem where elem->>'homeworkId'=hid) then active_items:=active_items||jsonb_build_array(one_item||jsonb_build_object('adjustedHidden',false)); restored_count:=restored_count+1; end if;
      delete from public.foresta_v3_homework_overrides where homework_id=hid and student_id=p_student_id;
    else
      insert into public.foresta_v3_homework_overrides(homework_id,student_id,subject,hidden,actor_id,item,updated_at)
      values(hid,p_student_id,p_subject,true,p_actor_id,one_item,now()) on conflict(homework_id) do update set student_id=excluded.student_id,subject=excluded.subject,hidden=true,actor_id=excluded.actor_id,item=excluded.item,updated_at=now();
      select coalesce(jsonb_agg(elem),'[]'::jsonb) into active_items from jsonb_array_elements(active_items) elem where elem->>'homeworkId'<>hid;
      hidden_count:=hidden_count+1;
    end if;
  end loop;
  update public.foresta_v3_snapshots set payload=jsonb_set(dash,'{homework}',active_items,true),updated_at=now() where student_id=p_student_id and view='getStudentDashboard' and subject='';
  return jsonb_build_object('saved',true,'hiddenCount',hidden_count,'restoredCount',restored_count);
end $$;
revoke all on function public.foresta_v3_adjust_homework_visibility(text,text,text[],text[],text) from public,anon,authenticated;
grant execute on function public.foresta_v3_adjust_homework_visibility(text,text,text[],text[],text) to service_role;
