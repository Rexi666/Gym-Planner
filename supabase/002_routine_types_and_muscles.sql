-- Incremental migration for the existing Gym Planner database.
-- Does not recreate tables or delete exercises, routines, sessions or sets.
begin;
alter table public.exercises add column if not exists muscles text[] not null default '{}';
alter table public.routines add column if not exists status text not null default 'active';
alter table public.routines add column if not exists position integer;
-- Preserve the old muscle field; populate the new list without guessing new groups.
update public.exercises e set muscles = coalesce((
  select array_agg(distinct trim(part)) from regexp_split_to_table(e.muscle, '[,;/+]|[[:space:]]+[yY][[:space:]]+') part
  where trim(part) <> ''
), '{}'::text[]) where cardinality(e.muscles) = 0 and trim(e.muscle) <> '';
-- Assign initial positions in the previous alphabetical order, per user.
with ranked as (
  select id, (row_number() over (partition by user_id order by name,id) - 1)::integer as n
  from public.routines
)
update public.routines r set position = ranked.n from ranked where r.id=ranked.id and r.position is null;
alter table public.routines alter column position set default 0;
alter table public.routines alter column position set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='routines_status_allowed' and conrelid='public.routines'::regclass) then
    alter table public.routines add constraint routines_status_allowed check(status in ('active','draft','discarded'));
  end if;
  if not exists (select 1 from pg_constraint where conname='routines_position_nonnegative' and conrelid='public.routines'::regclass) then
    alter table public.routines add constraint routines_position_nonnegative check(position >= 0);
  end if;
end $$;
create index if not exists routines_owner_position on public.routines(user_id,position,id);
-- Reorder all routines for the caller in one transaction; RLS remains enabled.
create or replace function public.reorder_routines(p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); total bigint;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_ids is null then raise exception 'INVALID_ORDER'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 92841));
  perform 1 from public.routines where user_id=uid order by id for update;
  select count(*) into total from public.routines where user_id=uid;
  if cardinality(p_ids) <> total
    or exists(select 1 from unnest(p_ids) as input(id) where id is null)
    or (select count(distinct id) from unnest(p_ids) as input(id)) <> total
    or exists(select 1 from unnest(p_ids) as input(id) where not exists (
      select 1 from public.routines r where r.id=input.id and r.user_id=uid
    )) then
    raise exception 'ROUTINE_LIST_CHANGED';
  end if;
  update public.routines r set position=(input.n-1)::integer
  from unnest(p_ids) with ordinality as input(id,n)
  where r.id=input.id and r.user_id=uid;
end $$;
revoke all on function public.reorder_routines(uuid[]) from public, anon;
grant execute on function public.reorder_routines(uuid[]) to authenticated;
commit;
