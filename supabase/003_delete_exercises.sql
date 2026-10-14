-- Historical workout rows retain exercise_id as a snapshot identifier.
-- They remain linked to their workout and owner; only the live catalog FK is removed.
begin;
do $$ declare fk record; begin
  for fk in select conname from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and confrelid='public.exercises'::regclass and contype='f'
  loop
    execute format('alter table public.workout_exercises drop constraint %I',fk.conname);
  end loop;
end $$;
create or replace function public.delete_exercise(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.exercises where id=p_id and user_id=uid for update;
  if not found then raise exception 'EXERCISE_NOT_FOUND'; end if;
  update public.routines r set items=coalesce((
    select jsonb_agg(item.value order by item.n)
    from jsonb_array_elements(r.items) with ordinality as item(value,n)
    where item.value->>'exercise_id' is distinct from p_id::text
  ),'[]'::jsonb)
  where r.user_id=uid and exists (
    select 1 from jsonb_array_elements(r.items) as item(value)
    where item.value->>'exercise_id'=p_id::text
  );
  delete from public.exercises where id=p_id and user_id=uid;
end $$;
revoke all on function public.delete_exercise(uuid) from public,anon;
grant execute on function public.delete_exercise(uuid) to authenticated;
commit;
