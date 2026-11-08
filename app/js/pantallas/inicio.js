// Inicio: cuenta regresiva (RF-07), reservas incompletas (RF-09) y modo "durante el viaje" (RF-10).
import { html } from '../vendor/preact-htm.js';
import { Avatar, Estrella, Flecha, PildoraSync, usePersonas, useViaje, useYo } from '../ui.js';
import { ahora, fechaLarga, momentoDelViaje } from '../util.js';
import { CATEGORIAS, quienesVan, useEventos } from './itinerario.js';
import { faltanDatos as faltanEnReserva, useReservas } from './reservas.js';

export function Inicio() {
  const yo = useYo();
  const viaje = useViaje();
  const personas = usePersonas();
  const momento = momentoDelViaje(viaje);
  const reservas = useReservas();
  const incompletas = reservas.filter((r) => faltanEnReserva(r).length).length;
  const faltanDatos = viaje && (!viaje.fechaFin || !viaje.cambioUSD || !viaje.cambioUYU);

  return html`
    <header class="encabezado">
      <a class="quien" href="#/ajustes" aria-label="Ajustes">
        <${Avatar} persona=${yo} tam=${44} />
        <div>
          <p class="chico">${viaje?.nombre || 'Río 2027'}</p>
          <p class="grande">Oi, ${yo?.nombre || ''}!</p>
        </div>
      </a>
      <${PildoraSync} />
    </header>
    <main class="contenido">
      ${momento.modo === 'antes' && html`
        <section class="tarjeta grande" style="background:var(--lila);min-height:230px">
          <${Estrella} />
          <p class="etiqueta">Cuenta regresiva</p>
          <p class="cuenta">${momento.dias}</p>
          <p class="cuenta-texto">${momento.dias === 1 ? 'día' : 'días'} para<br />la playa</p>
          <p style="font-size:14px;font-weight:600">${fechaLarga(viaje.fechaInicio)}</p>
        </section>`}

      ${momento.modo === 'durante' && html`<${DuranteElViaje} dia=${momento.dia} personas=${personas} reservas=${reservas} />`}

      ${momento.modo === 'despues' && html`
        <section class="tarjeta grande" style="background:var(--amarillo)">
          <${Estrella} tam=${130} />
          <h2 style="font-size:40px;line-height:0.95;max-width:240px">¡Qué viaje!</h2>
          <p style="font-size:14px;font-weight:600">Quedan los gastos y las fotos para repasar.</p>
        </section>`}

      ${faltanDatos && html`
        <a class="tarjeta fila-link" href="#/ajustes" style="background:var(--coral)">
          <div class="texto">
            <p class="titulo">Faltan datos del viaje</p>
            <p class="sub">${[!viaje.fechaFin && 'fecha de vuelta', (!viaje.cambioUSD || !viaje.cambioUYU) && 'tipo de cambio'].filter(Boolean).join(' y ')}</p>
          </div>
          <${Flecha} />
        </a>`}

      ${incompletas > 0 && html`
        <a class="tarjeta fila-link" href="#/reservas" style="background:var(--blanco);border:2.5px dashed var(--tinta)">
          <div class="texto">
            <p class="titulo">${incompletas === 1 ? '1 reserva incompleta' : `${incompletas} reservas incompletas`}</p>
            <p class="sub">Falta el código, la fecha o la dirección</p>
          </div>
          <${Flecha} />
        </a>`}

      <section class="tarjeta" style="background:var(--celeste)">
        <p class="etiqueta clara">${personas.length === 1 ? '1 viajera' : `${personas.length} viajeras`}</p>
        <div class="avatares">${personas.map((p) => html`<${Avatar} persona=${p} tam=${40} />`)}</div>
        <p style="font-size:14px;font-weight:600">${personas.map((p) => p.nombre).join(', ')}</p>
      </section>
    </main>
  `;
}

/** Lo próximo, lo que sigue y dónde se duerme esta noche (RF-10). */
function DuranteElViaje({ dia, personas, reservas }) {
  const eventos = useEventos();
  const { fecha, hora } = ahora();
  const deHoy = eventos.filter((e) => e.fecha === fecha);
  // Lo que sigue hoy: lo que todavía no empezó, o lo que empezó hace menos de una hora.
  const pendientes = deHoy.filter((e) => !e.hora || e.hora >= restarHora(hora));
  const [proximo, despues] = [...pendientes, ...eventos.filter((e) => e.fecha > fecha)];
  const noche = reservas.filter((r) => r.tipo === 'alojamiento' && r.fecha && r.fecha <= fecha).pop();

  return html`
    <section class="tarjeta grande" style="background:var(--menta)">
      <${Estrella} tam=${130} />
      <p class="etiqueta">Día ${dia}</p>
      <h2 style="font-size:40px;line-height:0.95;max-width:240px">¡Estamos en Río!</h2>
      ${!proximo && html`<p style="font-size:14px;font-weight:600">No queda nada agendado. Día libre.</p>`}
    </section>
    ${proximo && html`<${Proximo} e=${proximo} etiqueta=${proximo.fecha === fecha ? 'Lo próximo' : fechaLarga(proximo.fecha)} personas=${personas} />`}
    ${despues && html`<${Proximo} e=${despues} etiqueta=${despues.fecha === proximo.fecha ? 'Después' : fechaLarga(despues.fecha)} personas=${personas} />`}
    ${noche && html`
      <a class="tarjeta fila-link" href="#/reservas" style="background:var(--lila)">
        <div class="texto">
          <p class="sub">Esta noche dormimos en</p>
          <p class="titulo">${noche.titulo}</p>
          ${noche.direccion && html`<p class="sub">${noche.direccion}</p>`}
        </div>
        <${Flecha} />
      </a>`}`;
}

function Proximo({ e, etiqueta, personas }) {
  return html`<a class="tarjeta fila-link" href="#/itinerario" style=${'background:' + (CATEGORIAS[e.categoria] || 'var(--blanco)') + ';border:2px solid var(--tinta)'}>
    <div class="texto">
      <p class="sub">${etiqueta}${e.hora ? ' · ' + e.hora : ''}</p>
      <p class="titulo">${e.titulo}</p>
      <p class="sub">${[e.lugar, quienesVan(e, personas)].filter(Boolean).join(' · ')}</p>
    </div>
    <${Flecha} />
  </a>`;
}

/** '14:30' → '13:30' (sin pasar de medianoche). */
function restarHora(hhmm) {
  const h = Math.max(0, Number(hhmm.slice(0, 2)) - 1);
  return String(h).padStart(2, '0') + hhmm.slice(2);
}
