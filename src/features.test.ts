import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid, type Cache } from './domain';
import type { Exercise, Routine } from './catalog';
import { parseBackup, makeImportPlan, exportBackup, exportLibrary } from './backup';
import { groupSelected, cleanGroups, blocks, moveBlock, newWorkout, restAfterSet, type Item } from './training-features';
const owner = uuid();
const exercise = (name = 'Ejemplo'): Exercise => ({ id: uuid(), user_id: owner, name, muscle: 'Pecho', muscles: ['Pecho'], equipment: 'Barra', description: '', media: [], archived: false });
const item = (e: Exercise): Item => ({ exercise_id: e.id, name: e.name, sets: 2, reps: 8, rest: 90, notes: '' });
function fixture() {
  const ex = [exercise('A'), exercise('B'), exercise('C')];
  const routine: Routine = { id: uuid(), user_id: owner, name: 'Rutina', status: 'active', position: 0, items: groupSelected(ex.map(item), [0, 1]) };
  const w = newWorkout(routine.items, 'Sesión'); w.status = 'completed'; w.ended_at = new Date().toISOString();
  const cache: Cache = { exercises: ex, routines: [routine], records: { [w.id]: { workout: w, revision: 4, dirty: false } } };
  return { ex, routine, w, cache };
}
test('acepta copias antiguas v1 con records', () => {
  const f = fixture(); const b = parseBackup({ version: 1, user_id: owner, data: f.cache });
  assert.equal(b.workouts.length, 1); assert.equal(b.exercises.length, 3);
});
test('exportacion v2 completa se puede volver a leer', () => {
  const f = fixture(); const b = parseBackup(exportBackup(owner, f.cache));
  assert.equal(b.workouts[0].id, f.w.id); assert.equal(b.routines[0].items.length, 3);
});
test('exportacion compartida no contiene propietario ni historial', () => {
  const f = fixture(); const raw = exportLibrary(f.cache); const b = parseBackup(raw);
  assert.equal(b.owner, null); assert.equal(b.workouts.length, 0);
  assert.ok(!JSON.stringify(raw).includes(owner)); assert.ok(!JSON.stringify(raw).includes(f.w.id));
});
test('compartir remapea IDs, referencias, propietario y superseries', () => {
  const f = fixture(); const other = uuid(); const b = parseBackup(exportBackup(owner, f.cache));
  const p = makeImportPlan(b, 'copy', other, { exercises: [], routines: [], records: {} });
  assert.equal(p.workouts.length, 0); assert.equal(p.routines[0].status, 'draft');
  assert.equal(p.exercises[0].user_id, other); assert.notEqual(p.exercises[0].id, f.ex[0].id);
  assert.equal(p.routines[0].items[0].exercise_id, p.exercises[0].id);
  const items = p.routines[0].items as Item[];
  assert.equal(items[0].superset_id, items[1].superset_id);
  assert.notEqual(items[0].superset_id, (f.routine.items[0] as Item).superset_id);
});
test('recuperar mantiene IDs y usa revisiones actuales, no las del archivo', () => {
  const f = fixture(); const b = parseBackup(exportBackup(owner, f.cache));
  f.cache.records[f.w.id].revision = 9;
  const p = makeImportPlan(b, 'restore', owner, f.cache);
  assert.equal(p.workouts[0].id, f.w.id); assert.equal(p.expected[f.w.id], 9);
  assert.equal(p.exercises[0].id, f.ex[0].id);
});
test('no permite recuperar una copia ajena', () => {
  const f = fixture(); assert.throws(() => makeImportPlan(parseBackup(exportBackup(owner, f.cache)), 'restore', uuid(), f.cache));
});
test('rechaza version, UUID, enlaces inseguros y referencias rotas', () => {
  const f = fixture(); const source = exportBackup(owner, f.cache);
  assert.throws(() => parseBackup({ ...source, version: 99 }));
  const badId = structuredClone(source); badId.data.exercises[0].id = 'incorrecto'; assert.throws(() => parseBackup(badId));
  const badMedia = structuredClone(source); badMedia.data.exercises[0].media = [{ type: 'image', url: 'javascript:alert(1)' }]; assert.throws(() => parseBackup(badMedia));
  const missing = structuredClone(source); missing.data.exercises = []; assert.throws(() => parseBackup(missing));
});
test('rechaza series completadas invalidas y duplicados', () => {
  const f = fixture(); const source = exportBackup(owner, f.cache);
  source.data.workouts[0].exercises[0].sets[0].done = true;
  source.data.workouts[0].exercises[0].sets[0].weight = '-1'; assert.throws(() => parseBackup(source));
  const dup = exportBackup(owner, fixture().cache); dup.data.exercises.push(dup.data.exercises[0]); assert.throws(() => parseBackup(dup));
});
test('historial de ejercicios eliminados sigue siendo importable', () => {
  const f = fixture(); f.cache.routines = []; f.cache.exercises = [];
  assert.equal(parseBackup(exportBackup(owner, f.cache)).workouts.length, 1);
});
test('superserie requiere dos ejercicios y admite tres o mas', () => {
  const rows = [exercise(), exercise(), exercise()].map(item);
  assert.throws(() => groupSelected(rows, [0]));
  const result = groupSelected(rows, [0, 1, 2]); assert.equal(new Set(result.map(i => i.superset_id)).size, 1);
});
test('agrupar no pierde ejercicios y los coloca consecutivos', () => {
  const rows = [exercise('A'), exercise('B'), exercise('C'), exercise('D')].map(item);
  const result = groupSelected(rows, [0, 2]);
  assert.deepEqual(result.map(i => i.name), ['A', 'C', 'B', 'D']); assert.equal(rows[0].superset_id, undefined);
});
test('mover un miembro mueve todo el bloque', () => {
  const rows = [exercise('A'), exercise('B'), exercise('C')].map(item);
  const grouped = groupSelected(rows, [0, 1]);
  assert.deepEqual(moveBlock(grouped, 1, 1).map(i => i.name), ['C', 'A', 'B']);
  assert.deepEqual(moveBlock(grouped, 2, -1).map(i => i.name), ['C', 'A', 'B']);
});
test('eliminar hasta dejar un miembro disuelve la superserie', () => {
  const f = fixture(); const rows = f.routine.items as Item[];
  assert.equal(cleanGroups(rows.filter((_, i) => i !== 0))[0].superset_id, null);
});
test('reagrupar parcialmente mantiene bloques consecutivos', () => {
  const rows = [exercise('A'), exercise('B'), exercise('C'), exercise('D')].map(item);
  const old = groupSelected(rows, [0, 1, 2]); const result = groupSelected(old, [1, 3]);
  assert.equal(result.length, 4); assert.equal(blocks(result).length, 2);
  for (const block of blocks(result)) {
    const pos = block.map(x => result.findIndex(y => y.exercise_id === x.exercise_id));
    assert.equal(Math.max(...pos) - Math.min(...pos) + 1, pos.length);
  }
});
test('entrenamiento conserva grupos sin modificar la plantilla', () => {
  const f = fixture(); const rows = f.routine.items as Item[];
  assert.equal(f.w.exercises[0].superset_id, f.w.exercises[1].superset_id);
  assert.notEqual(f.w.exercises[0].superset_id, rows[0].superset_id);
});
test('descanso solo al completar la ronda de todos los participantes', () => {
  const f = fixture(); const a = f.w.exercises[0]; const b = f.w.exercises[1];
  a.sets[0].done = true; assert.equal(restAfterSet(f.w, a.id, 0), 0);
  b.sets[0].done = true; b.rest = 120; assert.equal(restAfterSet(f.w, b.id, 0), 120);
  a.sets[1].done = true; assert.equal(restAfterSet(f.w, a.id, 1), 0);
});
test('rechaza superseries no consecutivas en JSON', () => {
  const f = fixture(); const raw = exportBackup(owner, f.cache); const items = raw.data.routines[0].items as Item[];
  items[2].superset_id = items[0].superset_id; items[1].superset_id = null;
  assert.throws(() => parseBackup(raw));
});
