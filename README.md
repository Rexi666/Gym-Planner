# Gym Planner

Primera versión funcional propuesta: React + TypeScript + Vite + Supabase + PWA.
El código necesita configuración y pruebas en TU proyecto antes de usarlo con datos importantes.

## Que incluye

- Registro, acceso, confirmación de correo y recuperación de clave con Supabase Auth.
- Biblioteca personal: crear, editar, archivar, buscar y filtrar ejercicios.
- Descripción editable y multiples enlaces a fotos/GIF, videos directos y paginas externas.
- Rutinas: crear, editar, duplicar, eliminar, combinar grupos musculares y ordenar ejercicios.
- Entrenamiento desde plantilla o vacio, con sustitucion, eliminacion y reordenacion.
- Series independientes con repeticiones, kg decimales, calentamiento y casilla de completada.
- Copiar series anteriores, añadir series y descanso visual.
- Última sesión, récord de peso (y reps a ese peso), máximas repeticiones y volumen por sesión.
- Historial editable y filtro por mes.
- Guardado local inmediato, sincronización diferida y recuperación de entrenamientos.
- Control de revisiones, reintentos idempotentes y resolucion conservadora de conflictos.
- Exportación JSON (sin importador automático).
- Manifest, iconos y service worker para instalar la web como PWA.
- Workflow de GitHub Pages.

Los ejemplos iniciales son datos de demostracion editables, no un plan recomendado ni una guia técnica completa. No se incluyen imagenes o videos de terceros. El icono fue generado con Microsoft Copilot.

## 1. Requisitos

- Node.js 22.12 o posterior compatible con Vite 7. Se recomienda Node 22 LTS.
- npm.
- Un proyecto NUEVO de Supabase. No ejecutes el SQL sobre tablas existentes con los mismos nombres.

## 2. Base de datos

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Abre SQL Editor, crea una consulta y pega TODO `supabase/001_schema.sql`.
3. Ejecutala una sola vez. La transacción crea las tablas, índices, RLS y funciones RPC.
4. Comprueba que existen `exercises`, `routines`, `workouts`, `workout_exercises`, `workout_sets`.
5. El esquema `public` debe estar expuesto a la Data API. No desactives RLS.

Las funciones `save_workout`, `list_workouts` y `get_workout` se ejecutan como el usuario que llama, no como administrador.

## 3. Configurar la web

Abre una terminal en esta carpeta:

```bash
npm install
```

Copia `.env.example` como `.env.local`:

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Edita `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
VITE_BASE_PATH=/
```

La URL y la clave publicable se obtienen en el dialogo Connect del proyecto o en su configuración de API. Usa la clave `sb_publishable_...`. Nunca pongas una clave secreta, `service_role`, contraseña de base de datos o JWT secret en variables `VITE_`.

Las variables `VITE_` se incorporan al JavaScript publico. La privacidad de los datos depende de Auth y RLS, no de esconder la clave publicable.

## 4. Configurar Auth

En Supabase, Authentication:

1. Habilita el proveedor de correo/contraseña y el registro de nuevos usuarios si no lo están.
2. En URL Configuration, configura Site URL con la direccion de la web.
3. En Redirect URLs añade la direccion exacta local y la publicada, incluida la ruta del repositorio si existe.
4. En local, con `VITE_BASE_PATH=/`, la direccion de retorno usada por este código es [localhost con puerto 5173](http://localhost:5173/).
5. Mantener la confirmación de correo es recomendable. Si esta activada, confirma el correo antes de entrar.
6. Configura SMTP propio y revisa limites de envio antes de abrir el registro al publico.

El código utiliza acceso por correo/contraseña y los callbacks de Supabase Auth. No necesita Google OAuth.

## 5. Ejecutar y probar

```bash
npm run dev
```

Abre la direccion que muestre Vite. Si usa un puerto diferente a 5173, añádelo también a Redirect URLs.

1. Crea una cuenta y confirma el correo si se solicita.
2. Pulsa **Cargar ejercicios y rutinas de ejemplo** en Inicio o Ajustes.
3. Abre una rutina, pulsa Comenzar, introduce repeticiones y peso y marca una serie.
4. Finaliza la sesión y comienza otra con el mismo ejercicio para ver la última vez y el récord.
5. Edita un ejercicio y añade una URL HTTPS de imagen, GIF o video propio/autorizado.

Para comprobar la compilación y las pruebas:

```bash
npm test
npm run build
npm run preview
```

`npm run build` comprueba tipos y genera `dist/`. `npm run preview` sirve esa compilación localmente; no es un servidor de produccion. No abras `index.html` con doble clic.

Tras la primera instalación, conserva y sube el `package-lock.json` generado. El workflow usa `npm install` para admitir esta entrega sin lockfile. Una vez fijado el lockfile, puedes cambiarlo a `npm ci`.

## 6. Publicar en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta, incluida `.github/workflows/deploy.yml`.
2. No subas `.env.local`, `node_modules` ni `dist`.
3. En Settings > Secrets and variables > Actions crea estos repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. En la pestaña Variables crea `VITE_BASE_PATH`:
   - Repositorio normal: `/nombre-exacto-del-repositorio/`.
   - Sitio de usuario o dominio propio: `/`.
5. En Settings > Pages > Build and deployment selecciona **GitHub Actions**.
6. Sube los cambios a la rama `main` o ejecuta el workflow manualmente.
7. Revisa Actions: debe completar pruebas, compilación y despliegue.
8. Copia la direccion publicada que muestra Pages y configurala como Site URL y Redirect URL en Supabase, con barra final y ruta correcta.

El workflow usa por defecto la ruta del nombre del repositorio si no defines `VITE_BASE_PATH`. Para dominio propio o sitio de usuario define expresamente `/`.

No se usa un router con rutas de servidor: la navegación es interna, evitando los 404 de recarga de subpaginas en Pages.

## 7. Instalar en Android

1. Publica la compilación con HTTPS.
2. Abrela en Chrome en el telefono, entra en tu cuenta y deja que cargue la aplicación.
3. Usa el menú del navegador: **Instalar aplicación** o **Añadir a pantalla de inicio**. La etiqueta varia según navegador/dispositivo.
4. Abrela desde el icono.

Es una PWA instalable, no un APK ni una publicación en Google Play. El service worker se genera en la compilación de produccion. Prueba la instalación sobre la web publicada o con `npm run preview`, no solo con `npm run dev`.

## 8. Sin conexión y conflictos

- Necesitas conexión para la primera carga, iniciar sesión, recuperar clave y crear/editar ejercicios o rutinas.
- Una vez cargada la PWA y con la sesión local disponible, el registro del entrenamiento usa la biblioteca guardada en el dispositivo.
- Cada cambio del entrenamiento se copia a localStorage. La sincronización se intenta tras una pausa de escritura, al recuperar conexión y periódicamente mientras la app esta abierta.
- No hay sincronización garantizada con la app cerrada. Abrela con conexión para enviar los cambios pendientes.
- Si caduca la sesión o el navegador elimina el almacenamiento, puede ser necesario volver a autenticarte. No borres datos locales con cambios pendientes.
- Los archivos multimedia externos NO se guardan para uso sin conexión.
- Las rutinas y ejercicios se editan online; no tienen control de revisiones en esta versión. Evita editarlos simultaneamente desde dos dispositivos.
- Los entrenamientos si tienen control de revisiones: si dos dispositivos editan la misma sesión, se muestra un conflicto. **Conservar ambas** deja la remota intacta y crea una nueva sesión con los datos locales. **Usar remota** descarta los cambios locales de esa sesión tras confirmación.
- En navegadores con Web Locks se impide abrir dos pestañas de edición de la misma cuenta. Si no hay soporte, usa una sola pestaña.
- El descanso es un contador visual: no tiene alarma en segundo plano ni notificaciones Android.

## 9. Datos y criterios

- Todo el peso se guarda en kg. Esta versión no convierte libras.
- Para peso corporal se puede introducir 0 kg de carga añadida.
- Para mancuernas decide si registras peso por mancuerna o total y mantente consistente. Anotalo en las notas.
- Los récords usan solo sesiones finalizadas y series efectivas marcadas como completadas.
- Se excluyen series de calentamiento y series sin completar.
- El récord de peso muestra el mayor peso registrado y las reps realizadas con el. No estima el 1RM.
- El volumen mostrado es la suma de kg x repeticiones de las series efectivas del ejercicio en una sesión. No compara ejercicios distintos.
- Archivar un ejercicio no borra su historial.
- La plantilla se copia al iniciar una sesión. Cambiar la sesión no modifica la plantilla.
- Las rutinas guardan sus elementos en `routines.items` (JSONB) para simplificar la edición atómica. Las sesiones, ejercicios realizados y series si están normalizados en tablas separadas.
- La descripción y multimedia se guardan en `exercises`; no hay una tabla `exercise_media` ni subida directa de archivos en esta versión. Puedes usar enlaces propios de Storage o de otro alojamiento.
- No hay calendario en cuadrícula, gráficas avanzadas, importación JSON ni borrado de sesiones desde la interfaz. El historial tiene filtro mensual y tablas de evolución por ejercicio.

## 10. Seguridad y copias

RLS limita cada fila al usuario autenticado. Las claves foraneas compuestas impiden enlazar series/sesiones con ejercicios de otra cuenta. Revisa las políticas en tu proyecto y prueba con dos cuentas antes de compartir la app.

La copia local no esta cifrada. Cerrar sesión desde la app elimina su cache local una vez sincronizada; no uses dispositivos compartidos para datos sensibles. Los enlaces multimedia externos pueden revelar la IP al alojamiento al cargarse. Usa contenido propio o con permiso.

Exportar JSON es una copia de recuperación manual, no sustituye los backups de la base de datos. No incluye contraseñas ni tokens de acceso. Protege el archivo porque contiene tu historial.

## 11. Comprobaciones de aceptacion

Antes de depender de la app:

- [ ] `npm test` y `npm run build` terminan correctamente.
- [ ] Registro, confirmación, acceso y recuperación de clave funcionan con las URL reales.
- [ ] Una segunda cuenta no puede ver ni modificar los datos de la primera.
- [ ] Un entrenamiento iniciado desde plantilla no cambia esa plantilla.
- [ ] Cambiar reps/peso desmarca la serie para exigir confirmación.
- [ ] Recargar durante una sesión conserva las series locales.
- [ ] Tras cargar la PWA, desconectar la red, registrar una serie y volver a conectar sincroniza sin duplicados.
- [ ] Editar la misma sesión en dos dispositivos muestra conflicto sin sobrescritura silenciosa.
- [ ] Archivar un ejercicio conserva sus récords e historial.
- [ ] La PWA instalada abre desde el icono y usa la ruta correcta.

## 12. Estado de verificación de esta entrega

Se ha comprobado la transpilación sintáctica de los archivos TypeScript/TSX y se han ejecutado las cuatro pruebas de lógica de `domain.test.ts` y cinco pruebas de sincronización con un cliente simulado (todas correctas). Las pruebas simuladas no verifican el SQL ni la conexión real.

No se ha podido completar `npm install` en el entorno de generación. Por tanto, NO se ha verificado la compilación completa de Vite ni la comprobación de tipos con todas las dependencias. Tampoco se ha ejecutado el SQL contra un proyecto real de Supabase ni probado la interfaz en Android. El workflow incluido ejecuta pruebas y compilación antes de publicar.

## Estructura

```text
gym-planner/
  .github/workflows/deploy.yml
  .env.example
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/icon-192.png
  public/icon-512.png
  src/client.ts
  src/domain.ts
  src/domain.test.ts
  src/store.ts
  src/seed.ts
  src/main.tsx
  src/style.css
  supabase/001_schema.sql
```

## Referencias oficiales

- [Supabase con React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Supabase Auth con React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Claves API](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Redirecciones de Auth](https://supabase.com/docs/guides/auth/redirect-urls)
- [Configuración de Auth](https://supabase.com/docs/guides/auth/general-configuration)
- [Desplegar Vite y GitHub Pages](https://vite.dev/guide/static-deploy)
- [Actualizaciones PWA con confirmación](https://vite-pwa-org.netlify.app/guide/prompt-for-update)
- [Instalación de PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
