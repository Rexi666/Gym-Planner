import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSet, newWorkout, exerciseStats, safeUrl, type RecordState } from './domain';
test('series: cero kg valido; vacios, negativos y repeticiones decimales no', () => {
  const s = { id: 's', reps: '10', weight: '0', done: true, warmup: false };
  assert.equal(validSet(s), true);
  for (const weight of ['', ' ', '-1', 'NaN', 'Infinity']) assert.equal(validSet({ ...s, weight }), false);
  for (const reps of ['', '0', '-2', '1.5']) assert.equal(validSet({ ...s, reps }), false);
});
test('la plantilla no se modifica al entrenar', () => {
  const items = [{ exercise_id: 'e', name: 'Ejemplo', sets: 2, reps: 8, rest: 90, notes: '' }];
  const w = newWorkout(items, 'Sesion'); w.exercises[0].name = 'Cambio';
  assert.equal(items[0].name, 'Ejemplo'); assert.equal(w.exercises[0].sets.length, 2);
});
test('estadisticas excluyen calentamiento, series pendientes y sesion activa', () => {
  const w = newWorkout([{ exercise_id: 'e', name: 'Ejemplo', sets: 1, reps: 8, rest: 90, notes: '' }], 'Sesion');
  w.status = 'completed'; w.exercises[0].sets = [
    { id: 'a', reps: '8', weight: '40', done: true, warmup: false },
    { id: 'b', reps: '10', weight: '100', done: true, warmup: true },
    { id: 'c', reps: '10', weight: '200', done: false, warmup: false }];
  const r: RecordState = { workout: w, revision: 1, dirty: false };
  const stats = exerciseStats({ [w.id]: r }, 'e');
  assert.equal(stats.best?.weight, '40'); assert.equal(stats.maxVolume, 320);
  assert.equal(exerciseStats({ [w.id]: r }, 'e', w.id).last, undefined);
});
test('solo enlaces HTTPS para multimedia', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null); assert.equal(safeUrl('http://example.com'), null);
  assert.ok(safeUrl('https://example.com/video.mp4'));
});
