// Ideas: proponer, guardar links de TikTok o Reels, votar y pasar al itinerario (RF-21 a RF-29).
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { Avatar, BotonAgregar, BotonBorrar, CampoDuracion, Flecha, Hoja, TituloPestanas, useLive, usePedidoAgregar, usePersonas, useSesion, useViaje } from '../ui.js';
import { diasDelViaje, hoyISO, normalizar, partesDia, textoDuracion } from '../util.js';
import { CATEGORIAS as CATEGORIAS_ITINERARIO, useEventos } from './itinerario.js';
import { CampoUbicacion, tieneUbicacion } from '../lugares.js';

// Categorías que vienen de fábrica. Se guardan en la planilla recién cuando alguien las usa.
const CATEGORIAS_BASE = [
  { id: 'cat-playa', nombre: 'Playa', color: 'var(--celeste)' },
  { id: 'cat-comida', nombre: 'Comida', color: '#FF9C7F' },
  { id: 'cat-paseo', nombre: 'Paseo', color: 'var(--menta)' },
  { id: 'cat-noche', nombre: 'Noche', color: 'var(--lila)' },
  { id: 'cat-tips', nombre: 'Tips', color: 'var(--amarillo)' },
];
const COLORES_EXTRA = ['#FFB3D9', '#B8E986', '#FFB570', '#A0E7F0', '#E0C3A0'];

const FUENTES = { tiktok: 'TikTok', reels: 'Reels' };

// Saldo mínimo para poder pasar una idea al itinerario (RF-29).
// Si son menos de 3 en el viaje, alcanza con que estén todas a favor.
const saldoParaAgendar = (personas) => Math.max(1, Math.min(3, personas.length));

/**
 * El id sale del nombre: si dos celulares crean «Compras» sin señal, es la misma categoría
 * y no queda duplicada (RF-27).
 */
function idCategoria(nombre) {
  const slug = normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return slug ? 'cat-' + slug : 'cat-' + nuevoId();
}

/** TikTok o Reels según la URL (RF-22). Cualquier otro link queda sin fuente. */
export function detectarFuente(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)instagram\.com$/.test(host) || host === 'instagr.am') return 'reels';
  return '';
}

/** Primer link que aparezca en un texto (TikTok comparte el link dentro del texto). */
function extraerLink(texto) {
  return String(texto || '').match(/https?:\/\/\S+/)?.[0] || '';
}

export function useCategorias() {
  return useLive(async () => {
    const guardadas = (await db.Categorias.toArray()).filter((c) => !c.deleted);
    const base = CATEGORIAS_BASE.map((b) => ({ ...b, ...guardadas.find((c) => c.id === b.id), color: b.color }));
    const propias = guardadas
      .filter((c) => !CATEGORIAS_BASE.some((b) => b.id === c.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((c, i) => ({ ...c, color: COLORES_EXTRA[i % COLORES_EXTRA.length] }));
    return [...base, ...propias];
  }, [], CATEGORIAS_BASE);
}

/** Ideas con sus votos, saldo y si ya están en el itinerario, ordenadas por saldo (RF-26). */
export function useIdeas() {
  const eventos = useEventos();
  const datos = useLive(async () => ({
    ideas: (await db.Ideas.toArray()).filter((i) => !i.deleted),
    votos: (await db.Votos.toArray()).filter((v) => !v.deleted),
  }), [], { ideas: [], votos: [] });

  return datos.ideas
    .map((idea) => {
      const votos = datos.votos.filter((v) => v.ideaId === idea.id);
      const pos = votos.filter((v) => v.valor > 0).map((v) => v.personaId);
      const neg = votos.filter((v) => v.valor < 0).map((v) => v.personaId);
      const evento = eventos.find((e) => e.ideaId === idea.id);
      return { ...idea, pos, neg, saldo: pos.length - neg.length, evento };
    })
    .sort((a, b) => b.saldo - a.saldo || b.pos.length - a.pos.length || a.titulo.localeCompare(b.titulo, 'es'));
}

/** Ideas en votación que todavía no voté (para Inicio, RF-09). */
export function sinMiVoto(ideas, yoId) {
  return ideas.filter((i) => i.estado !== 'guardada' && !i.pos.includes(yoId) && !i.neg.includes(yoId));
}

/** Un voto por persona: el id es idea + persona, así cambiarlo pisa el anterior (RF-25). */
function votar(idea, yoId, valor) {
  const actual = idea.pos.includes(yoId) ? 1 : idea.neg.includes(yoId) ? -1 : 0;
  return guardar('Votos', { id: idea.id + ':' + yoId, ideaId: idea.id, personaId: yoId, valor, deleted: actual === valor });
}

/** Si la categoría es de fábrica y todavía no está en la planilla, la guarda. */
async function asegurarCategoria(cat) {
  if (cat && !(await db.Categorias.get(cat.id))) await guardar('Categorias', { id: cat.id, nombre: cat.nombre, deleted: false });
}

function signo(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
}

function leerCompartido() {
  try {
    const c = JSON.parse(localStorage.getItem('rio.compartido') || 'null');
    localStorage.removeItem('rio.compartido');
    return c;
  } catch {
    return null;
  }
}

// ───────── Lista ─────────

export function Ideas({ sub }) {
  const ideas = useIdeas();
  const categorias = useCategorias();
  const personas = usePersonas();
  const { personaId } = useSesion();
  const [vista, setVista] = useState('votar');
  const [filtro, setFiltro] = useState('todas');
  const [form, setForm] = useState(null); // null · { idea } · { compartido }
  usePedidoAgregar('ideas', () => setForm({}));
  const [creando, setCreando] = useState(false);

  // Link que llegó desde "Compartir" en Android (RF-23).
  useEffect(() => {
    const c = leerCompartido();
    if (c) setForm({ compartido: c });
  }, []);

  if (sub) {
    const idea = ideas.find((i) => i.id === sub);
    return html`<${DetalleIdea} idea=${idea} categorias=${categorias} personas=${personas} yoId=${personaId} />`;
  }

  const enVista = ideas.filter((i) => (vista === 'guardados') === (i.estado === 'guardada'));
  const filtros = [
    { id: 'todas', nombre: 'Todas', cumple: () => true },
    ...Object.entries(FUENTES).map(([id, nombre], k) => ({ id: 'f:' + id, nombre, video: true, sep: k === 0, cumple: (i) => i.fuente === id })),
    ...categorias.map((c, k) => ({ id: 'c:' + c.id, nombre: c.nombre, sep: k === 0, cumple: (i) => i.categoriaId === c.id })),
  ];
  const activo = filtros.find((f) => f.id === filtro) || filtros[0];
  const visibles = enVista.filter(activo.cumple);
  const faltanVotar = sinMiVoto(ideas, personaId).length;
  const nGuardados = ideas.filter((i) => i.estado === 'guardada').length;

  return html`
    <header class="titulo-pantalla con-boton">
      <div>
        <p class="chico">${faltanVotar === 0 ? (ideas.length ? 'Votaste todas las ideas' : 'Lo que queremos hacer en Brasil') : faltanVotar === 1 ? '1 idea espera tu voto' : `${faltanVotar} ideas esperan tu voto`}</p>
        <${TituloPestanas} actual="ideas" />
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="boton-redondo chico" aria-label="Pegar link de reel o TikTok" onClick=${() => setForm({ pegar: true })}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
        </button>
        <${BotonAgregar} etiqueta="Proponer idea" onClick=${() => setForm({})} />
      </div>
    </header>
    <div class="segmentos" role="group" aria-label="Vista">
      <button type="button" aria-pressed=${vista === 'votar' ? 'true' : 'false'} onClick=${() => setVista('votar')}>Para votar</button>
      <button type="button" aria-pressed=${vista === 'guardados' ? 'true' : 'false'} onClick=${() => setVista('guardados')}>Guardados · ${nGuardados}</button>
    </div>
    <div class="tira-filtros" role="group" aria-label="Filtrar">
      ${filtros.map((f) => html`
        ${f.sep && html`<span class="separador" aria-hidden="true"></span>`}
        <button type="button" class="filtro" aria-pressed=${f.id === activo.id ? 'true' : 'false'} onClick=${() => setFiltro(f.id)}>
          ${f.video && html`<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>`}
          ${f.nombre}<span class="cuenta-filtro">${enVista.filter(f.cumple).length}</span>
        </button>`)}
      <button type="button" class="filtro nueva" onClick=${() => setCreando(true)}>+ Nueva</button>
    </div>
    ${creando && html`<${NuevaCategoria} categorias=${categorias} alCrear=${(c) => { setCreando(false); if (c) setFiltro('c:' + c.id); }} />`}
    <main class="contenido">
      ${visibles.map((i) => html`<${TarjetaIdea} key=${i.id} idea=${i} categorias=${categorias} personas=${personas} yoId=${personaId} />`)}
      ${visibles.length === 0 && html`
        <section class="tarjeta grande vacio" style="background:var(--amarillo)">
          <p class="titulo-vacio">Nada por acá todavía</p>
          <p>${vista === 'guardados' ? 'Guardá un reel o un TikTok para tenerlo a mano.' : 'Proponé algo para hacer o pegá el link de un reel.'}</p>
        </section>`}
    </main>
    ${form && html`<${FormIdea} ...${form} categorias=${categorias} yoId=${personaId} alCerrar=${() => setForm(null)} />`}
  `;
}

function NuevaCategoria({ categorias, alCrear }) {
  const [nombre, setNombre] = useState('');
  // No es un <form>: también se usa dentro del formulario de la idea y no tiene que enviarlo.
  async function crear() {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    const existente = categorias.find((c) => normalizar(c.nombre) === normalizar(limpio));
    if (existente) {
      await asegurarCategoria(existente);
      return alCrear(existente);
    }
    const nueva = { id: idCategoria(limpio), nombre: limpio[0].toUpperCase() + limpio.slice(1), deleted: false };
    await guardar('Categorias', nueva);
    alCrear(nueva);
  }
  return html`<div class="nueva-categoria">
    <label for="nueva-cat" class="sr">Nombre de la categoría</label>
    <input id="nueva-cat" class="entrada" type="text" maxlength="30" placeholder="Ej.: Compras" value=${nombre} onInput=${(e) => setNombre(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); crear(); } }} />
    <button type="button" class="boton chico" onClick=${crear}>Crear</button>
    <button type="button" class="cerrar" aria-label="Cancelar" onClick=${() => alCrear(null)}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>`;
}

function ChipFuente({ idea, texto }) {
  if (!idea.url) return null;
  const nombre = FUENTES[idea.fuente] || 'Link';
  return html`<a class="chip oscuro chip-link" href=${idea.url} target="_blank" rel="noopener">
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
    ${texto ? texto + ' ' + nombre : nombre}
  </a>`;
}

function Pulgar({ abajo }) {
  return html`<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
    style=${abajo ? 'transform:rotate(180deg)' : ''}><path d="M7 10v11H3V10zM7 10l4-7c1.5 0 3 1 2.6 3L13 10h6a2 2 0 0 1 2 2.3l-1.3 6.8A2 2 0 0 1 17.7 21H7" /></svg>`;
}

function TarjetaIdea({ idea, categorias, personas, yoId }) {
  const cat = categorias.find((c) => c.id === idea.categoriaId);
  const autora = personas.find((p) => p.id === idea.personaId);
  const guardada = idea.estado === 'guardada';
  const yo = idea.pos.includes(yoId) ? 1 : idea.neg.includes(yoId) ? -1 : 0;
  const href = '#/ideas/' + encodeURIComponent(idea.id);

  return html`<article class="tarjeta idea" style=${'background:' + (cat?.color || '#FFB3D9')}>
    <div class="chips">
      <span class="chip claro">${cat?.nombre || 'Sin categoría'}</span>
      <${ChipFuente} idea=${idea} />
      ${idea.duracion && html`<span class="chip claro">${textoDuracion(idea.duracion)}</span>`}
      ${tieneUbicacion(idea) && html`<a class="chip claro chip-link" href=${'#/mapa/' + encodeURIComponent(idea.id)}>Ver en el mapa</a>`}
      <span style="flex:1"></span>
      ${idea.evento && html`<span class="chip claro">Agendada · ${diaCorto(idea.evento.fecha)}</span>`}
    </div>
    <div>
      <h2 class="titulo-tarjeta"><a href=${href}>${idea.titulo}</a></h2>
      <p class="sub-tarjeta">${guardada ? 'Guardado por ' : 'Propuesta por '}${autora?.nombre || 'alguien'}</p>
    </div>
    ${!guardada && html`
      <div class="fila-votos">
        <div class="avatares">${idea.pos.map((id) => html`<${Avatar} persona=${personas.find((p) => p.id === id)} tam=${28} />`)}</div>
        <div class="votos">
          <span class="saldo" aria-label=${'Saldo ' + signo(idea.saldo)}>${signo(idea.saldo)}</span>
          <button type="button" class="voto" aria-pressed=${yo === 1 ? 'true' : 'false'} aria-label=${'A favor, ' + idea.pos.length} onClick=${() => votar(idea, yoId, 1)}>
            <${Pulgar} /><span>${idea.pos.length}</span>
          </button>
          <button type="button" class="voto" aria-pressed=${yo === -1 ? 'true' : 'false'} aria-label=${'En contra, ' + idea.neg.length} onClick=${() => votar(idea, yoId, -1)}>
            <${Pulgar} abajo /><span>${idea.neg.length}</span>
          </button>
        </div>
      </div>`}
    ${!guardada && !idea.evento && idea.saldo >= saldoParaAgendar(personas) && html`<a class="boton chico" href=${href}>Pasar al itinerario</a>`}
    ${guardada && html`<button type="button" class="boton-borde grande" onClick=${() => proponer(idea, yoId)}>Proponer para votar</button>`}
  </article>`;
}

/** Pasa una idea guardada a votación, con el voto a favor de quien la propone (RF-24). */
async function proponer(idea, yoId) {
  const { pos, neg, saldo, evento, ...fila } = idea;
  await guardar('Ideas', { ...fila, estado: 'votacion' });
  if (!pos.includes(yoId)) await votar(idea, yoId, 1);
}

function diaCorto(iso) {
  const { dia, num } = partesDia(iso);
  return dia + ' ' + num;
}

// ───────── Detalle (RF-28 y RF-29) ─────────

function DetalleIdea({ idea, categorias, personas, yoId }) {
  const [editando, setEditando] = useState(false);
  if (!idea) {
    return html`<main class="contenido" style="padding-top:calc(24px + env(safe-area-inset-top))">
      <a class="boton-borde" style="align-self:flex-start" href="#/ideas">← Volver a Ideas</a>
      <p class="nota">Esta idea no existe o la borraron.</p>
    </main>`;
  }
  const cat = categorias.find((c) => c.id === idea.categoriaId);
  const autora = personas.find((p) => p.id === idea.personaId);
  const guardada = idea.estado === 'guardada';
  const yo = idea.pos.includes(yoId) ? 1 : idea.neg.includes(yoId) ? -1 : 0;
  const faltan = personas.filter((p) => !idea.pos.includes(p.id) && !idea.neg.includes(p.id));
  const nombre = (p) => (p.id === yoId ? 'Vos' : p.nombre);
  const pildoras = (ids) => html`<div class="opciones">${ids.map((id) => personas.find((p) => p.id === id)).filter(Boolean).map((p) => html`
    <span class="pildora-persona" style=${'background:' + p.color}><${Avatar} persona=${p} tam=${30} />${nombre(p)}</span>`)}</div>`;

  return html`
    <section class="cabeza-idea" style=${'background:' + (cat?.color || '#FFB3D9')}>
      <div class="barra">
        <a class="cerrar" href="#/ideas" aria-label="Volver a Ideas">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </a>
        <button type="button" class="boton-borde" onClick=${() => setEditando(true)}>Editar</button>
      </div>
      <div class="chips">
        <span class="chip claro">${cat?.nombre || 'Sin categoría'}</span>
        <${ChipFuente} idea=${idea} texto="Ver" />
        ${idea.duracion && html`<span class="chip claro">Dura ${textoDuracion(idea.duracion)}</span>`}
        ${tieneUbicacion(idea) && html`<a class="chip claro chip-link" href=${'#/mapa/' + encodeURIComponent(idea.id)}>Ver en el mapa</a>`}
      </div>
      <h1>${idea.titulo}</h1>
      ${idea.lugar && html`<p class="autora">${idea.lugar}</p>`}
      <p class="autora">${guardada ? 'Guardado por ' : 'Propuesta por '}${autora?.nombre || 'alguien'}</p>
      ${idea.nota && html`<p class="nota-idea">${idea.nota}</p>`}
    </section>
    <main class="contenido">
      ${guardada && html`
        <section class="seccion">
          <p>Está en Guardados. Si la proponés, todas la pueden votar.</p>
          <button type="button" class="boton chico" onClick=${() => proponer(idea, yoId)}>Proponer para votar</button>
        </section>`}
      ${!guardada && html`
        <section class="seccion">
          <div class="fila-saldo">
            <div><p class="nota">Saldo</p><p class="saldo grande">${signo(idea.saldo)}</p></div>
            <div style="display:flex;gap:8px">
              <button type="button" class="voto redondo" aria-pressed=${yo === 1 ? 'true' : 'false'} aria-label="A favor" onClick=${() => votar(idea, yoId, 1)}><${Pulgar} /></button>
              <button type="button" class="voto redondo" aria-pressed=${yo === -1 ? 'true' : 'false'} aria-label="En contra" onClick=${() => votar(idea, yoId, -1)}><${Pulgar} abajo /></button>
            </div>
          </div>
          ${idea.pos.length > 0 && html`<div class="campo"><p class="rotulo-campo">A favor · ${idea.pos.length}</p>${pildoras(idea.pos)}</div>`}
          ${idea.neg.length > 0 && html`<div class="campo"><p class="rotulo-campo">En contra · ${idea.neg.length}</p>${pildoras(idea.neg)}</div>`}
          <p class="nota">${faltan.length ? 'Falta que voten: ' + faltan.map((p) => (p.id === yoId ? 'vos' : p.nombre)).join(', ') : 'Votaron todas'}</p>
        </section>
        <${PasarAlItinerario} idea=${idea} minimo=${saldoParaAgendar(personas)} />`}
    </main>
    ${editando && html`<${FormIdea} idea=${idea} categorias=${categorias} yoId=${yoId} alCerrar=${() => setEditando(false)} />`}
  `;
}

function PasarAlItinerario({ idea, minimo }) {
  const viaje = useViaje();
  const dias = diasDelViaje(viaje);
  const hoy = hoyISO();
  const [dia, setDia] = useState(null);
  const [hora, setHora] = useState('');
  const elegido = dias.includes(dia) ? dia : dias.includes(hoy) ? hoy : dias[0];

  if (idea.evento) {
    return html`<a class="tarjeta fila-link" href=${'#/itinerario/' + idea.evento.fecha} style="background:var(--amarillo)">
      <div class="texto">
        <p class="titulo">Agendada</p>
        <p class="sub">${diaCorto(idea.evento.fecha)}${idea.evento.hora ? ' a las ' + idea.evento.hora : ''} · Ver en el itinerario</p>
      </div>
      <${Flecha} />
    </a>`;
  }
  if (idea.saldo < minimo) {
    return html`<p class="nota" style="text-align:center">Con saldo +${minimo} se puede pasar al itinerario.</p>`;
  }
  if (!dias.length) {
    return html`<a class="tarjeta fila-link" href="#/ajustes" style="background:var(--coral)">
      <div class="texto"><p class="titulo">Faltan las fechas del viaje</p><p class="sub">Cargalas en Ajustes para poder agendar.</p></div>
      <${Flecha} />
    </a>`;
  }

  async function agendar() {
    const cat = await db.Categorias.get(idea.categoriaId);
    const nombreCat = CATEGORIAS_BASE.find((c) => c.id === idea.categoriaId)?.nombre || cat?.nombre;
    const { pos, neg, saldo, evento, ...fila } = idea;
    await guardar('Itinerario', {
      id: nuevoId(),
      fecha: elegido,
      hora,
      titulo: idea.titulo,
      lugar: idea.lugar || '',
      mapsUrl: idea.mapsUrl || '',
      lat: tieneUbicacion(idea) ? idea.lat : null,
      lng: tieneUbicacion(idea) ? idea.lng : null,
      categoria: CATEGORIAS_ITINERARIO[nombreCat] ? nombreCat : 'Otro',
      participantes: [],
      duracion: idea.duracion || null,
      ideaId: idea.id,
      deleted: false,
    });
    await guardar('Ideas', { ...fila, estado: 'agendada' });
  }

  const { dia: semana, num } = partesDia(elegido);
  return html`<section class="tarjeta grande" style="background:var(--amarillo);gap:14px">
    <h2 style="font-size:24px">Pasar al itinerario</h2>
    <div class="tira-dias dentro" role="radiogroup" aria-label="Día">
      ${dias.map((d) => {
        const p = partesDia(d);
        return html`<button type="button" role="radio" aria-checked=${d === elegido ? 'true' : 'false'} onClick=${() => setDia(d)}>
          <span class="semana">${p.dia}</span><span class="num">${p.num}</span>
        </button>`;
      })}
    </div>
    <div class="campo">
      <label for="i-hora">Hora <span class="opcional">(opcional)</span></label>
      <input id="i-hora" class="entrada" type="time" value=${hora} onInput=${(e) => setHora(e.currentTarget.value)} />
    </div>
    ${idea.duracion && html`<p class="nota">Dura ${textoDuracion(idea.duracion)}.</p>`}
    <button type="button" class="boton" onClick=${agendar}>Agendar el ${semana.toLowerCase()} ${num}${hora ? ' a las ' + hora : ''}</button>
  </section>`;
}

// ───────── Formulario: proponer, guardar link y editar (RF-21 a RF-24) ─────────

function FormIdea({ idea, compartido, pegar, categorias, yoId, alCerrar }) {
  const nueva = !idea;
  const [form, setForm] = useState(() => {
    const ubicacion = { lugar: idea?.lugar || '', mapsUrl: idea?.mapsUrl || '', lat: idea?.lat ?? null, lng: idea?.lng ?? null };
    if (idea) return { url: idea.url || '', titulo: idea.titulo, categoriaId: idea.categoriaId, nota: idea.nota || '', duracion: idea.duracion || null, destino: idea.estado === 'guardada' ? 'guardada' : 'votacion', ...ubicacion };
    const url = compartido ? compartido.url || extraerLink(compartido.text) : '';
    // El texto compartido suele traer el link pegado: se usa solo lo que no es link como título.
    const titulo = compartido ? (compartido.title || compartido.text || '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 80) : '';
    return { url, titulo, categoriaId: '', nota: '', duracion: null, destino: url ? 'guardada' : 'votacion', ...ubicacion };
  });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [puedePegar] = useState(() => !!navigator.clipboard?.readText);
  const fuente = detectarFuente(form.url);
  const cambiar = (campo) => (e) => {
    setForm({ ...form, [campo]: e.currentTarget.value });
    setError('');
  };

  async function pegarLink() {
    try {
      const texto = await navigator.clipboard.readText();
      const url = extraerLink(texto) || texto.trim();
      setForm((f) => ({ ...f, url, destino: nueva && url ? 'guardada' : f.destino }));
    } catch {
      setError('El celular no dejó pegar. Mantené apretado el campo y elegí «Pegar».');
    }
  }

  async function enviar(e) {
    e.preventDefault();
    const titulo = form.titulo.trim();
    const url = form.url.trim();
    if (!titulo) return setError(url ? 'Poné qué es, por ejemplo «bar con vista».' : 'Poné qué querés hacer.');
    if (url && !/^https?:\/\//i.test(url)) return setError('El link tiene que empezar con https://');
    const mapsUrl = form.mapsUrl.trim();
    if (mapsUrl && !/^https?:\/\//i.test(mapsUrl)) return setError('El link de Maps tiene que empezar con https://');
    await asegurarCategoria(categorias.find((c) => c.id === form.categoriaId));
    const fila = {
      id: idea?.id || nuevoId(),
      titulo,
      categoriaId: form.categoriaId,
      nota: form.nota.trim(),
      duracion: form.duracion,
      url,
      fuente: detectarFuente(url),
      lugar: form.lugar.trim(),
      mapsUrl,
      lat: tieneUbicacion(form) ? form.lat : null,
      lng: tieneUbicacion(form) ? form.lng : null,
      estado: idea ? (idea.estado === 'agendada' ? 'agendada' : form.destino) : form.destino,
      personaId: idea?.personaId || yoId,
      deleted: false,
    };
    await guardar('Ideas', fila);
    if (nueva && fila.estado === 'votacion') await guardar('Votos', { id: fila.id + ':' + yoId, ideaId: fila.id, personaId: yoId, valor: 1, deleted: false });
    alCerrar();
  }

  async function eliminar() {
    const { pos, neg, saldo, evento, ...fila } = idea;
    await borrar('Ideas', fila);
    location.hash = '#/ideas';
  }

  return html`<${Hoja} titulo=${nueva ? (pegar || compartido ? 'Guardar link' : 'Nueva idea') : 'Editar idea'} alCerrar=${alCerrar}>
    <form class="formulario" onSubmit=${enviar}>
      <div class="campo">
        <label for="i-url">Link ${!(pegar || compartido) && html`<span class="opcional">(opcional)</span>`}</label>
        <div class="fila-entrada">
          <input id="i-url" class="entrada" type="url" inputmode="url" maxlength="500" placeholder="https://www.tiktok.com/…" value=${form.url} onInput=${cambiar('url')} />
          ${puedePegar && html`<button type="button" class="boton chico" onClick=${pegarLink}>Pegar</button>`}
        </div>
        ${form.url && html`<p class="ayuda">${fuente ? 'Es de ' + FUENTES[fuente] + '.' : 'Link común (no es TikTok ni Reels).'}</p>`}
      </div>
      <div class="campo">
        <label for="i-titulo">¿Qué es?</label>
        <input id="i-titulo" class="entrada" type="text" maxlength="80" placeholder="Bar con vista en Santa Teresa" value=${form.titulo} onInput=${cambiar('titulo')} />
      </div>
      <div class="campo">
        <span class="rotulo-campo" id="i-cat">Categoría</span>
        <div class="opciones" role="radiogroup" aria-labelledby="i-cat">
          ${categorias.map((c) => html`
            <button type="button" role="radio" aria-checked=${form.categoriaId === c.id ? 'true' : 'false'} style=${'--color:' + c.color}
              onClick=${() => setForm({ ...form, categoriaId: form.categoriaId === c.id ? '' : c.id })}>${c.nombre}</button>`)}
          <button type="button" class="nueva" onClick=${() => setCreando(true)}>+ Nueva</button>
        </div>
        ${creando && html`<${NuevaCategoria} categorias=${categorias} alCrear=${(c) => { setCreando(false); if (c) setForm((f) => ({ ...f, categoriaId: c.id })); }} />`}
      </div>
      <div class="campo">
        <label for="i-nota">Nota <span class="opcional">(opcional)</span></label>
        <textarea id="i-nota" class="entrada area" rows="2" maxlength="500" placeholder="Por qué está bueno, cuánto sale, horarios…" value=${form.nota} onInput=${cambiar('nota')}></textarea>
      </div>
      <${CampoDuracion} id="i-dur" valor=${form.duracion} alCambiar=${(duracion) => setForm({ ...form, duracion })} />
      <${CampoUbicacion} valor=${form} pista=${form.titulo} alCambiar=${(cambio) => setForm(cambio)} />
      ${(nueva || idea.estado === 'guardada') && html`
        <div class="destinos" role="radiogroup" aria-label="Dónde guardarla">
          <button type="button" role="radio" aria-checked=${form.destino === 'votacion' ? 'true' : 'false'} style="background:var(--lila)" onClick=${() => setForm({ ...form, destino: 'votacion' })}>
            <span class="titulo">Proponer para votar</span><span class="sub">Va a Ideas con 👍 y 👎</span>
          </button>
          <button type="button" role="radio" aria-checked=${form.destino === 'guardada' ? 'true' : 'false'} style="background:var(--menta)" onClick=${() => setForm({ ...form, destino: 'guardada' })}>
            <span class="titulo">Solo guardar</span><span class="sub">Queda en Guardados</span>
          </button>
        </div>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="boton" type="submit">Guardar</button>
      ${!nueva && html`<${BotonBorrar} que="la idea" onBorrar=${eliminar} />`}
    </form>
  <//>`;
}
