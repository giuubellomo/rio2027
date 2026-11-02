// Lo que queda guardado en este celular: código, quién soy y hasta dónde sincronicé.

const CLAVES = { codigo: 'rio.codigo', personaId: 'rio.personaId', cursor: 'rio.cursor', viajeId: 'rio.viajeId' };
const memoria = {}; // por si el navegador no deja usar localStorage
const eventos = new EventTarget();

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return memoria[clave] ?? null;
  }
}

function escribir(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, String(valor));
  } catch {
    if (valor == null) delete memoria[clave];
    else memoria[clave] = String(valor);
  }
}

export const sesion = {
  get codigo() { return leer(CLAVES.codigo); },
  get personaId() { return leer(CLAVES.personaId); },
  get cursor() { return Number(leer(CLAVES.cursor)) || 0; },
  get viajeId() { return leer(CLAVES.viajeId); },

  /** Cambia uno o más valores: sesion.set({ personaId: 'x' }). null borra. */
  set(cambios) {
    for (const [k, v] of Object.entries(cambios)) escribir(CLAVES[k], v);
    eventos.dispatchEvent(new Event('cambio'));
  },

  escuchar(fn) {
    eventos.addEventListener('cambio', fn);
    return () => eventos.removeEventListener('cambio', fn);
  },
};
