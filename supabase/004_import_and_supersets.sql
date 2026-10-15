-- Incremental migration. Requires the original schema and migration 002.
-- Does not delete existing data. Run before publishing the new frontend.
begin;
alter table public.workout_exercises add column if not exists superset_id uuid;
-- History must not require a live catalog entry (same design as migration 003).
do $$ declare fk record; begin
  for fk in select conname from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and confrelid='public.exercises'::regclass and contype='f'
  loop execute format('alter table public.workout_exercises drop constraint %I',fk.conname); end loop;
end $$;
-- Preserve the existing transaction/revision logic behind a wrapper.
do $$ begin
  if to_regprocedure('public.save_workout_v1_core(jsonb,integer,uuid)') is null then
    alter function public.save_workout(jsonb,integer,uuid) rename to save_workout_v1_core;
  end if;
  if to_regprocedure('public.list_workouts_v1_core()') is null then
    alter function public.list_workouts() rename to list_workouts_v1_core;
  end if;
end $$;
create or replace function public.save_workout(p_payload jsonb, p_expected integer, p_mutation uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare result integer; uid uuid := auth.uid(); wid uuid := (p_payload->>'id')::uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'exercises') with ordinality as x(value,n)
    where nullif(x.value->>'superset_id','') is not null
    group by x.value->>'superset_id'
    having count(*) >= 2 and max(x.n)-min(x.n)+1 <> count(*)
  ) then raise exception 'SUPERSET_MUST_BE_CONSECUTIVE'; end if;
  result := public.save_workout_v1_core(p_payload,p_expected,p_mutation);
  update public.workout_exercises e set superset_id=case
    when (select count(*) from jsonb_array_elements(p_payload->'exercises') as y(value)
          where y.value->>'superset_id'=x.value->>'superset_id') >= 2
    then nullif(x.value->>'superset_id','')::uuid else null end
  from jsonb_array_elements(p_payload->'exercises') as x(value)
  where e.id=(x.value->>'id')::uuid and e.workout_id=wid and e.user_id=uid;
  return result;
end $$;
create or replace function public.list_workouts()
returns table(payload jsonb, revision integer)
language sql stable security invoker set search_path='' as $$
  select jsonb_set(w.payload,'{exercises}',coalesce((
    select jsonb_agg(x.value || jsonb_build_object('superset_id',e.superset_id) order by x.n)
    from jsonb_array_elements(w.payload->'exercises') with ordinality as x(value,n)
    join public.workout_exercises e on e.id=(x.value->>'id')::uuid and e.user_id=(select auth.uid())
  ),'[]'::jsonb)),w.revision from public.list_workouts_v1_core() w;
$$;
create or replace function public.get_workout(p_id uuid)
returns table(payload jsonb, revision integer)
language sql stable security invoker set search_path='' as $$
  select x.payload,x.revision from public.list_workouts() x where (x.payload->>'id')::uuid=p_id;
$$;
revoke all on function public.save_workout(jsonb,integer,uuid) from public,anon;
revoke all on function public.list_workouts() from public,anon;
revoke all on function public.get_workout(uuid) from public,anon;
grant execute on function public.save_workout(jsonb,integer,uuid) to authenticated;
grant execute on function public.list_workouts() to authenticated;
grant execute on function public.get_workout(uuid) to authenticated;
-- The invoker wrapper needs permission to call the original invoker functions.
revoke all on function public.save_workout_v1_core(jsonb,integer,uuid) from public,anon;
revoke all on function public.list_workouts_v1_core() from public,anon;
grant execute on function public.save_workout_v1_core(jsonb,integer,uuid) to authenticated;
grant execute on function public.list_workouts_v1_core() to authenticated;

create table if not exists public.gym_import_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, fingerprint text not null, imported_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.gym_import_requests enable row level security;
revoke all on public.gym_import_requests from anon,authenticated;
grant select,insert on public.gym_import_requests to authenticated;
drop policy if exists owner_only on public.gym_import_requests;
create policy owner_only on public.gym_import_requests for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create or replace function public.import_gym_backup(p_request uuid,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  uid uuid := auth.uid(); fingerprint text := md5(p_data::text); previous text;
  v_row jsonb; item jsonb; wid uuid; expected integer; current_ex jsonb; current_rt jsonb;
  before_ex jsonb; before_rt jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request is null or p_data is null then raise exception 'INVALID_IMPORT'; end if;
  if octet_length(p_data::text)>52428800 then raise exception 'IMPORT_TOO_LARGE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,92841));
  select r.fingerprint into previous from public.gym_import_requests r where r.user_id=uid and r.request_id=p_request;
  if found then
    if previous <> fingerprint then raise exception 'IMPORT_REQUEST_CHANGED'; end if;
    return;
  end if;
  if jsonb_typeof(p_data->'exercises') is distinct from 'array'
    or jsonb_typeof(p_data->'routines') is distinct from 'array'
    or jsonb_typeof(p_data->'workouts') is distinct from 'array'
    or jsonb_typeof(p_data->'expected') is distinct from 'object'
    or jsonb_typeof(p_data#>'{catalog_before,exercises}') is distinct from 'array'
    or jsonb_typeof(p_data#>'{catalog_before,routines}') is distinct from 'array'
  then raise exception 'INVALID_IMPORT'; end if;
  if jsonb_array_length(p_data->'exercises')>2000 or jsonb_array_length(p_data->'routines')>1000
    or jsonb_array_length(p_data->'workouts')>5000 then raise exception 'IMPORT_TOO_LARGE'; end if;
  -- Lock existing catalog rows and reject changes since the preview was built.
  perform 1 from public.exercises where user_id=uid order by id for update;
  perform 1 from public.routines where user_id=uid order by id for update;
  select coalesce(jsonb_object_agg(e.id::text,to_jsonb(e)),'{}'::jsonb) into current_ex from public.exercises e where e.user_id=uid;
  select coalesce(jsonb_object_agg(r.id::text,to_jsonb(r)),'{}'::jsonb) into current_rt from public.routines r where r.user_id=uid;
  select coalesce(jsonb_object_agg(x.value->>'id',x.value),'{}'::jsonb) into before_ex from jsonb_array_elements(p_data#>'{catalog_before,exercises}') x(value);
  select coalesce(jsonb_object_agg(x.value->>'id',x.value),'{}'::jsonb) into before_rt from jsonb_array_elements(p_data#>'{catalog_before,routines}') x(value);
  if current_ex <> before_ex or current_rt <> before_rt then raise exception 'CATALOG_CHANGED_REOPEN_IMPORT'; end if;
  for v_row in select value from jsonb_array_elements(p_data->'exercises') loop
    if jsonb_typeof(v_row->'media') is distinct from 'array' or jsonb_typeof(v_row->'muscles') is distinct from 'array' then raise exception 'INVALID_EXERCISE'; end if;
    if exists(select 1 from jsonb_array_elements(v_row->'media') m(value)
      where m.value->>'type' not in ('image','video','link') or coalesce(m.value->>'url','') !~ '^https://') then raise exception 'INVALID_MEDIA'; end if;
    insert into public.exercises(id,user_id,name,muscle,muscles,equipment,description,media,archived)
    values((v_row->>'id')::uuid,uid,v_row->>'name',coalesce(v_row->>'muscle',''),
      array(select jsonb_array_elements_text(v_row->'muscles')),coalesce(v_row->>'equipment',''),
      coalesce(v_row->>'description',''),v_row->'media',coalesce((v_row->>'archived')::boolean,false))
    on conflict(id) do update set name=excluded.name,muscle=excluded.muscle,muscles=excluded.muscles,
      equipment=excluded.equipment,description=excluded.description,media=excluded.media,archived=excluded.archived;
  end loop;
  for v_row in select value from jsonb_array_elements(p_data->'routines') loop
    if jsonb_typeof(v_row->'items') is distinct from 'array' or jsonb_array_length(v_row->'items')>200 then raise exception 'INVALID_ROUTINE'; end if;
    for item in select value from jsonb_array_elements(v_row->'items') loop
      if not exists(select 1 from public.exercises e where e.id=(item->>'exercise_id')::uuid and e.user_id=uid)
        then raise exception 'ROUTINE_EXERCISE_NOT_FOUND'; end if;
      if (item->>'sets')::integer not between 1 and 100 or (item->>'reps')::integer not between 1 and 10000
        or (item->>'rest')::integer not between 0 and 3600 then raise exception 'INVALID_ROUTINE_TARGETS'; end if;
      perform nullif(item->>'superset_id','')::uuid;
    end loop;
    insert into public.routines(id,user_id,name,items,status,position)
    values((v_row->>'id')::uuid,uid,v_row->>'name',v_row->'items',v_row->>'status',(v_row->>'position')::integer)
    on conflict(id) do update set name=excluded.name,items=excluded.items,status=excluded.status,position=excluded.position;
  end loop;
  for v_row in select value from jsonb_array_elements(p_data->'workouts') loop
    wid := (v_row->>'id')::uuid;
    if not (p_data->'expected' ? wid::text) then raise exception 'MISSING_EXPECTED_REVISION'; end if;
    expected := (p_data->'expected'->>wid::text)::integer;
    -- Reuse the existing atomic workout save and revision conflict check.
    perform public.save_workout(v_row,expected,gen_random_uuid());
  end loop;
  insert into public.gym_import_requests(user_id,request_id,fingerprint) values(uid,p_request,fingerprint);
end $$;
revoke all on function public.import_gym_backup(uuid,jsonb) from public,anon;
grant execute on function public.import_gym_backup(uuid,jsonb) to authenticated;
commit;
