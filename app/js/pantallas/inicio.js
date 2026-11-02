// Inicio: cuenta regresiva (RF-07) y modo "durante el viaje" (RF-10, se completa en la fase 2).
import { html } from '../vendor/preact-htm.js';
import { Avatar, Estrella, Flecha, PildoraSync, usePersonas, useViaje, useYo } from '../ui.js';
import { fechaLarga, momentoDelViaje } from '../util.js';

export function Inicio() {
  const yo = useYo();
  const viaje = useViaje();
  const personas = usePersonas();
  const momento = momentoDelViaje(viaje);
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

      ${momento.modo === 'durante' && html`
        <section class="tarjeta grande" style="background:var(--menta)">
          <${Estrella} tam=${130} />
          <p class="etiqueta">Día ${momento.dia}</p>
          <h2 style="font-size:40px;line-height:0.95;max-width:240px">¡Estamos en Río!</h2>
          <p style="font-size:14px;font-weight:600">Lo próximo del itinerario va a aparecer acá.</p>
        </section>`}

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

      <section class="tarjeta" style="background:var(--celeste)">
        <p class="etiqueta clara">${personas.length === 1 ? '1 viajera' : `${personas.length} viajeras`}</p>
        <div class="avatares">${personas.map((p) => html`<${Avatar} persona=${p} tam=${40} />`)}</div>
        <p style="font-size:14px;font-weight:600">${personas.map((p) => p.nombre).join(', ')}</p>
      </section>
    </main>
  `;
}
