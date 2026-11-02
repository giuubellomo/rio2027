// Secciones que todavía no están hechas.
import { html } from '../vendor/preact-htm.js';
import { Estrella } from '../ui.js';

const FASES = {
  itinerario: { titulo: 'Itinerario', fase: 2, cuando: 'antes de fin de diciembre', color: 'var(--menta)' },
  reservas: { titulo: 'Reservas', fase: 2, cuando: 'antes de fin de diciembre', color: 'var(--celeste)' },
  ideas: { titulo: 'Ideas', fase: 3, cuando: 'en la primera semana de enero', color: 'var(--coral)' },
  gastos: { titulo: 'Gastos', fase: 4, cuando: 'en la segunda semana de enero', color: 'var(--amarillo)' },
};

function leerCompartido() {
  try {
    return JSON.parse(localStorage.getItem('rio.compartido') || 'null');
  } catch {
    return null;
  }
}

export function Pronto({ ruta }) {
  const f = FASES[ruta];
  const compartido = ruta === 'ideas' ? leerCompartido() : null;
  return html`
    <header class="titulo-pantalla"><h1>${f.titulo}</h1></header>
    <main class="contenido">
      <section class="tarjeta grande" style=${'background:' + f.color}>
        <${Estrella} tam=${130} />
        <p class="etiqueta">Fase ${f.fase}</p>
        <h2 style="font-size:32px;line-height:1;max-width:240px">En construcción</h2>
        <p style="font-size:15px;font-weight:600">Llega ${f.cuando}.</p>
      </section>
      ${compartido && html`<p class="ok">Guardamos el link que compartiste (${compartido.url || compartido.text}). Lo vas a poder pasar a Ideas cuando esta sección esté lista.</p>`}
    </main>
  `;
}
