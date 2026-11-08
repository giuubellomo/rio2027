// Itinerario: días del viaje y sus actividades (RF-12 a RF-16).
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { Avatar, BotonAgregar, BotonBorrar, Flecha, Hoja, useLive, usePersonas, useViaje } from '../ui.js';
import { diasDelViaje, fechaLarga, hoyISO, linkMaps, partesDia, porFechaHora } from '../util.js';

export const CATEGORIAS = {
  Playa: 'var(--celeste)',
  Comida: 'var(--coral)',
  Paseo: 'var(--menta)',
  Noche: 'var(--lila)',
  Viaje: 'var(--amarillo)',
  Otro: 'var(--blanco)',
};

export function useEventos() {
  return useLive(async () => (await db.Itinerario.toArray()).filter((e) => !e.deleted).sort(porFechaHora), [], []);
}

/** "Todas" si no eligieron a nadie o si van todas; si no, los nombres. */
export function quienesVan(evento, personas) {
  const ids = evento.participantes || [];
  const van = personas.filter((p) => ids.includes(p.id));
  if (!van.length || van.length === personas.length) return 'Todas';
  return van.map((p) => p.nombre).join(', ');
}

export function Itinerario() {
  const viaje = useViaje();
  const eventos = useEventos();
  const personas = usePersonas();
  const dias = diasDelViaje(viaje);
  const hoy = hoyISO();
  const [elegido, setElegido] = useState(null);
  const [editando, setEditando] = useState(null);
  const dia = dias.includes(elegido) ? elegido : dias.includes(hoy) ? hoy : dias[0];
  const delDia = eventos.filter((e) => e.fecha === dia);
  // Actividades que quedaron fuera de las fechas del viaje (si se cambiaron en Ajustes).
  const fuera = dias.length ? eventos.filter((e) => !dias.includes(e.fecha)) : [];

  const tira = useRef(null);
  useEffect(() => {
    tira.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [dia]);

  if (viaje && !dias.length) {
    return html`
      <header class="titulo-pantalla"><h1>Itinerario</h1></header>
      <main class="contenido">
        <a class="tarjeta fila-link" href="#/ajustes" style="background:var(--coral)">
          <div class="texto"><p class="titulo">Faltan las fechas del viaje</p><p class="sub">Cargalas en Ajustes y aparecen los días.</p></div>
          <${Flecha} />
        </a>
      </main>`;
  }

  return html`
    <header class="titulo-pantalla con-boton">
      <div><p class="chico">${viaje?.nombre || 'Río 2027'}</p><h1>Itinerario</h1></div>
      <${BotonAgregar} etiqueta="Agregar actividad" onClick=${() => setEditando({ fecha: dia })} />
    </header>
    <div class="tira-dias" role="group" aria-label="Días" ref=${tira}>
      ${dias.map((d) => {
        const { dia: semana, num } = partesDia(d);
        return html`<button type="button" aria-pressed=${d === dia ? 'true' : 'false'} aria-label=${fechaLarga(d)} onClick=${() => setElegido(d)}>
          <span class="semana">${semana}</span><span class="num">${num}</span>
          ${d === hoy && html`<span class="hoy" aria-hidden="true"></span>`}
        </button>`;
      })}
    </div>
    <p class="titulo-dia">${fechaLarga(dia)}${apodoDia(dias, dia)}</p>
    <main class="contenido">
      ${delDia.map((e) => html`<${TarjetaEvento} key=${e.id} e=${e} personas=${personas} alEditar=${() => setEditando(e)} />`)}
      ${viaje && delDia.length === 0 && html`
        <section class="tarjeta grande vacio" style="background:var(--amarillo)">
          <p class="titulo-vacio">Día libre</p>
          <p>Agendá una de las ideas más votadas o agregá algo con el +.</p>
          <a class="boton chico" href="#/ideas">Ver ideas</a>
        </section>`}
      ${fuera.length > 0 && html`
        <section class="seccion">
          <h2>Fuera de las fechas</h2>
          <p class="nota">Estas actividades quedaron afuera porque cambiaron las fechas del viaje. Editalas para moverlas a un día.</p>
          ${fuera.map((e) => html`<button type="button" class="boton-borde" style="justify-content:flex-start" onClick=${() => setEditando(e)}>${e.titulo}</button>`)}
        </section>`}
    </main>
    ${editando && html`<${FormEvento} evento=${editando} dias=${dias} personas=${personas} alCerrar=${() => setEditando(null)} />`}
  `;
}

function apodoDia(dias, dia) {
  if (dia === dias[0]) return ' · Llegada';
  if (dias.length > 1 && dia === dias[dias.length - 1]) return ' · Vuelta';
  return '';
}

function TarjetaEvento({ e, personas, alEditar }) {
  const maps = linkMaps(e.lugar, e.mapsUrl);
  const color = CATEGORIAS[e.categoria] || CATEGORIAS.Otro;
  const quien = quienesVan(e, personas);
  return html`<article class=${'tarjeta evento' + (color === CATEGORIAS.Otro ? ' borde' : '')} style=${'background:' + color}>
    <button type="button" class="tocar-editar" aria-label=${'Editar ' + e.titulo} onClick=${alEditar}></button>
    <div class="chips">
      <span class="chip oscuro hora">${e.hora || 'Sin hora'}</span>
      ${e.categoria && html`<span class="chip suave">${e.categoria}</span>`}
      ${e.ideaId && html`<span class="chip suave">Votada en Ideas</span>`}
    </div>
    <div class="fila-evento">
      <div style="flex:1;min-width:0">
        <h2 class="titulo-tarjeta">${e.titulo}</h2>
        <p class="sub-tarjeta">${[e.lugar, quien].filter(Boolean).join(' · ')}</p>
      </div>
      ${maps && html`<a class="flecha-link" href=${maps} target="_blank" rel="noopener" aria-label=${'Abrir ' + (e.lugar || e.titulo) + ' en Maps'}><${Flecha} /></a>`}
    </div>
  </article>`;
}

function FormEvento({ evento, dias, personas, alCerrar }) {
  const nuevo = !evento.id;
  const [form, setForm] = useState({
    fecha: evento.fecha || dias[0] || '',
    hora: evento.hora || '',
    titulo: evento.titulo || '',
    categoria: evento.categoria || '',
    lugar: evento.lugar || '',
    mapsUrl: evento.mapsUrl || '',
    participantes: evento.participantes || [],
  });
  const [error, setError] = useState('');
  const cambiar = (campo) => (e) => {
    setForm({ ...form, [campo]: e.currentTarget.value });
    setError('');
  };
  const alternar = (id) => {
    const p = form.participantes;
    setForm({ ...form, participantes: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] });
  };
  // Si la fecha guardada quedó fuera del viaje, se ofrece igual para no perderla.
  const opcionesDia = dias.includes(form.fecha) || !form.fecha ? dias : [form.fecha, ...dias];

  async function enviar(e) {
    e.preventDefault();
    const titulo = form.titulo.trim();
    if (!titulo) return setError('Poné qué van a hacer.');
    if (!form.fecha) return setError('Elegí el día.');
    const mapsUrl = form.mapsUrl.trim();
    if (mapsUrl && !/^https?:\/\//i.test(mapsUrl)) return setError('El link de Maps tiene que empezar con https://');
    // Si marcaron a todas, se guarda vacío: así las que se sumen después también quedan incluidas.
    const participantes = form.participantes.length === personas.length ? [] : form.participantes.filter((id) => personas.some((p) => p.id === id));
    await guardar('Itinerario', {
      ...evento,
      id: evento.id || nuevoId(),
      fecha: form.fecha,
      hora: form.hora,
      titulo,
      categoria: form.categoria,
      lugar: form.lugar.trim(),
      mapsUrl,
      participantes,
      ideaId: evento.ideaId || '',
      deleted: false,
    });
    alCerrar();
  }

  async function eliminar() {
    await borrar('Itinerario', evento);
    alCerrar();
  }

  return html`<${Hoja} titulo=${nuevo ? 'Nueva actividad' : 'Editar actividad'} alCerrar=${alCerrar}>
    <form class="formulario" onSubmit=${enviar}>
      <div class="campo">
        <label for="e-titulo">Qué</label>
        <input id="e-titulo" class="entrada" type="text" maxlength="80" placeholder="Atardecer en Arpoador" value=${form.titulo} onInput=${cambiar('titulo')} />
      </div>
      <div class="dos-columnas">
        <div class="campo">
          <label for="e-dia">Día</label>
          <select id="e-dia" class="entrada" value=${form.fecha} onChange=${cambiar('fecha')}>
            ${opcionesDia.map((d) => { const { dia, num } = partesDia(d); return html`<option value=${d}>${dia} ${num}</option>`; })}
          </select>
        </div>
        <div class="campo">
          <label for="e-hora">Hora</label>
          <input id="e-hora" class="entrada" type="time" value=${form.hora} onInput=${cambiar('hora')} />
        </div>
      </div>
      <div class="campo">
        <span class="rotulo-campo" id="e-cat">Categoría</span>
        <div class="opciones" role="radiogroup" aria-labelledby="e-cat">
          ${Object.entries(CATEGORIAS).map(([nombre, color]) => html`
            <button type="button" role="radio" aria-checked=${form.categoria === nombre ? 'true' : 'false'} style=${'--color:' + color}
              onClick=${() => setForm({ ...form, categoria: form.categoria === nombre ? '' : nombre })}>${nombre}</button>`)}
        </div>
      </div>
      <div class="campo">
        <label for="e-lugar">Dónde</label>
        <input id="e-lugar" class="entrada" type="text" maxlength="120" placeholder="Ipanema" value=${form.lugar} onInput=${cambiar('lugar')} />
      </div>
      <div class="campo">
        <label for="e-maps">Link de Maps <span class="opcional">(opcional)</span></label>
        <input id="e-maps" class="entrada" type="url" inputmode="url" maxlength="500" placeholder="https://maps.app.goo.gl/…" value=${form.mapsUrl} onInput=${cambiar('mapsUrl')} />
        <p class="ayuda">Si no ponés link, Maps busca por el lugar.</p>
      </div>
      ${personas.length > 1 && html`
        <div class="campo">
          <span class="rotulo-campo" id="e-quien">Quiénes van</span>
          <div class="opciones" role="group" aria-labelledby="e-quien">
            ${personas.map((p) => html`
              <button type="button" class="persona-chip" aria-pressed=${form.participantes.includes(p.id) ? 'true' : 'false'} onClick=${() => alternar(p.id)}>
                <${Avatar} persona=${p} tam=${28} />${p.nombre}
              </button>`)}
          </div>
          <p class="ayuda">Si no marcás a nadie, van todas.</p>
        </div>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="boton" type="submit">Guardar</button>
      ${!nuevo && html`<${BotonBorrar} que="la actividad" onBorrar=${eliminar} />`}
    </form>
  <//>`;
}
