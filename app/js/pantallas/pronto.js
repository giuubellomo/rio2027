// Secciones que todavía no están hechas.
import { html } from '../vendor/preact-htm.js';
import { Estrella } from '../ui.js';

const FASES = {
  gastos: { titulo: 'Gastos', fase: 4, cuando: 'en la segunda semana de enero', color: 'var(--amarillo)' },
};

export function Pronto({ ruta }) {
  const f = FASES[ruta];
  return html`
    <header class="titulo-pantalla"><h1>${f.titulo}</h1></header>
    <main class="contenido">
      <section class="tarjeta grande" style=${'background:' + f.color}>
        <${Estrella} tam=${130} />
        <p class="etiqueta">Fase ${f.fase}</p>
        <h2 style="font-size:32px;line-height:1;max-width:240px">En construcción</h2>
        <p style="font-size:15px;font-weight:600">Llega ${f.cuando}.</p>
      </section>
    </main>
  `;
}
