// Base local (IndexedDB). La app lee y escribe siempre acá; sync.js la mantiene al día con la planilla.
import Dexie from './vendor/dexie.mjs';

export const TABLAS = ['Viaje', 'Personas', 'Itinerario', 'Reservas', 'Ideas', 'Votos', 'Categorias', 'Gastos', 'Liquidaciones', 'Equipaje'];

export const db = new Dexie('rio2027');
db.version(1).stores({
  ...Object.fromEntries(TABLAS.map((t) => [t, 'id'])),
  cola: '++seq', // cambios que todavía no llegaron a la planilla
});

export const alCambiarLocal = new EventTarget();

export const nuevoId = () => crypto.randomUUID();

/** Guarda una fila completa: se ve al instante y queda en la cola para subirla. */
export async function guardar(tabla, fila) {
  await db.transaction('rw', db.table(tabla), db.cola, async () => {
    await db.table(tabla).put(fila);
    await db.cola.add({ tabla, fila });
  });
  alCambiarLocal.dispatchEvent(new Event('cambio'));
}

/** Borrado lógico: la fila queda marcada para que los otros celulares se enteren. */
export function borrar(tabla, fila) {
  return guardar(tabla, { ...fila, deleted: true });
}

/** Filas vivas (sin borrar) de una tabla. */
export async function vivas(tabla) {
  return (await db.table(tabla).toArray()).filter((f) => !f.deleted);
}

/** Borra todos los datos de este celular (al salir del viaje). */
export async function vaciar() {
  await db.transaction('rw', [...TABLAS.map((t) => db.table(t)), db.cola], async () => {
    await Promise.all([...TABLAS.map((t) => db.table(t).clear()), db.cola.clear()]);
  });
}
