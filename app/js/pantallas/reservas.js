// Reservas: vuelos, alojamiento y traslados (RF-17 a RF-20).
import { html, useState } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { BotonAgregar, BotonBorrar, Flecha, Hoja, useLive } from '../ui.js';
import { ahora, fechaLarga, linkMaps, porFechaHora } from '../util.js';

export const TIPOS_RESERVA = {
  vuelo: { nombre: 'Vuelo', color: 'var(--lila)', obligatorios: ['fecha', 'hora', 'codigo'], ejemplo: 'MVD → GIG' },
  alojamiento: { nombre: 'Alojamiento', color: 'var(--menta)', obligatorios: ['fecha', 'codigo', 'direccion'], ejemplo: 'Nombre del alojamiento' },
  traslado: { nombre: 'Traslado', color: 'var(--celeste)', obligatorios: ['fecha', 'hora'], ejemplo: 'Galeão → alojamiento' },
};

const NOMBRE_CAMPO = { fecha: 'fecha', hora: 'hora', codigo: 'código', direccion: 'dirección' };

const FILTROS = [
  ['todo', 'Todo', () => true],
  ['viajes', 'Viajes', (r) => r.tipo !== 'alojamiento'],
  ['alojamiento', 'Alojamiento', (r) => r.tipo === 'alojamiento'],
];

/** Campos obligatorios vacíos de una reserva (RF-18). */
export function faltanDatos(r) {
  return (TIPOS_RESERVA[r.tipo] || TIPOS_RESERVA.vuelo).obligatorios.filter((c) => !r[c]);
}

/** La próxima reserva que todavía no pasó (RF-20). */
export function proximaReserva(reservas) {
  const { fecha, hora } = ahora();
  return reservas.find((r) => r.fecha && (r.fecha > fecha || (r.fecha === fecha && (!r.hora || r.hora >= hora))));
}

export function useReservas() {
  return useLive(async () => (await db.Reservas.toArray()).filter((r) => !r.deleted).sort(porFechaHora), [], []);
}

export function Reservas() {
  const reservas = useReservas();
  const [filtro, setFiltro] = useState('todo');
  const [editando, setEditando] = useState(null); // null · {} para nueva · la reserva a editar
  const proxima = proximaReserva(reservas);
  const visibles = reservas.filter(FILTROS.find((f) => f[0] === filtro)[2]);

  return html`
    <header class="titulo-pantalla con-boton">
      <div><p class="chico">Vuelos, traslados y alojamiento</p><h1>Reservas</h1></div>
      <${BotonAgregar} etiqueta="Agregar reserva" onClick=${() => setEditando({})} />
    </header>
    <div class="segmentos" role="group" aria-label="Filtrar">
      ${FILTROS.map(([id, nombre]) => html`
        <button type="button" aria-pressed=${filtro === id ? 'true' : 'false'} onClick=${() => setFiltro(id)}>${nombre}</button>`)}
    </div>
    <main class="contenido">
      ${visibles.map((r) => html`<${TarjetaReserva} key=${r.id} r=${r} proxima=${r === proxima} alEditar=${() => setEditando(r)} />`)}
      ${reservas.length === 0 && html`
        <section class="tarjeta grande vacio" style="background:var(--amarillo)">
          <p class="titulo-vacio">Todavía no hay reservas</p>
          <p>Cargá los vuelos, el alojamiento y los traslados para tener los códigos a mano sin señal.</p>
          <button type="button" class="boton chico" onClick=${() => setEditando({})}>Agregar la primera</button>
        </section>`}
      ${reservas.length > 0 && visibles.length === 0 && html`<p class="nota" style="text-align:center;padding:24px">No hay reservas de este tipo.</p>`}
    </main>
    ${editando && html`<${FormReserva} reserva=${editando} alCerrar=${() => setEditando(null)} />`}
  `;
}

function TarjetaReserva({ r, proxima, alEditar }) {
  const tipo = TIPOS_RESERVA[r.tipo] || TIPOS_RESERVA.vuelo;
  const faltan = faltanDatos(r);
  const maps = linkMaps(r.direccion);
  const cuando = [r.fecha && (r.tipo === 'alojamiento' ? 'Check-in ' : '') + fechaLarga(r.fecha), r.hora].filter(Boolean).join(' · ');

  return html`<article class=${'tarjeta reserva' + (faltan.length ? ' incompleta' : '')} style=${faltan.length ? '' : 'background:' + tipo.color}>
    <div class="chips">
      <span class="chip oscuro">${tipo.nombre}</span>
      <span style="flex:1"></span>
      ${proxima && html`<span class="chip proxima">¡Es la próxima!</span>`}
      ${faltan.length > 0 && html`<span class="chip" style="background:var(--coral)">Falta cargar</span>`}
    </div>
    <div>
      <h2 class="titulo-tarjeta">${r.titulo}</h2>
      ${cuando && html`<p class="sub-tarjeta">${cuando}</p>`}
      ${r.detalle && html`<p class="sub-tarjeta detalle">${r.detalle}</p>`}
      ${r.direccion && html`<p class="sub-tarjeta">${r.direccion}</p>`}
    </div>
    ${r.codigo && html`<${CajaCodigo} codigo=${r.codigo} />`}
    ${maps && html`<a class="boton-borde grande" href=${maps} target="_blank" rel="noopener">Abrir en Maps <${Flecha} /></a>`}
    ${faltan.length > 0
      ? html`<button type="button" class="boton chico" onClick=${alEditar}>Completar ${faltan.map((c) => NOMBRE_CAMPO[c]).join(', ')}</button>`
      : html`<button type="button" class="boton-borde" style="align-self:flex-start" onClick=${alEditar}>Editar</button>`}
  </article>`;
}

function CajaCodigo({ codigo }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el navegador no dejó: se puede copiar a mano */
    }
  }
  return html`<div class="caja-codigo">
    <div>
      <p class="rotulo">Código</p>
      <p class="valor">${codigo}</p>
    </div>
    <button type="button" class=${'boton chico' + (copiado ? ' copiado' : '')} onClick=${copiar}
      aria-label=${copiado ? 'Código copiado' : 'Copiar código ' + codigo}>${copiado ? '¡Copiado!' : 'Copiar'}</button>
  </div>`;
}

function FormReserva({ reserva, alCerrar }) {
  const nueva = !reserva.id;
  const [form, setForm] = useState({
    tipo: reserva.tipo || 'vuelo',
    titulo: reserva.titulo || '',
    fecha: reserva.fecha || '',
    hora: reserva.hora || '',
    codigo: reserva.codigo || '',
    direccion: reserva.direccion || '',
    detalle: reserva.detalle || '',
  });
  const [error, setError] = useState('');
  const tipo = TIPOS_RESERVA[form.tipo];
  const cambiar = (campo) => (e) => {
    setForm({ ...form, [campo]: e.currentTarget.value });
    setError('');
  };

  async function enviar(e) {
    e.preventDefault();
    const limpio = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
    if (!limpio.titulo) return setError('Poné un título, por ejemplo «' + tipo.ejemplo + '».');
    limpio.codigo = limpio.codigo.toUpperCase();
    await guardar('Reservas', { ...reserva, id: reserva.id || nuevoId(), ...limpio, deleted: false });
    alCerrar();
  }

  async function eliminar() {
    await borrar('Reservas', reserva);
    alCerrar();
  }

  return html`<${Hoja} titulo=${nueva ? 'Nueva reserva' : 'Editar reserva'} alCerrar=${alCerrar}>
    <form class="formulario" onSubmit=${enviar}>
      <div class="campo">
        <span class="rotulo-campo" id="r-tipo">Tipo</span>
        <div class="segmentos claro" role="radiogroup" aria-labelledby="r-tipo">
          ${Object.entries(TIPOS_RESERVA).map(([id, t]) => html`
            <button type="button" role="radio" aria-checked=${form.tipo === id ? 'true' : 'false'}
              onClick=${() => setForm({ ...form, tipo: id })}>${t.nombre}</button>`)}
        </div>
      </div>
      <div class="campo">
        <label for="r-titulo">Título</label>
        <input id="r-titulo" class="entrada" type="text" maxlength="80" placeholder=${tipo.ejemplo} value=${form.titulo} onInput=${cambiar('titulo')} />
      </div>
      <div class="dos-columnas">
        <div class="campo">
          <label for="r-fecha">${form.tipo === 'alojamiento' ? 'Check-in' : 'Fecha'}</label>
          <input id="r-fecha" class="entrada" type="date" value=${form.fecha} onInput=${cambiar('fecha')} />
        </div>
        <div class="campo">
          <label for="r-hora">Hora</label>
          <input id="r-hora" class="entrada" type="time" value=${form.hora} onInput=${cambiar('hora')} />
        </div>
      </div>
      <div class="campo">
        <label for="r-codigo">Código de reserva</label>
        <input id="r-codigo" class="entrada mono" type="text" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false"
          placeholder="ABC123" value=${form.codigo} onInput=${cambiar('codigo')} />
      </div>
      <div class="campo">
        <label for="r-dir">Dirección</label>
        <input id="r-dir" class="entrada" type="text" maxlength="200" placeholder="Para abrirla en Maps" value=${form.direccion} onInput=${cambiar('direccion')} />
      </div>
      <div class="campo">
        <label for="r-detalle">Detalle</label>
        <textarea id="r-detalle" class="entrada area" maxlength="500" rows="3"
          placeholder=${form.tipo === 'vuelo' ? 'Aerolínea, número de vuelo, equipaje…' : form.tipo === 'alojamiento' ? 'Check-out, cómo se entra, quién reservó…' : 'Empresa, punto de encuentro, precio…'}
          value=${form.detalle} onInput=${cambiar('detalle')}></textarea>
      </div>
      <p class="nota">Si falta ${tipo.obligatorios.map((c) => NOMBRE_CAMPO[c]).join(', ').replace(/, ([^,]*)$/, ' o $1')}, aparece como «Falta cargar».</p>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="boton" type="submit">Guardar</button>
      ${!nueva && html`<${BotonBorrar} que="la reserva" onBorrar=${eliminar} />`}
    </form>
  <//>`;
}
