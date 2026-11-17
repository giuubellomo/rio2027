// Ubicaciones: buscar lugares por nombre y el mapa base (Leaflet).
// Lo usan el Mapa (pantallas/mapa.js) y los formularios de Ideas e Itinerario.
import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';

export const RIO = [-22.95, -43.2];
// Zona del viaje (Río a Búzios): la búsqueda prefiere lugares de acá.
const ZONA = { oeste: -43.8, norte: -22.55, este: -41.75, sur: -23.1 };

export const tieneUbicacion = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

const coordValida = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng);
const redondear = (n) => Math.round(n * 1e6) / 1e6;

function par(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return coordValida(a, b) ? { lat: redondear(a), lng: redondear(b) } : null;
}

/** Busca por nombre en OpenStreetMap (gratis). Prefiere Río y Búzios. */
export async function buscarLugar(texto) {
  const q = String(texto || '').trim();
  if (!q) return [];
  const p = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '6',
    countrycodes: 'br',
    'accept-language': 'es',
    viewbox: [ZONA.oeste, ZONA.norte, ZONA.este, ZONA.sur].join(','),
  });
  let r;
  try {
    r = await fetch('https://nominatim.openstreetmap.org/search?' + p);
  } catch {
    throw new Error('sin señal');
  }
  if (!r.ok) throw new Error('búsqueda ' + r.status);
  const datos = await r.json();
  return datos.map((d) => {
    const partes = String(d.display_name || '').split(', ');
    return { nombre: d.name || partes[0], detalle: partes.slice(1, 4).join(', '), ...par(d.lat, d.lon) };
  }).filter((d) => tieneUbicacion(d));
}

/** Link para abrir el lugar en Google Maps (el que cargaron o el punto). */
export function linkAlLugar(p) {
  if (p.mapsUrl) return p.mapsUrl;
  if (tieneUbicacion(p)) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  if (p.lugar) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.lugar);
  return null;
}

/** Cómo llegar desde donde estás, con el punto exacto. */
export const linkComoLlegar = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

// ───────── Mapa base ─────────

let cargando = null;

/** Leaflet se carga recién cuando hace falta un mapa (queda guardado para usar sin señal). */
export function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  cargando ||= new Promise((ok, mal) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'js/vendor/leaflet.js';
    js.onload = () => ok(window.L);
    js.onerror = () => {
      cargando = null;
      js.remove();
      mal(new Error('No cargó Leaflet'));
    };
    document.head.append(js);
  });
  return cargando;
}

/** Pin redondo con borde, del color de la categoría, con un número o un punto. */
export function iconoPin(L, { color, texto = '', elegido = false, tenue = false }) {
  const tam = elegido ? 42 : tenue ? 24 : 32;
  return L.divIcon({
    className: 'pin' + (elegido ? ' elegido' : tenue ? ' tenue' : ''),
    html: `<span style="background:${color}">${texto}</span>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  });
}

/**
 * Mapa de Leaflet dentro de Preact. Leaflet maneja su propio div; Preact no lo toca.
 * alListo(mapa, L) se llama una vez, cuando el mapa existe.
 */
export function MapaBase({ alListo, clase = '', children }) {
  const caja = useRef(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    let mapa;
    cargarLeaflet().then((L) => {
      if (!vivo || !caja.current) return;
      mapa = L.map(caja.current, { zoomControl: false, attributionControl: true }).setView(RIO, 11);
      L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
      mapa.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        crossOrigin: 'anonymous', // así el service worker puede guardar las partes del mapa ya vistas
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(mapa);
      // Si el contenedor cambió de tamaño mientras cargaba, que lo recalcule.
      setTimeout(() => vivo && mapa.invalidateSize(), 0);
      alListo(mapa, L);
    }).catch(() => vivo && setError(true));
    return () => {
      vivo = false;
      mapa?.remove();
    };
  }, []);
  return html`<div class=${'mapa-caja ' + clase}>
    <div class="mapa" ref=${caja}></div>
    ${error && html`<p class="mapa-error">No se pudo abrir el mapa. Probá de nuevo con señal.</p>`}
    ${children}
  </div>`;
}

// ───────── Campo de ubicación (formularios) ─────────

/**
 * Ubicación de una idea o actividad: buscador + mapa. valor = { lugar, mapsUrl, lat, lng }.
 * Elegir un resultado pone el pin y el nombre del lugar; tocar el mapa mueve el pin.
 */
export function CampoUbicacion({ valor, alCambiar, pista = '' }) {
  return html`<div class="campo">
    <p class="rotulo-campo">Ubicación <span class="opcional">(opcional)</span></p>
    <${ElegirEnMapa} valor=${valor} pista=${valor.lugar || pista} alCambiar=${alCambiar} />
  </div>`;
}

/** Buscador + mapa: tocando el mapa (o eligiendo un resultado) se mueve el pin. */
function ElegirEnMapa({ valor, pista, alCambiar }) {
  const [texto, setTexto] = useState(pista);
  const [resultados, setResultados] = useState(null);
  const [error, setError] = useState('');
  const refs = useRef({});

  // El pin sigue al valor: tocando el mapa, eligiendo un resultado o pegando un link.
  function moverPin() {
    const { mapa, L, pin } = refs.current;
    if (!mapa) return;
    if (!tieneUbicacion(valor)) {
      pin?.remove();
      refs.current.pin = null;
      return;
    }
    if (pin) pin.setLatLng([valor.lat, valor.lng]);
    else refs.current.pin = L.marker([valor.lat, valor.lng], { icon: iconoPin(L, { color: 'var(--coral)', elegido: true }), keyboard: false }).addTo(mapa);
    if (!mapa.getBounds().contains([valor.lat, valor.lng])) mapa.setView([valor.lat, valor.lng], 16);
  }
  useEffect(moverPin, [valor.lat, valor.lng]);

  // Si se mueve el pin, un link de Maps viejo ya no coincide: se descarta.
  function poner(lat, lng, zoom, lugar) {
    alCambiar((v) => ({ ...v, lat, lng, mapsUrl: '', lugar: lugar ?? v.lugar }));
    if (zoom) refs.current.mapa?.setView([lat, lng], zoom);
  }

  function alListo(mapa, L) {
    refs.current = { mapa, L };
    if (tieneUbicacion(valor)) mapa.setView([valor.lat, valor.lng], 16);
    moverPin();
    mapa.on('click', (e) => poner(redondear(e.latlng.lat), redondear(e.latlng.lng)));
  }

  async function buscar() {
    setError('');
    setResultados(null);
    try {
      const r = await buscarLugar(texto);
      setResultados(r);
      if (!r.length) setError('No lo encontré. Probá con el nombre en portugués (Pão de Açúcar, Praia…) o tocá el mapa.');
    } catch {
      setError('Sin señal no se puede buscar. Igual podés tocar el mapa.');
    }
  }

  return html`<div class="elegir-mapa">
    <div class="fila-entrada">
      <label for="buscar-lugar" class="sr">Buscar lugar</label>
      <input id="buscar-lugar" class="entrada" type="search" maxlength="120" placeholder="Buscar: Confeitaria Colombo" value=${texto}
        onInput=${(e) => setTexto(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
      <button type="button" class="boton chico" onClick=${buscar}>Buscar</button>
    </div>
    ${error && html`<p class="nota">${error}</p>`}
    ${resultados?.length > 0 && html`<ul class="resultados">
      ${resultados.map((r) => html`<li><button type="button" onClick=${() => { poner(r.lat, r.lng, 16, r.nombre.slice(0, 120)); setResultados(null); }}>
        <span class="titulo">${r.nombre}</span><span class="sub">${r.detalle}</span>
      </button></li>`)}
    </ul>`}
    <${MapaBase} clase="chico" alListo=${alListo} />
    ${tieneUbicacion(valor)
      ? html`<div class="ubicacion ubicada">
          <span class="pin-chico" aria-hidden="true"></span>
          <p class="texto">${valor.lugar || 'Punto marcado en el mapa'}</p>
          <button type="button" class="boton-borde" onClick=${() => alCambiar((v) => ({ ...v, lat: null, lng: null, lugar: '', mapsUrl: '' }))}>Quitar</button>
        </div>`
      : html`<p class="nota">Buscá el lugar o tocá el mapa para poner el pin.</p>`}
  </div>`;
}
