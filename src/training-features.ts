import { newWorkout as baseNewWorkout, uuid, type Item as BaseItem, type Workout as BaseWorkout, type WorkoutExercise as BaseWorkoutExercise } from './domain';
export type Item = BaseItem & { superset_id?: string | null };
export type WorkoutExercise = BaseWorkoutExercise & { superset_id?: string | null };
export type Workout = Omit<BaseWorkout, 'exercises'> & { exercises: WorkoutExercise[] };
export function cleanGroups<T extends { superset_id?: string | null }>(items: T[]): T[] {
  const counts = new Map<string, number>();
  items.forEach(i => { if (i.superset_id) counts.set(i.superset_id, (counts.get(i.superset_id) || 0) + 1); });
  return items.map(i => ({ ...i, superset_id: i.superset_id && (counts.get(i.superset_id) || 0) >= 2 ? i.superset_id : null }));
}
export function blocks<T extends { superset_id?: string | null }>(items: T[]): T[][] {
  const result: T[][] = []; const seen = new Set<string>();
  const normal = cleanGroups(items);
  for (const item of normal) {
    if (!item.superset_id) result.push([item]);
    else if (!seen.has(item.superset_id)) { seen.add(item.superset_id); result.push(normal.filter(i => i.superset_id === item.superset_id)); }
  }
  return result;
}
export function moveBlock<T extends { superset_id?: string | null }>(items: T[], index: number, direction: number): T[] {
  if (index < 0 || index >= items.length) return items;
  const normal = cleanGroups(items); const target = normal[index];
  const grouped: T[][] = []; const seen = new Set<string>();
  for (const item of normal) {
    if (!item.superset_id) grouped.push([item]);
    else if (!seen.has(item.superset_id)) { seen.add(item.superset_id); grouped.push(normal.filter(x => x.superset_id === item.superset_id)); }
  }
  const from = grouped.findIndex(b => b.includes(target)); const to = from + direction;
  if (from < 0 || to < 0 || to >= grouped.length) return items;
  [grouped[from], grouped[to]] = [grouped[to], grouped[from]]; return grouped.flat();
}
export function groupSelected(items: Item[], indices: number[]): Item[] {
  const selected = new Set(indices); if ([...selected].some(i => !Number.isInteger(i) || i < 0 || i >= items.length)) throw new Error('Selección inválida.');
  if (selected.size < 2) throw new Error('Selecciona al menos dos ejercicios.');
  const id = uuid(); const first = Math.min(...selected);
  const chosen = items.filter((_, i) => selected.has(i)).map(i => ({ ...i, superset_id: id }));
  const remaining = items.filter((_, i) => !selected.has(i));
  const insert = items.slice(0, first).filter((_, i) => !selected.has(i)).length;
  remaining.splice(insert, 0, ...chosen); return blocks(cleanGroups(remaining)).flat();
}
export function newWorkout(items: Item[], name: string): Workout {
  const normal = blocks(items).flat(); const w = baseNewWorkout(normal, name);
  const remap = new Map<string, string>();
  return { ...w, exercises: w.exercises.map((e, i) => {
    const group = normal[i].superset_id;
    if (group && !remap.has(group)) remap.set(group, uuid());
    return { ...e, superset_id: group ? remap.get(group)! : null };
  }) };
}
export function supersetLabel(items: { superset_id?: string | null }[], group?: string | null): string | null {
  if (!group || items.filter(i => i.superset_id === group).length < 2) return null;
  const ids = [...new Set(cleanGroups(items).map(i => i.superset_id).filter(Boolean))];
  return `Superserie ${ids.indexOf(group) + 1}`;
}
export function restAfterSet(w: Workout, exerciseId: string, setIndex: number): number {
  const ex = w.exercises.find(e => e.id === exerciseId); if (!ex) return 0;
  const group = w.exercises.filter(e => ex.superset_id && e.superset_id === ex.superset_id);
  if (group.length < 2 || ex.sets[setIndex]?.warmup) return ex.rest;
  const participants = group.filter(e => e.sets[setIndex] && !e.sets[setIndex].warmup);
  return participants.every(e => e.sets[setIndex].done) ? Math.max(...group.map(e => e.rest)) : 0;
}
