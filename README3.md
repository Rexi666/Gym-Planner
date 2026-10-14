# Eliminacion de ejercicios y material predefinido

Este paquete contiene cambios puntuales para tu main.tsx actual, no un reemplazo
completo: asi no se sobrescriben los tipos de rutina, los grupos multiples ni
el bloqueo de registro que ya has aplicado.

1. Exporta tus datos y guarda una copia del proyecto.
2. Ejecuta 003_delete_exercises.sql en el SQL Editor de Supabase.
3. Aplica los bloques de cambios-main.tsx.txt en src/main.tsx.
4. Ejecuta npm run build y publica con tu workflow habitual.

La eliminacion es real: borra la fila de exercises y quita el ejercicio de las
plantillas de rutinas. Las rutinas que se queden vacias se conservan para que
puedas editarlas. No borra entrenamientos ni series. Los registros historicos
mantienen su nombre y exercise_id como identificador de instantanea, aunque
ya no exista el ejercicio en la biblioteca. La migracion retira SOLO la clave
foranea que exigia su existencia en exercises; conserva las relaciones de
sesiones, series y propietarios, asi como RLS. No cambia save_workout.

La interfaz bloquea la eliminacion si hay sesiones pendientes de sincronizar
o el ejercicio esta en un entrenamiento activo local. No hay control global
de sesiones activas de otros dispositivos: evita borrar mientras entrenas
con esa misma cuenta en otro dispositivo. Los clientes antiguos pueden tener
una biblioteca en cache: actualiza la app y recarga datos desde Ajustes.

Material: Maquina, Mancuernas, Polea, Barra, Peso corporal, Bandas elasticas,
Kettlebell y Otro (con tildes en la interfaz). Los valores antiguos no se
sobrescriben al abrir el editor: se conserva el valor original hasta elegir
una opcion. Los desconocidos se muestran como Otro, con una nota del valor
anterior. No hace falta migrar la columna equipment.

No se ha ejecutado este SQL en tu proyecto ni compilado tu main.tsx actual.
Se ha revisado la sintaxis de los bloques TSX. Prueba primero con un ejercicio
sin datos importantes y despues comprueba que el historial de uno eliminado
sigue mostrando sus series.
