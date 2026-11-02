// Sincronización: sube la cola de cambios y baja lo nuevo desde el último cursor.
import { db, TABLAS, alCambiarLocal, vaciar } from './db.js';
import { llamar, SinSenal, CodigoInvalido } from './api.js';
import { sesion } from './sesion.js';
import { normalizar } from './util.js';

const LOTE = 200;
const CADA_MS = 60_000;
const ESPERA_TRAS_CAMBIO_MS = 1500;

// Estado visible en la píldora: 'ok' | 'sinSenal' | 'error'.
export const estadoSync = { valor: navigator.onLine ? 'ok' : 'sinSenal', sincronizando: false, ultima: null };
const eventos = new EventTarget();
function avisar(cambios) {
  Object.assign(estadoSync, cambios);
  eventos.dispatchEvent(new Event('cambio'));
}
export function escucharSync(fn) {
  eventos.addEventListener('cambio', fn);
  return () => eventos.removeEventListener('cambio', fn);
}

let enCurso = null;
let repetir = false;

/** Sincroniza ahora. Si ya hay una en curso, se encadena otra al terminar. */
export function sincronizar() {
  if (!sesion.codigo) return Promise.resolve();
  if (enCurso) {
    repetir = true;
    return enCurso;
  }
  enCurso = (async () => {
    avisar({ sincronizando: true });
    try {
      do {
        repetir = false;
        const enviados = await db.cola.orderBy('seq').limit(LOTE).toArray();
        const r = await llamar({
          codigo: sesion.codigo,
          since: sesion.cursor,
          ops: enviados.map(({ tabla, fila }) => ({ tabla, fila })),
        });
        await aplicar(r, enviados);
        if (enviados.length === LOTE) repetir = true;
      } while (repetir);
      avisar({ valor: 'ok', ultima: new Date() });
    } catch (e) {
      if (e instanceof CodigoInvalido) {
        // Rotaron el código: vuelve a la entrada, pero los cambios pendientes se conservan.
        sesion.set({ codigo: null });
        avisar({ valor: 'ok' });
      } else {
        console.warn('[sync]', e);
        avisar({ valor: e instanceof SinSenal ? 'sinSenal' : 'error' });
      }
    } finally {
      enCurso = null;
      avisar({ sincronizando: false });
    }
  })();
  return enCurso;
}

async function aplicar(r, enviados) {
  await db.transaction('rw', [...TABLAS.map((t) => db.table(t)), db.cola], async () => {
    await db.cola.bulkDelete(enviados.map((p) => p.seq));
    // Lo que se editó mientras viajaba el pedido no se pisa: sale en la próxima vuelta.
    const pendientes = new Set((await db.cola.toArray()).map((p) => p.tabla + '|' + p.fila.id));
    for (const [tabla, filas] of Object.entries(r.cambios)) {
      if (!TABLAS.includes(tabla)) continue;
      await db.table(tabla).bulkPut(filas.filter((f) => !pendientes.has(tabla + '|' + f.id)));
    }
    for (const x of r.rechazados) {
      console.warn('[sync] rechazado', x);
      if (!TABLAS.includes(x.tabla)) continue;
      const delServidor = r.cambios[x.tabla]?.some((f) => f.id === x.id);
      if (!delServidor) await db.table(x.tabla).delete(x.id);
    }
  });
  sesion.set({ cursor: r.cursor });
  await resolverPersonaDuplicada(r.rechazados, enviados);
}

// Si dos celulares agregaron el mismo nombre sin señal, me quedo con la persona que ya existía.
async function resolverPersonaDuplicada(rechazados, enviados) {
  const mio = rechazados.find((x) => x.tabla === 'Personas' && x.id === sesion.personaId);
  if (!mio) return;
  const enviada = enviados.find((p) => p.tabla === 'Personas' && p.fila.id === mio.id)?.fila;
  const personas = (await db.Personas.toArray()).filter((p) => !p.deleted);
  const igual = enviada && personas.find((p) => normalizar(p.nombre) === normalizar(enviada.nombre));
  sesion.set({ personaId: igual ? igual.id : null });
}

/**
 * Entrar con un código: valida contra el servidor y baja todo el viaje.
 * Si el código es de otro viaje, se borra lo que había en el celular.
 */
export async function entrar(codigo) {
  const r = await llamar({ codigo, since: 0, ops: [] });
  if (r.viajeId !== sesion.viajeId) {
    await vaciar();
    sesion.set({ personaId: null, viajeId: r.viajeId });
  }
  sesion.set({ codigo, cursor: 0 });
  await aplicar(r, []);
  sincronizar(); // sube lo que haya quedado pendiente con el código viejo
}

/** Arranca la sincronización automática. */
export function iniciarSync() {
  let espera;
  alCambiarLocal.addEventListener('cambio', () => {
    clearTimeout(espera);
    espera = setTimeout(sincronizar, ESPERA_TRAS_CAMBIO_MS);
  });
  addEventListener('online', sincronizar);
  addEventListener('offline', () => avisar({ valor: 'sinSenal' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') sincronizar();
  }, CADA_MS);
  sincronizar();
}
