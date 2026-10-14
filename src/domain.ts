export type Media = { type: 'image' | 'video' | 'link'; url: string };
export type Exercise = { id: string; user_id: string; name: string; muscle: string; equipment: string; description: string; media: Media[]; archived: boolean };
export type Item = { exercise_id: string; name: string; sets: number; reps: number; rest: number; notes: string };
export type Routine = { id: string; user_id: string; name: string; items: Item[] };
export type SetRow = { id: string; reps: string; weight: string; done: boolean; warmup: boolean };
export type WorkoutExercise = { id: string; exercise_id: string; name: string; notes: string; rest: number; sets: SetRow[] };
export type Workout = { id: string; name: string; started_at: string; ended_at: string | null; status: 'active' | 'completed'; notes: string; exercises: WorkoutExercise[] };
export type RecordState = { workout: Workout; revision: number; dirty: boolean; conflict?: boolean; flight?: { payload: Workout; mutation: string; expected: number } };
export type Cache = { exercises: Exercise[]; routines: Routine[]; records: Record<string, RecordState> };
export const uuid = () => crypto.randomUUID();
export const clone = <T,>(v: T): T => structuredClone(v);
export function validSet(s: SetRow) {
  return /^\d+$/.test(s.reps) && Number(s.reps) > 0 && Number(s.reps) <= 10000 &&
    s.weight.trim() !== '' && Number.isFinite(Number(s.weight)) && Number(s.weight) >= 0 && Number(s.weight) <= 10000;
}
export function newWorkout(items: Item[], name: string): Workout {
  return { id: uuid(), name, started_at: new Date().toISOString(), ended_at: null, status: 'active', notes: '',
    exercises: items.map(i => ({ id: uuid(), exercise_id: i.exercise_id, name: i.name, notes: i.notes, rest: i.rest,
      sets: Array.from({ length: i.sets }, () => ({ id: uuid(), reps: String(i.reps), weight: '', done: false, warmup: false })) })) };
}
export function exerciseStats(records: Record<string, RecordState>, exerciseId: string, exclude?: string) {
  const sessions = Object.values(records).map(r => r.workout)
    .filter(w => w.id !== exclude && w.status === 'completed')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map(w => ({ workout: w, sets: w.exercises.filter(e => e.exercise_id === exerciseId).flatMap(e => e.sets).filter(s => s.done && !s.warmup && validSet(s)) }))
    .filter(x => x.sets.length > 0);
  const all = sessions.flatMap(x => x.sets);
  const best = [...all].sort((a, b) => Number(b.weight) - Number(a.weight) || Number(b.reps) - Number(a.reps))[0];
  return { sessions, last: sessions[0], best, maxReps: all.length ? Math.max(...all.map(s => Number(s.reps))) : 0,
    maxVolume: sessions.length ? Math.max(...sessions.map(x => x.sets.reduce((n, s) => n + Number(s.weight) * Number(s.reps), 0))) : 0 };
}
export function safeUrl(value: string): string | null {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
export function pendingCount(c: Cache) { return Object.values(c.records).filter(r => r.dirty || r.flight).length; }
