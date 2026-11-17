// Componentes y hooks compartidos por todas las pantallas.
import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { liveQuery } from './vendor/dexie.mjs';
import { db } from './db.js';
import { sesion } from './sesion.js';
import { estadoSync, escucharSync, sincronizar } from './sync.js';
import { DURACIONES, inicial, textoDuracion } from './util.js';

/** Resultado de una consulta a la base local que se actualiza solo cuando cambian los datos. */
export function useLive(consulta, deps = [], inicialValor) {
  const [valor, setValor] = useState(inicialValor);
  useEffect(() => {
    const sub = liveQuery(consulta).subscribe({
      next: (v) => setValor(() => v),
      error: (e) => console.error('[useLive]', e),
    });
    return () => sub.unsubscribe();
  }, deps);
  return valor;
}

export function useSesion() {
  const leer = () => ({ codigo: sesion.codigo, personaId: sesion.personaId });
  const [s, setS] = useState(leer);
  useEffect(() => sesion.escuchar(() => setS(leer())), []);
  return s;
}

export function useSync() {
  const [s, setS] = useState({ ...estadoSync });
  useEffect(() => escucharSync(() => setS({ ...estadoSync })), []);
  const pendientes = useLive(() => db.cola.count(), [], 0);
  return { ...s, pendientes };
}

export function useViaje() {
  return useLive(() => db.Viaje.get('viaje'), []);
}

export function usePersonas() {
  return useLive(async () => (await db.Personas.toArray()).filter((p) => !p.deleted).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [], []);
}

export function useYo() {
  const { personaId } = useSesion();
  return useLive(() => (personaId ? db.Personas.get(personaId) : undefined), [personaId]);
}

// ───────── Piezas visuales ─────────

export function Avatar({ persona, tam = 44 }) {
  const estilo = `width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.4)}px;background:${persona?.color || '#DDD8CC'}`;
  return html`<span class="avatar" style=${estilo} aria-hidden="true">${inicial(persona?.nombre)}</span>`;
}

const PUNTOS_ESTRELLA = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 === 0 ? 44 : 30;
  const a = (Math.PI * i) / 12 - Math.PI / 2;
  return (r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1);
}).join(' ');

export function Estrella({ tam = 170 }) {
  return html`<svg class="estrella" aria-hidden="true" width=${tam} height=${tam} viewBox="-50 -50 100 100">
    <polygon points=${PUNTOS_ESTRELLA} fill="#FFD84D" stroke="#16161A" stroke-width="2.5" stroke-linejoin="round" />
    <circle cx="-8" cy="-4" r="3.5" fill="#16161A" />
    <circle cx="8" cy="-4" r="3.5" fill="#16161A" />
    <path d="M-8 8 Q 0 15 8 8" fill="none" stroke="#16161A" stroke-width="3" stroke-linecap="round" />
  </svg>`;
}

export function Flecha() {
  return html`<span class="flecha" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
  </span>`;
}

/** Píldora de sincronización: Al día · Pendientes · Sin señal (RF-11). Tocarla sincroniza. */
export function PildoraSync() {
  const s = useSync();
  let texto = 'Al día';
  let clase = '';
  if (s.valor === 'sinSenal') {
    texto = s.pendientes ? `Sin señal · ${s.pendientes}` : 'Sin señal';
    clase = 'alerta';
  } else if (s.valor === 'error') {
    texto = 'Error al sincronizar';
    clase = 'alerta';
  } else if (s.pendientes) {
    texto = `Pendientes · ${s.pendientes}`;
    clase = 'pendiente';
  }
  return html`<button type="button" class=${'pildora-sync ' + clase} onClick=${sincronizar} aria-live="polite"
    aria-label=${texto + '. Tocá para sincronizar.'}>
    <span class="punto" aria-hidden="true"></span>${texto}
  </button>`;
}

/** Panel que sube desde abajo, para crear y editar. Se cierra con la X, con Escape o tocando afuera. */
export function Hoja({ titulo, alCerrar, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement;
    panel.current?.focus();
    const tecla = (e) => e.key === 'Escape' && alCerrar();
    addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
  }, []);
  return html`<div class="velo" onClick=${(e) => e.target === e.currentTarget && alCerrar()}>
    <div class="hoja-panel" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" tabindex="-1" ref=${panel}>
      <div class="hoja-cabeza">
        <h2 id="hoja-titulo">${titulo}</h2>
        <button type="button" class="cerrar" aria-label="Cerrar" onClick=${alCerrar}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      ${children}
    </div>
  </div>`;
}

export function BotonAgregar({ etiqueta, onClick }) {
  return html`<button type="button" class="boton-agregar chico" aria-label=${etiqueta} onClick=${onClick}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
  </button>`;
}

/** Botón de borrar que pide confirmación en el mismo lugar (sin ventanas del navegador). */
export function BotonBorrar({ onBorrar, que = 'esto' }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) return html`<button type="button" class="boton-borde peligro" onClick=${() => setConfirmando(true)}>Borrar</button>`;
  return html`<div class="acciones">
    <button type="button" class="boton-borde peligro" onClick=${onBorrar}>Sí, borrar ${que}</button>
    <button type="button" class="boton-borde" onClick=${() => setConfirmando(false)}>Cancelar</button>
  </div>`;
}

const ICONOS = {
  inicio: html`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`,
  itinerario: html`<rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />`,
  reservas: html`<path d="M3 7h18v3.5a1.5 1.5 0 0 0 0 3V17H3v-3.5a1.5 1.5 0 0 0 0-3z" /><path d="M15 7v10" stroke-dasharray="2 2" />`,
  ideas: html`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.6.6.8 1.3.8 2.4h6c0-1.1.2-1.8.8-2.4A6 6 0 0 0 12 3z" />`,
  gastos: html`<path d="M3 7.5h15.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5H3z" /><path d="M3 7.5L15 4v3.5M16.5 14h1.5" />`,
};
const SECCIONES = [['inicio', 'Inicio'], ['itinerario', 'Itinerario'], null, ['ideas', 'Ideas'], ['gastos', 'Gastos']];
// Pantallas que viven como pestaña dentro de otra sección del menú.
const SECCION_DE = { reservas: 'itinerario', mapa: 'ideas' };

/** Menú de abajo: 4 secciones y el ＋ en el centro para agregar cualquier cosa. */
export function Nav({ ruta }) {
  const [agregando, setAgregando] = useState(false);
  // Si se cambia de pantalla (tocando otra sección del menú), el ＋ se cierra.
  useEffect(() => setAgregando(false), [ruta]);
  const activa = SECCION_DE[ruta] || ruta;
  return html`
    <nav class="nav" aria-label="Secciones">
      ${SECCIONES.map((s) => s
        ? html`<a href=${'#/' + s[0]} aria-label=${s[1]} aria-current=${activa === s[0] ? 'page' : undefined} onClick=${() => setAgregando(false)}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[s[0]]}</svg>
          </a>`
        : html`<button type="button" class="nav-mas" aria-label=${agregando ? 'Cerrar' : 'Agregar'} aria-expanded=${agregando ? 'true' : 'false'} aria-controls="menu-agregar" onClick=${() => setAgregando(!agregando)}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>`)}
    </nav>
    ${agregando && html`<${MenuAgregar} alCerrar=${() => setAgregando(false)} />`}`;
}

// Qué se puede agregar desde el ＋, en dos columnas de tres (de arriba hacia abajo, fila por fila).
// Las más usadas quedan abajo, cerca del botón: [pantalla, nombre, color].
const OPCIONES_AGREGAR = [
  ['ideas', 'Idea', 'var(--amarillo)'], ['fotos', 'Fotos', 'var(--blanco)'],
  ['itinerario', 'Actividad', 'var(--celeste)'], ['llevar', 'Qué llevar', 'var(--menta)'],
  ['gastos', 'Gasto', 'var(--coral)'], ['reservas', 'Reserva', 'var(--lila)'],
];
const ICONOS_AGREGAR = {
  ...ICONOS,
  llevar: html`<rect x="4" y="7" width="16" height="13" rx="2.5" /><path d="M9 7V4.5h6V7M4 12.5h16" />`,
  fotos: html`<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />`,
};

/** Opciones que suben en línea desde el ＋ del menú. */
function MenuAgregar({ alCerrar }) {
  const viaje = useViaje();
  const lista = useRef(null);
  useEffect(() => {
    lista.current?.querySelectorAll('button')[4]?.focus();
    const tecla = (e) => e.key === 'Escape' && alCerrar();
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);
  function elegir(ruta) {
    alCerrar();
    // Fotos: si ya hay álbum, se abre directo para subir; si no, la pantalla explica cómo cargarlo.
    if (ruta === 'fotos' && viaje?.linkAlbum) return void open(viaje.linkAlbum, '_blank', 'noopener');
    pedirAgregar(ruta);
  }
  return html`
    <div class="velo-agregar" onClick=${alCerrar}></div>
    <ul class="menu-agregar" id="menu-agregar" aria-label="Agregar" ref=${lista}>
      ${OPCIONES_AGREGAR.map(([ruta, nombre, color], k) => html`
        <li style=${'--orden:' + (2 - Math.floor(k / 2))}>
          <button type="button" onClick=${() => elegir(ruta)}>
            <span class="icono" style=${'background:' + color} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONOS_AGREGAR[ruta]}</svg>
            </span>
            ${nombre}
          </button>
        </li>`)}
    </ul>`;
}

// El ＋ del menú deja un pedido y lleva a la pantalla; la pantalla lo toma y abre su formulario.
let pedido = null;
function pedirAgregar(ruta) {
  pedido = ruta;
  if (location.hash !== '#/' + ruta) location.hash = '#/' + ruta;
  dispatchEvent(new Event('pedido-agregar')); // por si ya estaba en esa pantalla
}

/** Abre el formulario de la pantalla cuando se eligió en el ＋ del menú. */
export function usePedidoAgregar(ruta, abrir) {
  const ultimo = useRef(abrir);
  ultimo.current = abrir;
  useEffect(() => {
    const revisar = () => {
      if (pedido !== ruta) return;
      pedido = null;
      ultimo.current();
    };
    revisar();
    addEventListener('pedido-agregar', revisar);
    return () => removeEventListener('pedido-agregar', revisar);
  }, []);
}

/** Título con pestañas: dos pantallas hermanas que comparten un lugar en el menú. */
const GRUPOS = {
  itinerario: [['itinerario', 'Itinerario'], ['reservas', 'Reservas']],
  ideas: [['ideas', 'Ideas'], ['mapa', 'Mapa']],
};
export function TituloPestanas({ actual }) {
  const grupo = GRUPOS[SECCION_DE[actual] || actual];
  const [, nombre] = grupo.find(([id]) => id === actual);
  const [otraId, otra] = grupo.find(([id]) => id !== actual);
  return html`<div class="pestanas">
    <h1>${nombre}</h1>
    <a class="pestana-otra" href=${'#/' + otraId}>${otra} ›</a>
  </div>`;
}

/** Selector de duración opcional. Guarda minutos (número) o null. */
export function CampoDuracion({ id, valor, alCambiar }) {
  // Si guardaron una duración que no está en la lista, se ofrece igual para no perderla.
  const opciones = valor && !DURACIONES.includes(valor) ? [...DURACIONES, valor].sort((a, b) => a - b) : DURACIONES;
  return html`<div class="campo">
    <label for=${id}>Duración <span class="opcional">(opcional)</span></label>
    <select id=${id} class="entrada" value=${valor || ''} onChange=${(e) => alCambiar(Number(e.currentTarget.value) || null)}>
      <option value="">Sin definir</option>
      ${opciones.map((m) => html`<option value=${m}>${textoDuracion(m)}</option>`)}
    </select>
  </div>`;
}
