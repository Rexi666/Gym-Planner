-- Run once in the SQL Editor of a NEW Supabase project.
-- All private rows are owned by auth.uid(); RPCs run with caller permissions.
begin;
create table public.exercises (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  muscle text not null default '', equipment text not null default '',
  description text not null default '', media jsonb not null default '[]' check (jsonb_typeof(media) = 'array'),
  archived boolean not null default false, unique(id, user_id)
);
create table public.routines (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array')
);
create table public.workouts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  started_at timestamptz not null, ended_at timestamptz,
  status text not null check (status in ('active','completed')), notes text not null default '',
  revision integer not null default 0, last_mutation uuid,
  unique(id, user_id),
  check ((status = 'active' and ended_at is null) or (status = 'completed' and ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
create table public.workout_exercises (
  id uuid primary key, workout_id uuid not null, user_id uuid not null,
  exercise_id uuid not null, name text not null, position integer not null check(position >= 0),
  notes text not null default '', rest integer not null default 90 check(rest between 0 and 3600),
  foreign key(workout_id,user_id) references public.workouts(id,user_id) on delete cascade,
  foreign key(exercise_id,user_id) references public.exercises(id,user_id),
  unique(id,user_id), unique(workout_id,position)
);
create table public.workout_sets (
  id uuid primary key, workout_exercise_id uuid not null, user_id uuid not null,
  position integer not null check(position >= 0), reps text not null default '', weight text not null default '',
  done boolean not null default false, warmup boolean not null default false,
  foreign key(workout_exercise_id,user_id) references public.workout_exercises(id,user_id) on delete cascade,
  unique(workout_exercise_id,position),
  check (not done or (reps ~ '^[0-9]+$' and weight ~ '^[0-9]+([.][0-9]+)?$')),
  check (case when done then reps::numeric between 1 and 10000 and weight::numeric between 0 and 10000 else true end)
);
create index exercises_owner on public.exercises(user_id);
create index routines_owner on public.routines(user_id);
create index workouts_owner_date on public.workouts(user_id,started_at desc);
create index workout_exercises_parent on public.workout_exercises(workout_id);
create index workout_sets_parent on public.workout_sets(workout_exercise_id);
-- Explicit grants and RLS on every exposed table.
do $$ declare t text; begin
  foreach t in array array['exercises','routines','workouts','workout_exercises','workout_sets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('create policy owner_only on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  end loop;
end $$;
create or replace function public.save_workout(p_payload jsonb, p_expected integer, p_mutation uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid(); wid uuid := (p_payload->>'id')::uuid;
  current_row public.workouts%rowtype; ex jsonb; sr jsonb; ep integer := 0; sp integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mutation is null or p_expected is null or p_expected < 0 then raise exception 'INVALID_REVISION'; end if;
  if jsonb_typeof(p_payload->'exercises') is distinct from 'array' then raise exception 'INVALID_EXERCISES'; end if;
  if jsonb_array_length(p_payload->'exercises') > 200 then raise exception 'TOO_MANY_EXERCISES'; end if;
  insert into public.workouts(id,user_id,name,started_at,ended_at,status,notes)
  values(wid,uid,p_payload->>'name',(p_payload->>'started_at')::timestamptz,
    (p_payload->>'ended_at')::timestamptz,p_payload->>'status',coalesce(p_payload->>'notes',''))
  on conflict(id) do nothing;
  select * into current_row from public.workouts where id=wid and user_id=uid for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if current_row.last_mutation = p_mutation then return current_row.revision; end if;
  if current_row.revision <> p_expected then raise exception 'REVISION_CONFLICT'; end if;
  update public.workouts set name=p_payload->>'name', started_at=(p_payload->>'started_at')::timestamptz,
    ended_at=(p_payload->>'ended_at')::timestamptz,status=p_payload->>'status',notes=coalesce(p_payload->>'notes',''),
    revision=revision+1,last_mutation=p_mutation where id=wid;
  delete from public.workout_exercises where workout_id=wid;
  for ex in select value from jsonb_array_elements(p_payload->'exercises') loop
    insert into public.workout_exercises(id,workout_id,user_id,exercise_id,name,position,notes,rest)
    values((ex->>'id')::uuid,wid,uid,(ex->>'exercise_id')::uuid,ex->>'name',ep,coalesce(ex->>'notes',''),(ex->>'rest')::integer);
    ep := ep+1; sp := 0;
    if jsonb_typeof(ex->'sets') is distinct from 'array' then raise exception 'INVALID_SETS'; end if;
    if jsonb_array_length(ex->'sets') > 200 then raise exception 'TOO_MANY_SETS'; end if;
    for sr in select value from jsonb_array_elements(ex->'sets') loop
      insert into public.workout_sets(id,workout_exercise_id,user_id,position,reps,weight,done,warmup)
      values((sr->>'id')::uuid,(ex->>'id')::uuid,uid,sp,coalesce(sr->>'reps',''),coalesce(sr->>'weight',''),
        coalesce((sr->>'done')::boolean,false),coalesce((sr->>'warmup')::boolean,false));
      sp := sp+1;
    end loop;
  end loop;
  return current_row.revision+1;
end $$;
create or replace function public.list_workouts()
returns table(payload jsonb, revision integer)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id',w.id,'name',w.name,'started_at',w.started_at,'ended_at',w.ended_at,
    'status',w.status,'notes',w.notes,'exercises',coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'exercise_id',e.exercise_id,'name',e.name,
        'notes',e.notes,'rest',e.rest,'sets',coalesce((
          select jsonb_agg(jsonb_build_object('id',s.id,'reps',s.reps,'weight',s.weight,'done',s.done,'warmup',s.warmup) order by s.position)
          from public.workout_sets s where s.workout_exercise_id=e.id
        ),'[]'::jsonb)) order by e.position)
      from public.workout_exercises e where e.workout_id=w.id
    ),'[]'::jsonb)), w.revision
  from public.workouts w where w.user_id=(select auth.uid()) order by w.started_at desc;
$$;
create or replace function public.get_workout(p_id uuid)
returns table(payload jsonb, revision integer)
language sql stable security invoker set search_path = '' as $$
  select x.payload,x.revision from public.list_workouts() x where (x.payload->>'id')::uuid=p_id;
$$;
revoke all on function public.save_workout(jsonb,integer,uuid) from public, anon;
revoke all on function public.list_workouts() from public, anon;
revoke all on function public.get_workout(uuid) from public, anon;
grant execute on function public.save_workout(jsonb,integer,uuid) to authenticated;
grant execute on function public.list_workouts() to authenticated;
grant execute on function public.get_workout(uuid) to authenticated;
commit;
