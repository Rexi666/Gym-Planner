import { uuid, type Cache, type SetRow } from './domain';
import { groupsOf, statusOf, sortRoutines, type Exercise, type Routine } from './catalog';
import { cleanGroups, type Item, type Workout } from './training-features';
export type ImportMode = 'copy' | 'restore';
export type Backup = { owner: string | null; exercises: Exercise[]; routines: Routine[]; workouts: Workout[] };
export type ImportPayload = { exercises: Exercise[]; routines: Routine[]; workouts: Workout[]; expected: Record<string, number>; catalog_before: { exercises: Cache['exercises']; routines: Cache['routines'] } };
type Obj = Record<string, unknown>;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(v: unknown, path: string): Obj { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path}: se esperaba un objeto.`); return v as Obj; }
function list(v: unknown, path: string, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) throw new Error(`${path}: lista inválida o demasiado grande (máx. ${max}).`); return v; }
function text(v: unknown, path: string, max: number, fallback?: string): string { if (v === undefined && fallback !== undefined) return fallback; if (typeof v !== 'string' || v.length > max) throw new Error(`${path}: texto inválido.`); return v; }
function id(v: unknown, path: string): string { const s = text(v, path, 36); if (!idPattern.test(s)) throw new Error(`${path}: identificador inválido.`); return s.toLowerCase(); }
function integer(v: unknown, path: string, min: number, max: number): number { if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`${path}: número inválido.`); return v; }
function bool(v: unknown, path: string, fallback = false): boolean { if (v === undefined) return fallback; if (typeof v !== 'boolean') throw new Error(`${path}: booleano inválido.`); return v; }
function timestamp(v: unknown, path: string): string { const s = text(v, path, 80); if (!Number.isFinite(Date.parse(s))) throw new Error(`${path}: fecha inválida.`); return new Date(s).toISOString(); }
function unique<T extends { id: string }>(rows: T[], path: string) { if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error(`${path}: identificadores repetidos.`); return rows; }
function group(v: unknown): string | null { return v == null || v === '' ? null : id(v, 'superserie'); }
function validGroups<T extends { superset_id?: string | null }>(rows: T[]): T[] {
  const normal = cleanGroups(rows);
  for (const g of new Set(normal.map(i => i.superset_id).filter(Boolean))) {
    const positions = normal.map((i, n) => i.superset_id === g ? n : -1).filter(n => n >= 0);
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) throw new Error('Los ejercicios de una superserie deben ser consecutivos.');
  }
  return normal;
}
export function parseBackup(raw: unknown): Backup {
  const root = object(raw, 'JSON');
  if (root.version !== 1 && root.version !== 2) throw new Error('Versión de copia no compatible.');
  const data = object(root.data, 'data'); const owner = root.user_id == null ? null : id(root.user_id, 'user_id');
  const exercises = unique(list(data.exercises, 'ejercicios', 2000).map((v, n): Exercise => {
    const e = object(v, `ejercicio ${n + 1}`); const name = text(e.name, 'nombre', 160).trim(); if (!name) throw new Error('Ejercicio sin nombre.');
    const muscles = e.muscles === undefined ? [] : list(e.muscles, 'grupos', 50).map(m => text(m, 'grupo', 100));
    const media = list(e.media ?? [], 'multimedia', 50).map(v => {
      const m = object(v, 'multimedia'); if (!['image', 'video', 'link'].includes(String(m.type))) throw new Error('Tipo multimedia inválido.');
      const url = text(m.url, 'URL', 4096); try { if (new URL(url).protocol !== 'https:') throw new Error(); } catch { throw new Error('Los enlaces multimedia deben ser HTTPS.'); }
      return { type: m.type as 'image' | 'video' | 'link', url };
    });
    const result: Exercise = { id: id(e.id, 'ejercicio.id'), user_id: owner || '', name, muscle: text(e.muscle, 'grupo antiguo', 2000, ''), muscles, equipment: text(e.equipment, 'material', 200, ''), description: text(e.description, 'descripción', 30000, ''), media, archived: bool(e.archived, 'archivado') };
    result.muscles = groupsOf(result); result.muscle = result.muscles.join(' / '); return result;
  }), 'ejercicios');
  const routines = unique(list(data.routines, 'rutinas', 1000).map((v, n): Routine => {
    const r = object(v, `rutina ${n + 1}`); const name = text(r.name, 'nombre de rutina', 160).trim(); if (!name) throw new Error('Rutina sin nombre.');
    if (r.status !== undefined && !['active', 'draft', 'discarded'].includes(String(r.status))) throw new Error('Tipo de rutina inválido.');
    const items: Item[] = validGroups(list(r.items, 'ejercicios de rutina', 200).map(v => {
      const i = object(v, 'elemento de rutina'); return { exercise_id: id(i.exercise_id, 'exercise_id'), name: text(i.name, 'nombre', 160), sets: integer(i.sets, 'series', 1, 100), reps: integer(i.reps, 'repeticiones', 1, 10000), rest: integer(i.rest, 'descanso', 0, 3600), notes: text(i.notes, 'notas', 10000, ''), superset_id: group(i.superset_id) };
    }));
    return { id: id(r.id, 'rutina.id'), user_id: owner || '', name, items, status: r.status === undefined ? 'active' : r.status as 'active' | 'draft' | 'discarded', position: r.position === undefined ? n : integer(r.position, 'posición', 0, 2147483647) };
  }), 'rutinas');
  const records = data.records === undefined ? {} : object(data.records, 'records');
  const rawWorkouts = data.workouts === undefined ? Object.values(records).map(v => object(v, 'registro').workout) : list(data.workouts, 'historial', 5000);
  if (rawWorkouts.length > 5000) throw new Error('Demasiados entrenamientos.');
  const workouts = unique(rawWorkouts.map((v): Workout => {
    const w = object(v, 'entrenamiento'); if (w.status !== 'active' && w.status !== 'completed') throw new Error('Estado de entrenamiento inválido.');
    const started_at = timestamp(w.started_at, 'inicio'); const ended_at = w.ended_at == null ? null : timestamp(w.ended_at, 'fin');
    if ((w.status === 'active' && ended_at !== null) || (w.status === 'completed' && !ended_at) || (ended_at && ended_at < started_at)) throw new Error('Fechas de entrenamiento incompatibles.');
    const name = text(w.name, 'nombre de entrenamiento', 160).trim(); if (!name) throw new Error('Entrenamiento sin nombre.');
    const exercises = unique(validGroups(list(w.exercises, 'ejercicios realizados', 200).map(v => {
      const e = object(v, 'ejercicio realizado');
      const sets = unique(list(e.sets, 'series realizadas', 200).map((v): SetRow => {
        const s = object(v, 'serie'); const reps = text(s.reps, 'repeticiones', 20); const weight = text(s.weight, 'peso', 30); const done = bool(s.done, 'completada');
        if (done && (!/^\d+$/.test(reps) || Number(reps) < 1 || Number(reps) > 10000 || !/^\d+(\.\d+)?$/.test(weight) || Number(weight) > 10000)) throw new Error('Serie completada con valores inválidos.');
        return { id: id(s.id, 'serie.id'), reps, weight, done, warmup: bool(s.warmup, 'calentamiento') };
      }), 'series');
      return { id: id(e.id, 'ejercicio realizado.id'), exercise_id: id(e.exercise_id, 'exercise_id'), name: text(e.name, 'nombre', 160), notes: text(e.notes, 'notas', 10000, ''), rest: integer(e.rest, 'descanso', 0, 3600), superset_id: group(e.superset_id), sets };
    })), 'ejercicios realizados');
    return { id: id(w.id, 'entrenamiento.id'), name, started_at, ended_at, status: w.status, notes: text(w.notes, 'notas', 30000, ''), exercises };
  }), 'entrenamientos');
  unique(workouts.flatMap(w => w.exercises), 'ejercicios de todo el historial');
  unique(workouts.flatMap(w => w.exercises.flatMap(e => e.sets)), 'series de todo el historial');
  const known = new Set(exercises.map(e => e.id));
  if (routines.some(r => r.items.some(i => !known.has(i.exercise_id)))) throw new Error('Una rutina referencia un ejercicio que no está en la copia.');
  return { owner, exercises, routines, workouts };
}
export function makeImportPlan(backup: Backup, mode: ImportMode, userId: string, cache: Cache): ImportPayload {
  if (mode === 'restore' && backup.owner !== userId) throw new Error('Solo puedes recuperar una copia de tu propia cuenta. Para compartir usa Añadir como copias.');
  const exMap = new Map(backup.exercises.map(e => [e.id, mode === 'copy' ? uuid() : e.id]));
  const groups = new Map<string, string>();
  const remapGroup = (g?: string | null) => { if (!g) return null; if (mode === 'restore') return g; if (!groups.has(g)) groups.set(g, uuid()); return groups.get(g)!; };
  const next = Math.max(-1, ...sortRoutines(cache.routines).map(r => r.position ?? -1)) + 1;
  const exercises = backup.exercises.map(e => ({ ...e, id: exMap.get(e.id)!, user_id: userId }));
  const routines = backup.routines.map((r, i) => ({ ...r, id: mode === 'copy' ? uuid() : r.id, user_id: userId,
    status: mode === 'copy' ? 'draft' as const : statusOf(r), position: mode === 'copy' ? next + i : r.position,
    items: (r.items as Item[]).map(item => ({ ...item, exercise_id: exMap.get(item.exercise_id)!, superset_id: remapGroup(item.superset_id) })) }));
  const workouts = mode === 'copy' ? [] : backup.workouts;
  const expected = Object.fromEntries(workouts.map(w => [w.id, cache.records[w.id]?.revision ?? 0]));
  return { exercises, routines, workouts, expected, catalog_before: { exercises: cache.exercises, routines: cache.routines } };
}
export function exportBackup(userId: string, cache: Cache) {
  return { version: 2, kind: 'backup', exported_at: new Date().toISOString(), user_id: userId,
    data: { exercises: cache.exercises, routines: cache.routines, workouts: Object.values(cache.records).map(r => r.workout) } };
}
export function exportLibrary(cache: Cache) {
  return { version: 2, kind: 'library', exported_at: new Date().toISOString(),
    data: { exercises: cache.exercises.map(e => { const { user_id: _owner, ...row } = e; return row; }),
      routines: cache.routines.map(r => { const { user_id: _owner, ...row } = r; return row; }) } };
}
