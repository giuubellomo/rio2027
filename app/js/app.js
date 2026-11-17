import { html, render, useState, useEffect } from './vendor/preact-htm.js';
import { API_URL } from './config.js';
import { iniciarSync } from './sync.js';
import { Nav, useSesion } from './ui.js';
import { Entrada } from './pantallas/entrada.js';
import { Inicio } from './pantallas/inicio.js';
import { Ajustes } from './pantallas/ajustes.js';
import { Itinerario } from './pantallas/itinerario.js';
import { Reservas } from './pantallas/reservas.js';
import { Ideas } from './pantallas/ideas.js';
import { Gastos } from './pantallas/gastos.js';
import { Llevar } from './pantallas/llevar.js';
import { Fotos } from './pantallas/fotos.js';
import { Mapa } from './pantallas/mapa.js';

const RUTAS = ['inicio', 'itinerario', 'reservas', 'ideas', 'gastos', 'llevar', 'fotos', 'mapa', 'ajustes'];

/** '#/ideas/abc' → { ruta: 'ideas', sub: 'abc' } */
function rutaActual() {
  const [r, sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return RUTAS.includes(r) ? { ruta: r, sub: decodeURIComponent(sub) } : { ruta: 'inicio', sub: '' };
}

function useRuta() {
  const [ruta, setRuta] = useState(rutaActual);
  useEffect(() => {
    const alCambiar = () => {
      setRuta(rutaActual());
      scrollTo(0, 0);
    };
    addEventListener('hashchange', alCambiar);
    return () => removeEventListener('hashchange', alCambiar);
  }, []);
  return ruta;
}

function App() {
  const { codigo, personaId } = useSesion();
  const { ruta, sub } = useRuta();

  if (!API_URL) {
    return html`<div class="app"><main class="contenido" style="padding-top:40px">
      <h1>Falta configurar</h1>
      <p>Pegá la URL de Apps Script en <code>js/config.js</code>.</p>
    </main></div>`;
  }
  if (!codigo || !personaId) return html`<${Entrada} />`;

  let pantalla;
  if (ruta === 'inicio') pantalla = html`<${Inicio} />`;
  else if (ruta === 'ajustes') pantalla = html`<${Ajustes} />`;
  else if (ruta === 'itinerario') pantalla = html`<${Itinerario} sub=${sub} />`;
  else if (ruta === 'reservas') pantalla = html`<${Reservas} />`;
  else if (ruta === 'ideas') pantalla = html`<${Ideas} sub=${sub} />`;
  else if (ruta === 'gastos') pantalla = html`<${Gastos} />`;
  else if (ruta === 'llevar') pantalla = html`<${Llevar} />`;
  else if (ruta === 'fotos') pantalla = html`<${Fotos} />`;
  else if (ruta === 'mapa') pantalla = html`<${Mapa} sub=${sub} />`;

  return html`<div class="app">${pantalla}<${Nav} ruta=${ruta} /></div>`;
}

// Link recibido desde "Compartir" en Android (share_target del manifest).
function recibirCompartido() {
  const p = new URLSearchParams(location.search);
  if (!p.has('url') && !p.has('text')) return;
  const compartido = { url: p.get('url') || '', text: p.get('text') || '', title: p.get('title') || '' };
  try {
    localStorage.setItem('rio.compartido', JSON.stringify(compartido));
  } catch {
    /* sin almacenamiento no se puede guardar para después */
  }
  history.replaceState(null, '', location.pathname + '#/ideas');
}

recibirCompartido();
iniciarSync();
render(html`<${App} />`, document.getElementById('app'));

const enLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && !enLocal) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[sw]', e));
}
