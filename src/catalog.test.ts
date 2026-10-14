import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, Routine } from './catalog';
import { groupsOf, statusOf, sortRoutines, movedRoutineIds, MUSCLE_GROUPS } from './catalog';
test('legacy names, accents and combinations are preserved and normalised', () => {
    assert.deepEqual(groupsOf({ muscle: 'Pecho y Triceps / Hombros' } as Exercise), ['Pecho', 'Tríceps', 'Hombro']);
    assert.deepEqual(groupsOf({ muscle: 'Mi grupo antiguo' } as Exercise), ['Mi grupo antiguo']);
});
test('multi-select takes precedence over legacy muscle and removes duplicates', () => {
    assert.deepEqual(groupsOf({ muscle: 'Pierna', muscles: ['Pecho', 'Bíceps', 'Biceps'] } as Exercise), ['Pecho', 'Bíceps']);
    const exercise: Exercise = {
        id: 'test-exercise',
        user_id: 'test-user',
        name: 'Ejercicio de prueba',
        muscle: '',
        muscles: [],
        equipment: '',
        description: '',
        media: [],
        archived: false,
    };

    assert.deepEqual(groupsOf(exercise), []);
});
test('existing routines are active by default', () => {
    assert.equal(statusOf({} as Routine), 'active'); assert.equal(statusOf({ status: 'draft' } as Routine), 'draft'); assert.equal(statusOf({ status: 'discarded' } as Routine), 'discarded');
});
test('manual order wins over alphabetical order and does not mutate source', () => {
    const rows = [{ id: 'a', name: 'A', position: 2 }, { id: 'b', name: 'Z', position: 0 }] as Routine[];
    assert.deepEqual(sortRoutines(rows).map(r => r.id), ['b', 'a']); assert.equal(rows[0].id, 'a');
});
test('moving within a filtered category preserves other categories', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] as Routine[];
    assert.deepEqual(movedRoutineIds(rows, [rows[0], rows[2]], 'c', -1), ['c', 'b', 'a', 'd']);
    assert.equal(movedRoutineIds(rows, [rows[0], rows[2]], 'a', -1), null);
});
test('each predefined group has a distinct colour', () => {
    assert.equal(new Set(MUSCLE_GROUPS.map(g => g.color)).size, MUSCLE_GROUPS.length);
    assert.equal(new Set(MUSCLE_GROUPS.map(g => g.name)).size, MUSCLE_GROUPS.length);
});
