# Importacion JSON y superseries

Actualizacion preparada sobre los main.tsx y style.css adjuntos. Se conserva
el bloqueo de registro, los materiales predefinidos, la eliminacion de
ejercicios, los grupos musculares y los tipos/orden de rutinas.

## Instalar

1. Sincroniza los entrenamientos y exporta una copia de tus datos. Guarda una
   copia del proyecto y de la base de datos antes de ejecutar migraciones.
2. En Supabase > SQL Editor ejecuta `supabase/004_import_and_supersets.sql`.
   Requiere el esquema inicial y la migracion 002 ya aplicada. Mantiene el
   diseno de historial independiente del catalogo de la migracion 003.
3. Reemplaza `src/main.tsx` y `src/style.css` con los incluidos.
4. Anade estos archivos nuevos a `src/`:
   - `backup.ts`
   - `ImportDialog.tsx`
   - `training-features.ts`
   - `features.test.ts`
5. No reemplaces `domain.ts`, `store.ts`, `catalog.ts`, `client.ts` ni `seed.ts`.
   Los tipos nuevos amplian los existentes sin cambiar sus archivos.
6. Ejecuta en tu proyecto:

   ```powershell
   npm test
   npx tsx --test src/features.test.ts
   npm run build
   ```

7. Publica con tu despliegue habitual. Actualiza tambien las PWA instaladas
   cuando no haya entrenamientos pendientes. Evita usar clientes antiguos:
   un cliente antiguo no conoce las superseries y podria quitarlas al editar.

## Importar y compartir

En Ajustes aparecen tres botones:

- Exportar copia completa JSON: biblioteca, rutinas e historial propio.
- Exportar ejercicios y rutinas para compartir: sin user_id ni historial.
- Importar JSON: selector de archivo, resumen, modo y confirmacion.

El importador admite las copias anteriores version 1 (data.records) y las
nuevas version 2 (data.workouts). Limite de archivo: 20 MB. Valida estructura,
UUID, duplicados, fechas, limites, referencias y enlaces HTTPS antes de enviar.
No importa claves de acceso, sesiones de Auth ni usuarios.

### Anadir como copias

Para compartir o probar rutinas sin sobrescribir las tuyas:

- Crea IDs nuevos para ejercicios, rutinas y grupos de superserie.
- Ajusta las referencias de las rutinas a los ejercicios copiados.
- Usa el usuario conectado, nunca el user_id del archivo.
- No importa historial aunque el archivo sea una copia completa.
- Las rutinas importadas quedan como Borradores al final de tu lista.
- No deduplica por nombre: dos ejercicios con el mismo nombre pueden ser
  variantes diferentes. Importar el mismo archivo como una operacion nueva
  crea nuevas copias.

### Recuperar mi copia

Disponible para copias cuyo user_id coincide con la cuenta conectada.

- Recupera ejercicios/rutinas eliminados y sobrescribe los que tengan el mismo ID.
- Recupera el historial incluido usando las revisiones actuales del servidor.
- Conserva los elementos posteriores que no esten en el archivo. NO es un
  borrado y reemplazo total de la cuenta.
- Recupera los valores anteriores, pero no rebobina los numeros de revision.
- El historial de ejercicios eliminados se conserva aunque no haya ficha.
- Si restauras una sesion activa, despues podras continuarla desde Inicio.

Antes de aplicar, se solicita la descarga de una copia del estado actual.
Comprueba que el navegador la ha guardado. La importacion necesita conexion,
sin sesiones activas ni cambios pendientes. La llamada SQL aplica catalogo,
rutinas e historial en una transaccion: si falla una parte, se revierte esa
llamada. Comprueba este comportamiento en tu proyecto antes de usarlo con
copias importantes.

Se comprueban cambios concurrentes del catalogo y revisiones del historial.
Si aparecen CATALOG_CHANGED o REVISION_CONFLICT, cierra el dialogo, recarga
datos y vuelve a elegir el archivo. Evita editar desde otro dispositivo
mientras importas.

Si se pierde la respuesta por un fallo de red, usa Reintentar en el MISMO
dialogo: conserva el identificador de operacion para no duplicar una llamada
que ya haya terminado. El identificador no se conserva al cerrar o recargar
la pagina; comprueba tus datos antes de iniciar otra importacion tras hacerlo.

La exportacion compartida no incluye el historial ni el campo user_id, pero
los nombres, descripciones y notas pueden contener informacion personal:
revisa el archivo antes de enviarlo. Los archivos multimedia NO se incrustan;
solo se comparten sus enlaces, que deben seguir siendo accesibles.

## Superseries

1. Edita una rutina y anade sus ejercicios como hasta ahora.
2. Marca Seleccionar para superserie en dos o mas ejercicios.
3. Pulsa Crear superserie. Los seleccionados se colocan consecutivamente.
4. Guarda la rutina.

- Puedes tener varios grupos y ejercicios independientes en la misma rutina.
- Subir/Bajar mueve el grupo completo, no rompe la superserie.
- Deshacer grupo conserva los ejercicios y sus objetivos.
- Quitar un ejercicio conserva el grupo si quedan dos o mas; si queda uno,
  vuelve a ser un ejercicio independiente.
- Cada ejercicio mantiene sus propias series, repeticiones, peso y notas.
- Las tarjetas de rutina y entrenamiento muestran el numero de superserie.
- Durante el entrenamiento, completa la misma ronda (fila de serie) en todos
  los ejercicios del grupo. El descanso se activa al completar esa ronda en
  todos los participantes. Se usa el mayor descanso configurado del grupo.
- Si un ejercicio tiene menos series, no participa en las rondas adicionales.
- Las series de calentamiento mantienen su descanso individual. Para rondas
  efectivas consistentes, usa la misma distribucion de calentamiento en los
  ejercicios del grupo; la ronda se identifica por la posicion de la fila.
- No cambia automaticamente el foco ni reordena las tarjetas despues de
  marcar una serie: puedes registrar los ejercicios en el orden que prefieras.
- Los grupos se conservan en Supabase, el historial y las copias JSON.
- Sustituir un ejercicio durante una sesion mantiene su grupo.
- Guardar una sesion como rutina conserva sus superseries.

## SQL y compatibilidad

La migracion agrega `workout_exercises.superset_id` y una tabla de recibos
`gym_import_requests` protegida por RLS. Las funciones se ejecutan con los
permisos del usuario conectado (security invoker).

Para no sustituir la logica de revisiones del proyecto, renombra las funciones
originales a `save_workout_v1_core` y `list_workouts_v1_core`, y crea wrappers
con los nombres publicos anteriores para guardar/devolver las superseries.
`get_workout` tambien se actualiza. Las funciones originales quedan presentes.
No elimina sesiones, series ni tablas existentes. No modifica el registro de
usuarios ni sus ajustes de Auth. No hace falta una clave administrativa.

Si has modificado manualmente save_workout o list_workouts fuera de las
versiones de esta conversacion, revisa su compatibilidad antes de ejecutar.

## Verificacion realizada y pendiente

- Sintaxis de todos los archivos nuevos/reemplazados comprobada.
- 17 pruebas de logica ejecutadas correctamente: copias v1/v2, privacidad de
  exportacion, remapeo de IDs, restauracion, validacion y superseries.
- Comprobacion parcial de tipos contra las interfaces originales reconstruidas
  y declaraciones de dependencias externas, sin errores. NO equivale a una
  compilacion completa con las dependencias de tu proyecto.
- No se ha ejecutado la migracion contra PostgreSQL/Supabase ni probado la
  interfaz en un navegador real. El SQL, RLS, los reintentos de red y la
  persistencia completa deben verificarse en tu proyecto.

Prueba primero una rutina pequena: exportala, cambiala, recuperala y comprueba
que vuelven sus valores. Despues prueba la exportacion compartida con otra
cuenta y una superserie de tres ejercicios, incluyendo recarga de la pagina.
