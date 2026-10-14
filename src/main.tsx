import React, { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { supabase, configured } from './client';
import { Store } from './store';
import { clone, uuid, newWorkout, validSet, exerciseStats, safeUrl, pendingCount,
  type Exercise, type Routine, type Item, type Workout, type WorkoutExercise, type Media } from './domain';
import { examples } from './seed';
import './style.css';

const date = (s: string) => new Date(s).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const message = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
const itemFor = (e: Exercise): Item => ({ exercise_id: e.id, name: e.name, sets: 3, reps: 8, rest: 90, notes: '' });
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [close]);
  return <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={title}>
    <header className="row"><h2>{title}</h2><button type="button" className="ghost" onClick={close} aria-label="Cerrar">Cerrar</button></header>{children}</section></div>;
}
function Auth({ recovery = false, recovered }: { recovery?: boolean; recovered: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!supabase) return; setBusy(true); setMsg('');
    try {
      const redirect = `${location.origin}${import.meta.env.BASE_URL}`;
      if (recovery) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; recovered(); }
      else if (mode === 'login') { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }
      else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error; if (!data.session) setMsg('Revisa tu correo para confirmar la cuenta. Después podrás entrar.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error; setMsg('Si existe la cuenta, recibiras un enlace para cambiar la clave.');
      }
    } catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }
  return <main className="auth"><img className="logo" src={`${import.meta.env.BASE_URL}icon-192.png`} alt=""/><p className="eyebrow">TU ENTRENAMIENTO, A TU RITMO</p><h1>Gym Planner</h1>
    <p className="muted">Rutinas, series y progreso en un solo sitio.</p>
    <form className="card stack" onSubmit={submit}><h2>{recovery ? 'Nueva clave' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Recuperar acceso'}</h2>
      {!recovery && <label>Correo<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>}
      {(recovery || mode !== 'reset') && <label>Clave<input type="password" autoComplete={mode === 'login' && !recovery ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)}/></label>}
      <button disabled={busy}>{busy ? 'Procesando...' : recovery ? 'Guardar clave' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Registrarme' : 'Enviar enlace'}</button>
      {msg && <p role="status" className="notice">{msg}</p>}
      {!recovery && <div className="row wrap"><button type="button" className="ghost" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMsg(''); }}>{mode === 'signup' ? 'Ya tengo cuenta' : 'Crear cuenta'}</button><button type="button" className="ghost" onClick={() => setMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? 'Volver a entrar' : 'Olvidé mi clave'}</button></div>}
    </form></main>;
}
function Root() {
  const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getSession().then(({ data, error }) => { if (error) setError(error.message); setSession(data.session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => { setSession(value); setLoading(false); if (event === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => subscription.unsubscribe();
  }, []);
  if (!configured) return <main className="auth card"><h1>Configura Supabase</h1><p>Copia .env.example como .env.local, introduce la URL y la clave publicable y reinicia el servidor.</p><p>Las instrucciones completas están en README.md.</p></main>;
  if (loading) return <main className="auth">Cargando cuenta...</main>;
  if (error) return <main className="auth notice">{error}<button onClick={() => location.reload()}>Reintentar</button></main>;
  if (recovery || !session) return <Auth recovery={recovery} recovered={() => setRecovery(false)}/>;
  return <SingleTab key={session.user.id} session={session}/>;
}
function SingleTab({ session }: { session: Session }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let release: (() => void) | undefined; let cancelled = false;
    if (!navigator.locks) { setAllowed(true); return; }
    void navigator.locks.request(`gym-planner:${session.user.id}`, { ifAvailable: true }, async lock => {
      if (cancelled) return;
      setAllowed(Boolean(lock)); if (!lock) return;
      await new Promise<void>(resolve => { release = resolve; });
    });
    return () => { cancelled = true; release?.(); };
  }, [session.user.id]);
  if (allowed === null) return <main className="auth">Abriendo tus datos...</main>;
  if (!allowed) return <main className="auth card"><h1>Ya hay otra pestaña abierta</h1><p>Cierra la otra pestaña de Gym Planner y recarga esta para evitar cambios simultaneos en la copia local.</p><button onClick={() => location.reload()}>Volver a intentar</button></main>;
  return <App session={session}/>;
}
function Picker({ exercises, choose }: { exercises: Exercise[]; choose: (e: Exercise) => void }) {
  const [q, setQ] = useState(''); const [muscle, setMuscle] = useState('');
  const rows = exercises.filter(e => !e.archived && (!muscle || e.muscle === muscle) && `${e.name} ${e.equipment}`.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es')));
  return <div className="stack"><input aria-label="Buscar ejercicio" placeholder="Buscar ejercicio o material..." value={q} onChange={e => setQ(e.target.value)}/>
    <select aria-label="Grupo muscular" value={muscle} onChange={e => setMuscle(e.target.value)}><option value="">Todos los grupos</option>{[...new Set(exercises.filter(e => !e.archived).map(e => e.muscle))].sort().map(m => <option key={m}>{m}</option>)}</select>
    <div className="picker">{rows.map(e => <button type="button" className="pick" key={e.id} onClick={() => choose(e)}><strong>{e.name}</strong><small>{e.muscle} / {e.equipment}</small></button>)}{!rows.length && <p>No hay ejercicios. Puedes crearlos en la biblioteca.</p>}</div></div>;
}
function ExerciseForm({ initial, save }: { initial: Exercise; save: (e: Exercise) => Promise<void> }) {
  const [e, setE] = useState(clone(initial)); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const field = (key: 'name' | 'muscle' | 'equipment' | 'description', value: string) => setE({ ...e, [key]: value });
  async function submit(ev: FormEvent) {
    ev.preventDefault(); setError('');
    if (e.media.some(m => !safeUrl(m.url))) { setError('Todos los enlaces multimedia deben ser HTTPS válidos.'); return; }
    setBusy(true); try { await save({ ...e, name: e.name.trim() }); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}><label>Nombre<input required maxLength={160} value={e.name} onChange={ev => field('name', ev.target.value)}/></label>
    <div className="cols"><label>Grupo muscular<input required value={e.muscle} onChange={ev => field('muscle', ev.target.value)}/></label><label>Material<input value={e.equipment} onChange={ev => field('equipment', ev.target.value)}/></label></div>
    <label>Descripción y técnica<textarea rows={5} value={e.description} onChange={ev => field('description', ev.target.value)}/></label>
    <h3>Fotos, GIF y videos</h3><p className="muted">Imagen/GIF: enlace directo. Video: archivo MP4/WebM. Para YouTube u otras paginas utiliza Enlace.</p>
    {e.media.map((m, i) => <div className="media-row" key={i}><select aria-label="Tipo multimedia" value={m.type} onChange={ev => setE({ ...e, media: e.media.map((x, n) => n === i ? { ...x, type: ev.target.value as Media['type'] } : x) })}><option value="image">Imagen / GIF</option><option value="video">Video directo</option><option value="link">Enlace</option></select>
      <input aria-label="URL multimedia" type="url" required placeholder="Enlace HTTPS" value={m.url} onChange={ev => setE({ ...e, media: e.media.map((x, n) => n === i ? { ...x, url: ev.target.value } : x) })}/><button type="button" className="ghost" onClick={() => setE({ ...e, media: e.media.filter((_, n) => n !== i) })}>Quitar</button></div>)}
    <button type="button" className="secondary" onClick={() => setE({ ...e, media: [...e.media, { type: 'image', url: '' }] })}>+ Multimedia</button>
    {error && <p className="notice" role="alert">{error}</p>}<button disabled={busy}>Guardar ejercicio</button></form>;
}
function RoutineForm({ initial, exercises, save }: { initial: Routine; exercises: Exercise[]; save: (r: Routine) => Promise<void> }) {
  const [r, setR] = useState(clone(initial)); const [picker, setPicker] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  function change(i: number, patch: Partial<Item>) { setR({ ...r, items: r.items.map((x, n) => n === i ? { ...x, ...patch } : x) }); }
  function move(i: number, direction: number) { const items = [...r.items]; const j = i + direction; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; setR({ ...r, items }); }
  async function submit(ev: FormEvent) {
    ev.preventDefault(); if (!r.items.length) { setError('Añade al menos un ejercicio.'); return; }
    setBusy(true); setError(''); try { await save({ ...r, name: r.name.trim() }); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}><label>Nombre de la rutina<input required maxLength={160} value={r.name} onChange={e => setR({ ...r, name: e.target.value })}/></label>
    <p className="muted">Son objetivos editables, no una prescripción de entrenamiento. El peso se registra en cada sesión.</p>
    {r.items.map((x, i) => <section className="card inset stack" key={i}><div className="row wrap"><strong>{i + 1}. {x.name}</strong><div className="actions"><button type="button" className="ghost" disabled={i === 0} onClick={() => move(i, -1)}>Subir</button><button type="button" className="ghost" disabled={i === r.items.length - 1} onClick={() => move(i, 1)}>Bajar</button><button type="button" className="danger ghost" onClick={() => setR({ ...r, items: r.items.filter((_, n) => n !== i) })}>Quitar</button></div></div>
      <div className="cols three"><label>Series<input type="number" min={1} max={100} required value={x.sets} onChange={e => change(i, { sets: Number(e.target.value) })}/></label><label>Repeticiones<input type="number" min={1} max={10000} required value={x.reps} onChange={e => change(i, { reps: Number(e.target.value) })}/></label><label>Descanso (s)<input type="number" min={0} max={3600} required value={x.rest} onChange={e => change(i, { rest: Number(e.target.value) })}/></label></div>
      <label>Notas<input value={x.notes} onChange={e => change(i, { notes: e.target.value })}/></label></section>)}
    <button type="button" className="secondary" onClick={() => setPicker(!picker)}>+ Añadir ejercicio</button>
    {picker && <Picker exercises={exercises} choose={e => { setR({ ...r, items: [...r.items, itemFor(e)] }); setPicker(false); }}/>}
    {error && <p className="notice">{error}</p>}<button disabled={busy}>Guardar rutina</button></form>;
}
function MediaView({ exercise }: { exercise: Exercise }) {
  return <div className="stack"><p className="description">{exercise.description || 'Todavía no hay descripción.'}</p>{exercise.media.map((m, i) => {
    const url = safeUrl(m.url); if (!url) return null;
    return m.type === 'image' ? <a key={i} href={url} target="_blank" rel="noopener noreferrer"><img className="exercise-image" loading="lazy" referrerPolicy="no-referrer" src={url} alt={exercise.name}/></a>
      : m.type === 'video' ? <video key={i} className="exercise-image" src={url} controls preload="none"/>
      : <a key={i} href={url} target="_blank" rel="noopener noreferrer">Abrir recurso multimedia {i + 1}</a>;
  })}</div>;
}
function Stats({ store, exerciseId, exclude, full = false }: { store: Store; exerciseId: string; exclude?: string; full?: boolean }) {
  const s = exerciseStats(store.data.records, exerciseId, exclude);
  return <div className="stats"><p><span className="muted">Última vez: </span>{s.last ? <>{s.last.sets.map(x => `${x.reps} x ${x.weight} kg`).join(' / ')} <small>({date(s.last.workout.started_at)})</small></> : 'Sin series efectivas anteriores'}</p>
    <p><span className="muted">Récord de peso: </span>{s.best ? `${s.best.weight} kg x ${s.best.reps} reps` : 'Sin datos'}</p>
    {full && <><div className="cols"><div className="metric"><strong>{s.maxReps}</strong><small>Máx. repeticiones en una serie</small></div><div className="metric"><strong>{s.maxVolume.toLocaleString('es-ES')}</strong><small>Máx. volumen por sesión (kg x reps)</small></div></div>
      <h3>Evolución</h3>{s.sessions.map(x => <div className="history-line" key={x.workout.id}><small>{date(x.workout.started_at)}</small><span>{x.sets.map(y => `${y.reps} x ${y.weight} kg`).join(' / ')}</span></div>)}
      <p className="muted">Solo sesiones finalizadas y series efectivas completadas. No estima el 1RM.</p></>}
  </div>;
}
function WorkoutView({ workout: w, store, change, close, details, saveTemplate }: { workout: Workout; store: Store; change: (w: Workout) => void; close: () => void; details: (e: Exercise) => void; saveTemplate: (w: Workout) => void }) {
  const [picker, setPicker] = useState(false); const [replaceId, setReplaceId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [until, setUntil] = useState<number | null>(null); const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  const editEx = (id: string, patch: Partial<WorkoutExercise>) => change({ ...w, exercises: w.exercises.map(e => e.id === id ? { ...e, ...patch } : e) });
  function move(i: number, dir: number) { const ex = [...w.exercises]; const j = i + dir; if (j < 0 || j >= ex.length) return; [ex[i], ex[j]] = [ex[j], ex[i]]; change({ ...w, exercises: ex }); }
  function finish() {
    if (!w.name.trim()) { setError('Pon un nombre al entrenamiento.'); return; }
    if (!w.exercises.some(e => e.sets.some(s => s.done))) { setError('Completa al menos una serie antes de finalizar.'); return; }
    if (!confirm('Finalizar entrenamiento? Las series sin marcar no contaran para tus estadísticas.')) return;
    change({ ...w, status: 'completed', ended_at: new Date().toISOString() }); close();
  }
  return <div className="stack"><div className="row wrap"><div><p className="eyebrow">{w.status === 'active' ? 'ENTRENAMIENTO EN CURSO' : 'EDITAR HISTORIAL'}</p><h1>{w.name || 'Entrenamiento'}</h1><p className="muted">{date(w.started_at)} / Peso en kg</p></div><button className="secondary" onClick={close}>Volver</button></div>
    <label>Nombre<input maxLength={160} value={w.name} onChange={e => change({ ...w, name: e.target.value })} onBlur={() => { if (!w.name.trim()) change({ ...w, name: 'Entrenamiento' }); }}/></label>
    <p className="notice">Los cambios se guardan automáticamente. En mancuernas usa siempre el mismo criterio (por mancuerna o total) y anótalo en las notas.</p>
    {until && <div className="rest row"><strong>{remaining > 0 ? `Descanso: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Descanso terminado'}</strong><button className="ghost" onClick={() => setUntil(null)}>Cerrar</button></div>}
    {w.exercises.map((ex, index) => {
      const definition = store.data.exercises.find(e => e.id === ex.exercise_id);
      const stats = exerciseStats(store.data.records, ex.exercise_id, w.id);
      return <section className="card stack" key={ex.id}><div className="row wrap"><div><span className="eyebrow">EJERCICIO {index + 1}</span><h2>{ex.name}</h2></div><div className="actions wrap">
        {definition && <button className="ghost" onClick={() => details(definition)}>Ver técnica</button>}
        <button className="ghost" disabled={index === 0} onClick={() => move(index, -1)}>Subir</button><button className="ghost" disabled={index === w.exercises.length - 1} onClick={() => move(index, 1)}>Bajar</button>
        <button className="ghost" onClick={() => { setReplaceId(ex.id); setPicker(true); }}>Sustituir</button><button className="danger ghost" onClick={() => { if (confirm('Quitar este ejercicio y sus series de esta sesión?')) change({ ...w, exercises: w.exercises.filter(e => e.id !== ex.id) }); }}>Quitar</button></div></div>
        <Stats store={store} exerciseId={ex.exercise_id} exclude={w.id}/>
        {stats.last && <button className="secondary" onClick={() => { if (ex.sets.some(s => s.done) && !confirm('Reemplazar las series actuales por las de la última sesión?')) return; editEx(ex.id, { sets: stats.last!.sets.map(s => ({ ...s, id: uuid(), done: false })) }); }}>Usar series de la última vez</button>}
        <div className="set-row set-heading"><span>Serie</span><span>Reps</span><span>kg</span><span>Cal.</span><span>Hecha</span><span/></div>
        {ex.sets.map((s, i) => <div className={`set-row ${s.done ? 'done' : ''}`} key={s.id}><strong>{i + 1}</strong>
          <input aria-label={`${ex.name} serie ${i + 1} repeticiones`} inputMode="numeric" type="number" min={1} max={10000} step={1} value={s.reps} onChange={e => editEx(ex.id, { sets: ex.sets.map(x => x.id === s.id ? { ...x, reps: e.target.value, done: false } : x) })}/>
          <input aria-label={`${ex.name} serie ${i + 1} peso kg`} inputMode="decimal" type="number" min={0} max={10000} step="any" placeholder="kg" value={s.weight} onChange={e => editEx(ex.id, { sets: ex.sets.map(x => x.id === s.id ? { ...x, weight: e.target.value, done: false } : x) })}/>
          <input type="checkbox" aria-label="Serie de calentamiento" checked={s.warmup} onChange={e => editEx(ex.id, { sets: ex.sets.map(x => x.id === s.id ? { ...x, warmup: e.target.checked } : x) })}/>
          <input type="checkbox" aria-label="Serie completada" checked={s.done} onChange={() => {
            if (!s.done && !validSet(s)) { setError('Introduce repeticiones enteras positivas y peso válido. Para peso corporal, usa 0 kg de carga añadida.'); return; }
            setError(''); editEx(ex.id, { sets: ex.sets.map(x => x.id === s.id ? { ...x, done: !s.done, weight: s.weight.trim() === '' ? '' : String(Number(s.weight)) } : x) });
            if (!s.done && ex.rest > 0 && w.status === 'active') { setNow(Date.now()); setUntil(Date.now() + ex.rest * 1000); }
          }}/><button className="ghost danger" aria-label="Eliminar serie" onClick={() => { if (!s.done || confirm('Eliminar esta serie completada?')) editEx(ex.id, { sets: ex.sets.filter(x => x.id !== s.id) }); }}>x</button></div>)}
        <div className="row wrap"><button className="secondary" disabled={ex.sets.length >= 100} onClick={() => { const last = ex.sets.at(-1); editEx(ex.id, { sets: [...ex.sets, { id: uuid(), reps: last?.reps || '', weight: last?.weight || '', warmup: false, done: false }] }); }}>+ Serie (copia la anterior)</button>
          <label className="rest-input">Descanso (s)<input type="number" min={0} max={3600} value={ex.rest} onChange={e => editEx(ex.id, { rest: Math.max(0, Math.min(3600, Number(e.target.value))) })}/></label></div>
        <label>Notas del ejercicio<input placeholder="Por mancuerna, ajustes de máquina..." value={ex.notes} onChange={e => editEx(ex.id, { notes: e.target.value })}/></label>
      </section>;
    })}
    <button className="secondary" onClick={() => { setReplaceId(null); setPicker(true); }}>+ Añadir ejercicio</button>
    <label>Notas de la sesión<textarea value={w.notes} onChange={e => change({ ...w, notes: e.target.value })}/></label>
    {error && <p role="alert" className="notice">{error}</p>}
    <div className="row wrap"><button className="secondary" onClick={() => saveTemplate(w)}>Guardar como nueva rutina</button>{w.status === 'active' ? <button onClick={finish}>Finalizar entrenamiento</button> : <button onClick={close}>Volver al historial</button>}</div>
    {picker && <Modal title={replaceId ? 'Sustituir ejercicio' : 'Añadir ejercicio'} close={() => setPicker(false)}><Picker exercises={store.data.exercises} choose={e => {
      if (replaceId && !confirm('Sustituir el ejercicio? Sus series actuales se eliminaran de esta sesión.')) return;
      const added = newWorkout([itemFor(e)], '').exercises[0];
      change({ ...w, exercises: replaceId ? w.exercises.map(x => x.id === replaceId ? added : x) : [...w.exercises, added] }); setPicker(false);
    }}/></Modal>}
  </div>;
}
type Dialog = { kind: 'exercise'; value: Exercise } | { kind: 'routine'; value: Routine } | { kind: 'detail'; value: Exercise } | { kind: 'start' } | null;
function App({ session }: { session: Session }) {
  const store = useMemo(() => new Store(session.user.id), [session.user.id]);
  const [, redraw] = useState(0); const [tab, setTab] = useState('Inicio');
  const [dialog, setDialog] = useState<Dialog>(null); const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [query, setQuery] = useState(''); const [muscle, setMuscle] = useState(''); const [archived, setArchived] = useState(false); const [month, setMonth] = useState('');
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => store.subscribe(() => redraw(n => n + 1)), [store]);
  useEffect(() => {
    void store.refresh().then(() => store.sync());
    const network = () => { setOnline(navigator.onLine); if (navigator.onLine) void store.sync().then(() => store.refresh()); };
    const focus = () => { if (document.visibilityState === 'visible') void store.sync().then(() => store.refresh()); };
    const timer = setInterval(() => { if (navigator.onLine) void store.sync(); }, 15000);
    window.addEventListener('online', network); window.addEventListener('offline', network); document.addEventListener('visibilitychange', focus);
    return () => { store.dispose(); clearInterval(timer); window.removeEventListener('online', network); window.removeEventListener('offline', network); document.removeEventListener('visibilitychange', focus); };
  }, [store]);
  const data = store.data; const pending = pendingCount(data);
  const workouts = Object.values(data.records).map(r => r.workout).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const active = workouts.filter(w => w.status === 'active'); const completed = workouts.filter(w => w.status === 'completed');
  const current = currentId ? data.records[currentId]?.workout : null;
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  function requireOnline() { if (!navigator.onLine) throw new Error('Esta operacion necesita conexión. El entrenamiento si se puede registrar sin conexión.'); }
  async function saveExercise(e: Exercise) {
    requireOnline(); const { error } = await supabase!.from('exercises').upsert(e); if (error) throw error;
    data.exercises = [...data.exercises.filter(x => x.id !== e.id), e].sort((a, b) => a.name.localeCompare(b.name)); store.persist(); setDialog(null);
  }
  async function saveRoutine(r: Routine) {
    requireOnline(); const { error } = await supabase!.from('routines').upsert(r); if (error) throw error;
    data.routines = [...data.routines.filter(x => x.id !== r.id), r].sort((a, b) => a.name.localeCompare(b.name)); store.persist(); setDialog(null);
  }
  function start(r?: Routine) {
    if (active.length) { setError('Ya tienes un entrenamiento en curso. Continualo y finalizalo antes de empezar otro.'); setDialog(null); return; }
    const w = newWorkout(r?.items || [], r?.name || 'Entrenamiento personalizado'); store.edit(w); setCurrentId(w.id); setDialog(null);
  }
  async function seed() {
    requireOnline(); const sample = examples(session.user.id);
    const ex = await supabase!.from('exercises').upsert(sample.exercises, { onConflict: 'id', ignoreDuplicates: true }); if (ex.error) throw ex.error;
    const rt = await supabase!.from('routines').upsert(sample.routines, { onConflict: 'id', ignoreDuplicates: true }); if (rt.error) throw rt.error;
    await store.refresh();
  }
  function saveTemplate(w: Workout) {
    setDialog({ kind: 'routine', value: { id: uuid(), user_id: session.user.id, name: `${w.name} (plantilla)`.slice(0, 160),
      items: w.exercises.map(e => ({ exercise_id: e.exercise_id, name: e.name, sets: Math.max(1, e.sets.filter(s => !s.warmup).length), reps: Number(e.sets.find(s => !s.warmup)?.reps) || 8, rest: e.rest, notes: e.notes })) } });
  }
  function workoutCard(w: Workout) {
    const sets = w.exercises.flatMap(e => e.sets).filter(s => s.done);
    return <article className="card row wrap" key={w.id}><div><small className="muted">{date(w.started_at)}</small><h3>{w.name}</h3><p className="muted">{w.exercises.length} ejercicios / {sets.length} series completadas</p></div><button className={w.status === 'active' ? '' : 'secondary'} onClick={() => setCurrentId(w.id)}>{w.status === 'active' ? 'Continuar' : 'Ver / editar'}</button></article>;
  }
  const filtered = data.exercises.filter(e => (archived || !e.archived) && (!muscle || e.muscle === muscle) && `${e.name} ${e.equipment}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  if (store.readFailed) return <main className="auth card"><h1>No se pudo leer la copia local</h1><p>No se han sobrescrito los datos. Exporta el contenido para recuperarlo antes de borrar nada.</p><button onClick={() => download('gym-planner-recuperación.json', { raw: localStorage.getItem(`gym-planner:v1:${session.user.id}`) })}>Exportar copia sin modificar</button></main>;
  return <div className="shell"><header className="topbar"><div className="brand"><img src={`${import.meta.env.BASE_URL}icon-192.png`} alt=""/><strong>Gym Planner</strong></div>
    <span className={`sync ${pending || !online ? 'pending' : ''}`} role="status">{!online ? `Sin conexión / ${pending} pendientes` : store.message ? 'Revisar sincronizacion' : !store.loaded ? 'Cargando datos...' : store.syncing ? 'Sincronizando...' : pending ? `${pending} sesiones pendientes` : 'Guardado en Supabase'}</span></header>
    <nav className="nav" aria-label="Navegación principal">{['Inicio', 'Rutinas', 'Ejercicios', 'Historial', 'Ajustes'].map(t => <button key={t} className={tab === t && !current ? 'selected' : 'ghost'} onClick={() => { setTab(t); setCurrentId(null); setError(''); }}>{t}</button>)}</nav>
    <main className="content"><fieldset disabled={busy} className="app-fieldset">
      {error && <div role="alert" className="notice row wrap"><span>{error}</span><button className="ghost" onClick={() => setError('')}>Cerrar</button></div>}
      {store.storageError && <p role="alert" className="notice">{store.storageError}</p>}
      {store.message && <div role="alert" className="notice row wrap"><span>No se pudo sincronizar: {store.message}</span><button className="secondary" onClick={() => void run(async () => { await store.sync(); await store.refresh(); })}>Reintentar</button></div>}
      {Object.values(data.records).filter(r => r.conflict).map(r => <section className="notice stack" key={r.workout.id}><strong>Hay cambios de otro dispositivo: {r.workout.name}</strong><p>La copia local no se ha sobrescrito. Puedes conservarla como una sesión nueva o usar la versión remota.</p><div className="actions wrap"><button onClick={() => void run(() => store.resolve(r.workout.id, true))}>Conservar ambas</button><button className="secondary" onClick={() => { if (confirm('Descartar los cambios locales de esta sesión?')) void run(() => store.resolve(r.workout.id, false)); }}>Usar remota</button></div></section>)}
      {needRefresh && <div className="notice row wrap"><span>Hay una nueva versión disponible.</span><button disabled={pending > 0 || Boolean(current)} onClick={() => void updateServiceWorker(true)}>Actualizar aplicación</button></div>}
      {current ? <WorkoutView key={current.id} workout={current} store={store} change={w => store.edit(w)} close={() => { setCurrentId(null); setTab('Historial'); }} details={e => setDialog({ kind: 'detail', value: e })} saveTemplate={saveTemplate}/> : <>
        {tab === 'Inicio' && <div className="stack"><section className="hero"><p className="eyebrow">TU ESPACIO DE ENTRENAMIENTO</p><h1>Hoy cuenta.<br/>Registra cada serie.</h1><p>Tu rutina, tus pesos y tu progreso. Sin perder lo que hiciste la última vez.</p><button onClick={() => active.length ? setCurrentId(active[0].id) : setDialog({ kind: 'start' })}>{active.length ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}</button></section>
          <div className="cols three"><div className="metric"><strong>{completed.length}</strong><small>Entrenamientos finalizados</small></div><div className="metric"><strong>{data.routines.length}</strong><small>Rutinas guardadas</small></div><div className="metric"><strong>{data.exercises.filter(e => !e.archived).length}</strong><small>Ejercicios disponibles</small></div></div>
          {active.length > 0 && <><h2>En curso</h2>{active.map(workoutCard)}</>}
          {!data.exercises.length && <section className="card stack"><h2>Prepara tu biblioteca</h2><p>Crea tus ejercicios o carga ejemplos de pierna, pecho, espalda y hombro. Las series y repeticiones de ejemplo son valores de interfaz editables, no recomendaciones.</p><button onClick={() => void run(seed)}>Cargar ejercicios y rutinas de ejemplo</button></section>}
          <h2>Últimos entrenamientos</h2>{completed.slice(0, 5).map(workoutCard)}{!completed.length && <p className="muted">Tu historial aparecera aquí cuando finalices una sesión.</p>}
        </div>}
        {tab === 'Rutinas' && <div className="stack"><div className="row wrap"><div><p className="eyebrow">TUS PLANTILLAS</p><h1>Rutinas</h1></div><button onClick={() => setDialog({ kind: 'routine', value: { id: uuid(), user_id: session.user.id, name: '', items: [] } })}>+ Nueva rutina</button></div>
          <div className="grid">{data.routines.map(r => <article className="card stack" key={r.id}><h2>{r.name}</h2><p className="muted">{r.items.length} ejercicios</p><ol>{r.items.map((i, n) => <li key={n}>{i.name} <small>{i.sets} x {i.reps}</small></li>)}</ol><button onClick={() => start(r)}>Comenzar</button><div className="actions wrap"><button className="ghost" onClick={() => setDialog({ kind: 'routine', value: r })}>Editar</button><button className="ghost" onClick={() => setDialog({ kind: 'routine', value: { ...clone(r), id: uuid(), name: `${r.name} (copia)`.slice(0, 160) } })}>Duplicar</button><button className="ghost danger" onClick={() => { if (confirm('Eliminar la plantilla? El historial no se borra.')) void run(async () => { requireOnline(); const { error } = await supabase!.from('routines').delete().eq('id', r.id); if (error) throw error; data.routines = data.routines.filter(x => x.id !== r.id); store.persist(); }); }}>Eliminar</button></div></article>)}</div>{!data.routines.length && <p>No tienes rutinas. Crea una o carga los ejemplos desde Ajustes.</p>}
        </div>}
        {tab === 'Ejercicios' && <div className="stack"><div className="row wrap"><div><p className="eyebrow">BIBLIOTECA PERSONAL</p><h1>Ejercicios</h1></div><button onClick={() => setDialog({ kind: 'exercise', value: { id: uuid(), user_id: session.user.id, name: '', muscle: '', equipment: '', description: '', media: [], archived: false } })}>+ Nuevo ejercicio</button></div>
          <div className="cols"><input aria-label="Buscar" placeholder="Buscar nombre o material..." value={query} onChange={e => setQuery(e.target.value)}/><select aria-label="Grupo muscular" value={muscle} onChange={e => setMuscle(e.target.value)}><option value="">Todos los grupos</option>{[...new Set(data.exercises.map(e => e.muscle))].sort().map(m => <option key={m}>{m}</option>)}</select></div><label className="inline"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)}/>Mostrar archivados</label>
          <div className="grid">{filtered.map(e => <article className="card stack" key={e.id}><span className="eyebrow">{e.muscle}{e.archived ? ' / ARCHIVADO' : ''}</span><h2>{e.name}</h2><p className="muted">{e.equipment}</p><Stats store={store} exerciseId={e.id}/><div className="actions wrap"><button className="secondary" onClick={() => setDialog({ kind: 'detail', value: e })}>Ficha y progreso</button><button className="ghost" onClick={() => setDialog({ kind: 'exercise', value: e })}>Editar</button><button className="ghost" onClick={() => void run(() => saveExercise({ ...e, archived: !e.archived }))}>{e.archived ? 'Restaurar' : 'Archivar'}</button></div></article>)}</div>
        </div>}
        {tab === 'Historial' && <div className="stack"><div className="row wrap"><div><p className="eyebrow">CADA SESION CUENTA</p><h1>Historial</h1></div><label>Filtrar mes<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label><button className="ghost" onClick={() => setMonth('')}>Todos</button></div>
          {workouts.filter(w => { const d = new Date(w.started_at); return !month || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month; }).map(workoutCard)}{!workouts.length && <p>Todavía no hay entrenamientos.</p>}
        </div>}
        {tab === 'Ajustes' && <div className="stack"><h1>Ajustes y datos</h1><section className="card stack"><h2>Tu cuenta</h2><p>{session.user.email}</p><p className="muted">Los entrenamientos se guardan localmente y se sincronizan con tu cuenta. No borres los datos del navegador si hay cambios pendientes.</p><button className="secondary" onClick={() => void run(async () => { await store.sync(); await store.refresh(); })}>Sincronizar y recargar datos</button><button className="secondary" onClick={() => download(`gym-planner-${new Date().toISOString().slice(0, 10)}.json`, { version: 1, exported_at: new Date().toISOString(), user_id: session.user.id, data })}>Exportar copia JSON</button>
          <p className="muted">La copia contiene datos personales de entrenamiento. Guardala en un lugar privado. Esta versión exporta datos, pero no incluye un importador.</p>
          <button className="ghost danger" disabled={pending > 0 || store.syncing} onClick={() => void run(async () => { const { error } = await supabase!.auth.signOut(); if (error) throw error; localStorage.removeItem(`gym-planner:v1:${session.user.id}`); })}>Cerrar sesión</button>{pending > 0 && <small>Sincroniza los cambios pendientes antes de cerrar sesión.</small>}</section>
          <section className="card stack"><h2>Ejemplos iniciales</h2><p>Incluye ejercicios y plantillas editables. No incluye fotos ni videos de terceros; añade tus enlaces desde cada ficha.</p><button className="secondary" onClick={() => { if (confirm('Cargar ejemplos? Los ejemplos ya existentes no se sobrescribiran.')) void run(seed); }}>Cargar ejemplos</button></section>
          <section className="card stack"><h2>Instalar en Android</h2><p>Abre la web publicada con HTTPS en Chrome y utiliza el menú del navegador: Instalar aplicación o Añadir a pantalla de inicio.</p><p className="muted">Es una PWA, no un APK. La primera carga, el acceso a la cuenta y la edición de la biblioteca requieren conexión. Los videos externos no se descargan para uso sin conexión.</p></section>
        </div>}
      </>}
    </fieldset></main>
    {dialog?.kind === 'start' && <Modal title="Comenzar entrenamiento" close={() => setDialog(null)}><div className="stack"><button onClick={() => start()}>Entrenamiento personalizado</button><h3>Elegir una rutina</h3>{data.routines.map(r => <button className="pick" key={r.id} onClick={() => start(r)}><strong>{r.name}</strong><small>{r.items.length} ejercicios</small></button>)}</div></Modal>}
    {dialog?.kind === 'exercise' && <Modal title="Editar ejercicio" close={() => setDialog(null)}><ExerciseForm initial={dialog.value} save={saveExercise}/></Modal>}
    {dialog?.kind === 'routine' && <Modal title="Editar rutina" close={() => setDialog(null)}><RoutineForm initial={dialog.value} exercises={data.exercises} save={saveRoutine}/></Modal>}
    {dialog?.kind === 'detail' && <Modal title={dialog.value.name} close={() => setDialog(null)}><div className="stack"><p className="eyebrow">{dialog.value.muscle} / {dialog.value.equipment}</p><MediaView exercise={dialog.value}/><Stats store={store} exerciseId={dialog.value.id} exclude={current?.id} full/></div></Modal>}
    <footer>Gym Planner / Tus datos, tu progreso</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Root/>);
