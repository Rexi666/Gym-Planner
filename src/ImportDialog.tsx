import { useState, type ChangeEvent } from 'react';
import { uuid, pendingCount } from './domain';
import { Store } from './store';
import { supabase } from './client';
import { parseBackup, makeImportPlan, exportBackup, type Backup, type ImportMode, type ImportPayload } from './backup';
export function ImportDialog({ store, userId, close, download }: { store: Store; userId: string; close: () => void; download: (name: string, data: unknown) => void }) {
  const [backup, setBackup] = useState<Backup | null>(null); const [filename, setFilename] = useState('');
  const [mode, setMode] = useState<ImportMode>('copy'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [request, setRequest] = useState<{ id: string; payload: ImportPayload } | null>(null);
  async function readFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; setBackup(null); setError(''); setSuccess(''); setRequest(null);
    if (!file) return;
    try { if (file.size > 20 * 1024 * 1024) throw new Error('El archivo supera los 20 MB.');
      const parsed = parseBackup(JSON.parse(await file.text())); setBackup(parsed); setFilename(file.name); setMode('copy');
    } catch (e) { setError(e instanceof Error ? e.message : 'JSON inválido.'); }
  }
  async function apply() {
    if (!backup || !supabase) return; setError(''); setBusy(true);
    try {
      if (!navigator.onLine) throw new Error('La importación necesita conexión.');
      if (store.syncing || pendingCount(store.data) || Object.values(store.data.records).some(r => r.workout.status === 'active')) throw new Error('Finaliza los entrenamientos activos y sincroniza los cambios antes de importar.');
      let req = request;
      if (!req) {
        await store.refresh(); if (store.message) throw new Error(store.message);
        if (Object.values(store.data.records).some(r => r.workout.status === 'active')) throw new Error('Hay un entrenamiento activo en la cuenta. Finalízalo antes de importar.');
        const payload = makeImportPlan(backup, mode, userId, store.data);
        if (!confirm(mode === 'restore' ? 'Recuperar esta copia? Se sobrescribirán los elementos con el mismo ID y se añadirán los que falten. No se borrarán elementos posteriores.' : 'Añadir los ejercicios y rutinas como copias nuevas? No se importará el historial.')) return;
        download(`gym-antes-de-importar-${Date.now()}.json`, exportBackup(userId, store.data));
        req = { id: uuid(), payload }; setRequest(req);
      }
      const { error } = await supabase.rpc('import_gym_backup', { p_request: req.id, p_data: req.payload });
      if (error) throw new Error(error.message.includes('CATALOG_CHANGED') || error.message.includes('REVISION_CONFLICT') ? 'Los datos han cambiado en otro dispositivo. Cierra este diálogo, recarga los datos y vuelve a seleccionar la copia.' : error.message);
      await store.refresh();
      setSuccess(store.message ? 'Importación guardada en Supabase. Recarga los datos desde Ajustes: no se pudo actualizar la vista local.' : 'Importación completada. Tus datos ya están actualizados.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo importar. Puedes reintentar con el mismo archivo y modo sin duplicar una operación ya confirmada.'); }
    finally { setBusy(false); }
  }
  return <div className="overlay"><section className="modal stack" role="dialog" aria-modal="true" aria-label="Importar JSON">
    <div className="row"><h2>Importar JSON</h2><button disabled={busy} className="ghost" onClick={close}>Cerrar</button></div>
    <fieldset disabled={busy || Boolean(success)} className="app-fieldset stack">
      <label>Archivo JSON<input disabled={Boolean(request)} type="file" accept=".json,application/json" onChange={ev => void readFile(ev)}/></label>
      {backup && <><p><strong>{filename}</strong></p><p>{backup.exercises.length} ejercicios · {backup.routines.length} rutinas · {backup.workouts.length} entrenamientos en el archivo.</p>
        <label>Qué quieres importar<select disabled={Boolean(request)} value={mode} onChange={e => { setMode(e.target.value as ImportMode); setRequest(null); }}><option value="copy">Añadir ejercicios y rutinas como copias</option><option value="restore" disabled={backup.owner !== userId}>Recuperar mi copia, incluido el historial</option></select></label>
        <p className="notice">{mode === 'copy' ? 'Se crean identificadores nuevos en tu cuenta. Las rutinas entran como Borradores. No se copian usuarios ni historial.' : 'Recuperación por ID: actualiza lo incluido en la copia y recupera lo eliminado. No elimina datos creados después de exportarla.'}</p>
        {request && <p className="muted">Si se interrumpe la conexión, usa Reintentar sin cerrar este diálogo. No selecciones de nuevo el archivo hasta comprobar el resultado.</p>}
        <p className="muted">Antes de aplicar se descarga una copia de seguridad del estado actual. Los archivos multimedia se comparten como enlaces, no se incluyen los vídeos o imágenes.</p>
        <button onClick={() => void apply()}>{busy ? 'Importando...' : request ? 'Reintentar la misma importación' : 'Confirmar importación'}</button>
      </>}
    </fieldset>
    {error && <p className="notice" role="alert">{error}</p>}{success && <p className="notice" role="status">{success}</p>}
  </section></div>;
}
