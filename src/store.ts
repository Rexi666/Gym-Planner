import { supabase } from './client';
import { type Cache, type Workout, clone, uuid } from './domain';
const empty = (): Cache => ({ exercises: [], routines: [], records: {} });
export class Store {
  data: Cache; private key: string; private listeners = new Set<() => void>();
  readFailed = false; private busy = false; private disposed = false; private timer?: ReturnType<typeof setTimeout>;
  loaded = false; message = ''; storageError = ''; syncing = false;
  constructor(readonly userId: string) {
    this.key = `gym-planner:v1:${userId}`;
    try { this.data = JSON.parse(localStorage.getItem(this.key) || 'null') || empty(); }
    catch { this.readFailed = true; this.data = empty(); this.storageError = 'No se pudo leer la copia local. No borres los datos del navegador.'; }
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  notify() { this.listeners.forEach(f => f()); }
  persist() {
    if (this.readFailed) { this.notify(); return; }
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); this.storageError = ''; }
    catch { this.storageError = 'No se pudo guardar en este dispositivo. Exporta una copia antes de cerrar.'; }
    this.notify();
  }
  edit(workout: Workout) {
    if (this.readFailed) return;
    const old = this.data.records[workout.id];
    this.data.records[workout.id] = { ...old, workout: clone(workout), revision: old?.revision || 0, dirty: true };
    this.persist(); this.schedule();
  }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => void this.sync(), 650); }
  async refresh() {
    if (!supabase || !navigator.onLine || this.disposed || this.readFailed) return;
    const [ex, rt, wk] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('routines').select('*').order('name'),
      supabase.rpc('list_workouts')
    ]);
    if (this.disposed) return;
    const error = ex.error || rt.error || wk.error;
    if (error) { this.message = error.message; this.notify(); return; }
    this.data.exercises = ex.data || []; this.data.routines = rt.data || [];
    for (const row of wk.data || []) {
      const old = this.data.records[row.payload.id];
      if (!old?.dirty && !old?.flight && (!old || row.revision >= old.revision)) this.data.records[row.payload.id] = { workout: row.payload, revision: row.revision, dirty: false };
    }
    this.loaded = true; this.message = ''; this.persist();
  }
  async sync() {
    if (this.busy || this.disposed || this.readFailed || !navigator.onLine || !supabase) return;
    this.busy = true; this.syncing = true; this.notify();
    try {
      for (const id of Object.keys(this.data.records)) {
        let r = this.data.records[id];
        if ((!r.dirty && !r.flight) || r.conflict || !r.workout.name.trim()) continue;
        if (!r.flight) {
          r.flight = { payload: clone(r.workout), mutation: uuid(), expected: r.revision };
          this.persist();
          if (this.storageError) break;
        }
        const flight = clone(r.flight);
        const { data, error } = await supabase.rpc('save_workout', { p_payload: flight.payload, p_expected: flight.expected, p_mutation: flight.mutation });
        if (this.disposed) break;
        r = this.data.records[id];
        if (error) {
          if (error.message.includes('REVISION_CONFLICT')) r.conflict = true;
          else if (error.code) delete r.flight;
          this.message = error.message; this.persist(); break;
        }
        r.revision = Number(data);
        r.dirty = JSON.stringify(r.workout) !== JSON.stringify(flight.payload);
        delete r.flight; this.message = ''; this.persist();
      }
    } catch (e) { this.message = e instanceof Error ? e.message : 'Error de conexion'; }
    finally {
      this.busy = false; this.syncing = false; this.notify();
      if (!this.disposed && !this.message && Object.values(this.data.records).some(r => r.dirty && !r.conflict)) this.schedule();
    }
  }
  async resolve(id: string, keepLocal: boolean) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_workout', { p_id: id });
    if (error) throw error;
    const row = data?.[0]; if (!row) throw new Error('No se encuentra la sesion remota. Exporta tu copia local.');
    const r = this.data.records[id];
    if (keepLocal) {
      // Keep the remote original; preserve local work as a new, independent session.
      const copy = clone(r.workout); copy.id = uuid(); copy.name += ' (copia local)';
      copy.exercises.forEach(e => { e.id = uuid(); e.sets.forEach(s => { s.id = uuid(); }); });
      this.data.records[copy.id] = { workout: copy, revision: 0, dirty: true };
    }
    this.data.records[id] = { workout: row.payload, revision: row.revision, dirty: false };
    this.message = ''; this.persist(); this.schedule();
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); }
}
