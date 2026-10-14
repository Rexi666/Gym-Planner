# Actualizacion: logo, tipos y orden de rutinas, grupos musculares

Este ZIP es un parche para tu proyecto existente, no un proyecto independiente.
Los reemplazos se han generado a partir de los tres archivos que has adjuntado.
No reemplaces el resto del proyecto ni vuelvas a ejecutar el SQL inicial.

## Aplicar

1. Guarda una copia de tu proyecto y exporta tus datos desde Ajustes.
2. En Supabase > SQL Editor ejecuta `supabase/002_routine_types_and_muscles.sql`.
   Es una migracion incremental: agrega columnas y una funcion de ordenacion.
   No elimina tablas, rutinas, ejercicios ni entrenamientos. Mantiene RLS.
3. Copia estos archivos a sus rutas correspondientes en tu repositorio:

   - `index.html`: reemplazar el de la raiz.
   - `src/main.tsx`: reemplazar.
   - `src/style.css`: reemplazar.
   - `src/catalog.ts`: nuevo, obligatorio.
   - `src/catalog.test.ts`: nuevo, pruebas opcionales.
   - `public/icon-192.png`: se incluye el logo original por si falta. Si has
     personalizado tu icono, conserva el tuyo en esta misma ruta.

4. No hace falta modificar `domain.ts`, `store.ts`, `seed.ts`, `client.ts`,
   `vite.config.ts` ni las variables de entorno. Los nuevos tipos amplian los
   anteriores mediante `catalog.ts`.
5. En tu proyecto, comprueba:

   ```bash
   npm test
   npx tsx --test src/catalog.test.ts
   npm run build
   ```

6. Sube los cambios a GitHub para ejecutar tu despliegue habitual.
7. Cuando la app muestre que hay una nueva version, actualizala despues de
   sincronizar las sesiones pendientes. No borres el almacenamiento local
   si hay entrenamientos pendientes de sincronizar.

## Cambios

### Logo

Se reutiliza `public/icon-192.png` como favicon (icono de la pestaña del navegador).
Tambien se incluye en la barra de pestañas de la web; pulsarlo vuelve a Inicio
sin borrar el entrenamiento. Las rutas usan BASE_URL para respetar tu despliegue.
No se ha generado un logo nuevo.

### Rutinas

- Filtros Todas, Activas, Borradores y Descartadas, con contadores.
- Selector de tipo en cada tarjeta y en el editor.
- Botones Subir/Bajar para ordenar, compatibles con movil.
- El orden se guarda en Supabase mediante una funcion transaccional.
- Al filtrar por tipo, Subir/Bajar intercambia las rutinas de ese tipo sin
  alterar las posiciones de las rutinas ocultas.
- Solo las Activas aparecen en el selector para comenzar un entrenamiento.
- Las rutinas existentes se consideran Activas.
- Las nuevas, las duplicadas y las guardadas desde un entrenamiento empiezan
  como Borradores; puedes cambiar el tipo antes de guardar.
- Al guardar una rutina se abre su filtro para que la veas inmediatamente.
- Descartada no significa eliminada: se puede editar y volver a activar.
- Los ejemplos iniciales siguen siendo Activos y no sobrescriben los existentes.
- Cambiar el tipo u ordenar necesita conexion, como el editor anterior.

### Grupos musculares

- Seleccion multiple por casillas; ya no hay que escribir el nombre.
- Etiquetas de color por grupo en biblioteca, selector, ficha y entrenamiento.
- El filtro encuentra el ejercicio por cualquiera de sus grupos.
- Grupos: Pecho, Espalda, Hombro, Biceps, Triceps, Antebrazo, Pierna,
  Cuadriceps, Isquiotibiales, Gluteos, Gemelos, Aductores, Abductores,
  Abdominales, Lumbar y Trapecio (se muestran con sus tildes en la web).
- Se mantiene Pierna como etiqueta general para respetar tus ejercicios antiguos.
- Los nombres antiguos habituales se normalizan al mostrarlos, por ejemplo
  Biceps -> Bíceps y Hombros -> Hombro.
- Los nombres antiguos desconocidos no se borran: se muestran en gris y en el
  editor puedes quitarlos y sustituirlos por grupos predefinidos.
- No se asignan automaticamente grupos secundarios a ejercicios existentes:
  seleccionalos al editar cada ejercicio.
- `muscles` guarda la lista nueva; `muscle` se mantiene como texto compatible
  con el codigo anterior. No se modifican los IDs ni el historial.

## Comprobacion realizada

Sintaxis TypeScript/TSX comprobada y seis pruebas de logica ejecutadas con exito
(normalizacion, multiseleccion, estados, orden, filtros y colores distintos).
No se ha probado la compilacion completa con tus dependencias, la interfaz en
un navegador ni la migracion contra tu Supabase real. El SQL debe ejecutarse
antes de publicar el frontend nuevo.
