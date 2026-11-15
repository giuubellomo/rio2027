// Fotos: link al álbum compartido del grupo (RF-40). Las fotos se suben directo al álbum.
import { html } from '../vendor/preact-htm.js';
import { Flecha, useViaje } from '../ui.js';

export function Fotos() {
  const viaje = useViaje();
  const link = viaje?.linkAlbum;
  return html`
    <header class="titulo-pantalla con-volver">
      <a class="cerrar" href="#/inicio" aria-label="Volver a Inicio">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </a>
      <div><p class="chico">Todas las fotos en un solo lugar</p><h1>Fotos</h1></div>
    </header>
    <main class="contenido">
      ${link
        ? html`<a class="tarjeta grande fila-link" href=${link} target="_blank" rel="noopener" style="background:var(--menta)">
            <div class="texto">
              <p class="titulo" style="font-size:24px">Álbum del grupo</p>
              <p class="sub">Abrir y subir fotos</p>
            </div>
            <${Flecha} />
          </a>
          <section class="seccion">
            <h2>Cómo subir</h2>
            <p>Abrí el álbum, tocá <strong>Agregar</strong> y elegí las fotos y videos. Se suben con la calidad original.</p>
            <p class="nota">Si estás con datos, mejor esperar al Wi-Fi del alojamiento: los videos pesan mucho.</p>
          </section>`
        : html`<section class="tarjeta grande vacio" style="background:var(--amarillo)">
            <p class="titulo-vacio">Todavía no hay álbum</p>
            <p>Creen un álbum compartido en Google Fotos y peguen el link en Ajustes.</p>
            <a class="boton chico" href="#/ajustes">Ir a Ajustes</a>
          </section>`}
    </main>
  `;
}
