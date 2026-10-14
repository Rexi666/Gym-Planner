import type { Exercise as BaseExercise, Routine as BaseRoutine } from './domain';
export type RoutineStatus = 'active' | 'draft' | 'discarded';
export type Exercise = BaseExercise & { muscles?: string[] };
export type Routine = BaseRoutine & { status?: RoutineStatus; position?: number };
export const ROUTINE_STATUSES: { id: RoutineStatus; label: string }[] = [
  { id: 'active', label: 'Activas' }, { id: 'draft', label: 'Borradores' }, { id: 'discarded', label: 'Descartadas' }
];
// These are organisational labels, not anatomical or training recommendations.
export const MUSCLE_GROUPS = [
  { name: 'Pecho', color: '#ff9ca7' }, { name: 'Espalda', color: '#8cc9ff' },
  { name: 'Hombro', color: '#c3a2ff' }, { name: 'Bíceps', color: '#ffd17d' },
  { name: 'Tríceps', color: '#ffad7e' }, { name: 'Antebrazo', color: '#dfbc91' },
  { name: 'Pierna', color: '#8fe2a8' }, { name: 'Cuádriceps', color: '#b6e77b' },
  { name: 'Isquiotibiales', color: '#65dfc6' }, { name: 'Glúteos', color: '#ff9fdf' },
  { name: 'Gemelos', color: '#7fdfec' }, { name: 'Aductores', color: '#d5d784' },
  { name: 'Abductores', color: '#9fbcf3' }, { name: 'Abdominales', color: '#f1e392' },
  { name: 'Lumbar', color: '#b4baff' }, { name: 'Trapecio', color: '#e9b0c8' }
] as const;
const aliases: Record<string, string> = {
  piernas: 'Pierna', hombros: 'Hombro', biceps: 'Bíceps', triceps: 'Tríceps',
  cuadriceps: 'Cuádriceps', gluteos: 'Glúteos', abdomen: 'Abdominales', core: 'Abdominales',
  abdominal: 'Abdominales', abdominales: 'Abdominales', lumbares: 'Lumbar',
  antebrazos: 'Antebrazo', isquios: 'Isquiotibiales', pantorrillas: 'Gemelos', trapecios: 'Trapecio'
};
export function canonicalGroup(raw: string) {
  const name = raw.trim(); const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return aliases[key] || MUSCLE_GROUPS.find(g => g.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === key)?.name || name;
}
export function groupsOf(e: BaseExercise | Exercise): string[] {
  const list = (e as Exercise).muscles;
  const raw = Array.isArray(list) && list.length ? list : (e.muscle || '').split(/[,;\/+]|\s+y\s+/i);
  return [...new Set(raw.map(canonicalGroup).filter(Boolean))];
}
export function statusOf(r: BaseRoutine | Routine): RoutineStatus {
  const status = (r as Routine).status;
  return status === 'draft' || status === 'discarded' ? status : 'active';
}
export function sortRoutines(rows: BaseRoutine[]): Routine[] {
  return [...rows].sort((a, b) => ((a as Routine).position ?? Number.MAX_SAFE_INTEGER) - ((b as Routine).position ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}
export function movedRoutineIds(rows: Routine[], visible: Routine[], id: string, direction: number): string[] | null {
  const i = visible.findIndex(r => r.id === id); const j = i + direction;
  if (i < 0 || j < 0 || j >= visible.length) return null;
  const ids = rows.map(r => r.id); const a = ids.indexOf(id); const b = ids.indexOf(visible[j].id);
  if (a < 0 || b < 0) return null;
  [ids[a], ids[b]] = [ids[b], ids[a]]; return ids;
}
