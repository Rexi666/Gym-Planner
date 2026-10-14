import { type Exercise, type Routine } from './domain';
export function examples(user_id: string): { exercises: Exercise[]; routines: Routine[] } {
  let next = 1;
  const stableId = () => `${user_id.slice(0,24)}${(next++).toString(16).padStart(12,'0')}`;
  const rows = [
    ['Sentadilla', 'Pierna', 'Barra', 'Flexión y extensión de cadera y rodilla con la barra apoyada en la parte superior de la espalda.'],
    ['Prensa de piernas', 'Pierna', 'Máquina', 'Empuje de una plataforma con las piernas desde el asiento de la máquina.'],
    ['Curl femoral', 'Pierna', 'Máquina', 'Flexión de rodilla contra la resistencia de la máquina.'],
    ['Elevación de gemelos', 'Pierna', 'Máquina', 'Elevación de los talones mediante la extensión del tobillo.'],
    ['Press de banca', 'Pecho', 'Barra', 'Empuje de la barra desde el pecho en un banco horizontal.'],
    ['Press inclinado', 'Pecho', 'Mancuernas', 'Empuje de las mancuernas desde un banco inclinado.'],
    ['Aperturas', 'Pecho', 'Máquina', 'Aproximación de los brazos frente al pecho contra resistencia.'],
    ['Jalón al pecho', 'Espalda', 'Polea', 'Tracción de la barra de la polea alta hacia la parte superior del pecho.'],
    ['Remo sentado', 'Espalda', 'Polea', 'Tracción del agarre hacia el tronco desde una posición sentada.'],
    ['Press de hombro', 'Hombro', 'Mancuernas', 'Empuje vertical de las mancuernas desde la altura de los hombros.'],
    ['Elevaciones laterales', 'Hombro', 'Mancuernas', 'Elevación lateral de los brazos contra resistencia.'],
    ['Curl de bíceps', 'Bíceps', 'Mancuernas', 'Flexión del codo para elevar las mancuernas.'],
    ['Extensión de tríceps', 'Tríceps', 'Polea', 'Extensión del codo contra la resistencia de una polea.']
  ];
  const exercises: Exercise[] = rows.map(([name,muscle,equipment,description]) => ({ id: stableId(), user_id, name,muscle,equipment,description,media:[],archived:false }));
  const groups = [ ['Pierna', [0,1,2,3]], ['Pecho y tríceps', [4,5,6,12]], ['Espalda y bíceps', [7,8,11]], ['Hombro', [9,10]], ['Torso', [4,7,8,9]] ] as const;
  const routines = groups.map(([name, índices]) => ({ id:stableId(),user_id,name,items:índices.map(i => ({ exercise_id:exercises[i].id,name:exercises[i].name,sets:3,reps:8,rest:90,notes:'' })) }));
  return { exercises, routines };
}
