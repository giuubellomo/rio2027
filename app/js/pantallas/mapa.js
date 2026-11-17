// Mapa: los Guardados de Ideas y las actividades del Itinerario, con filtros por categoría y por día.
// Se entra desde Inicio, desde un día del Itinerario (#/mapa/2027-01-20) o desde una idea (#/mapa/<id>).
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { Flecha, TituloPestanas, useViaje } from '../ui.js';
import { diasDelViaje, hoyISO, horario, partesDia } from '../util.js';
import { MapaBase, RIO, iconoPin, linkAlLugar, linkComoLlegar, tieneUbicacion } from '../lugares.js';
import { CATEGORIAS, useEventos } from './itinerario.js';
import { useCategorias, useIdeas } from './ideas.js';

const COLOR_IDEA = '#FFB3D9';

/** Distancia en km entre dos puntos (fórmula del haversine). */
function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function textoDistancia(d) {
  if (d < 1) return `a ${Math.max(50, Math.round(d * 20) * 50)} m`;
  return `a ${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`;
}

function diaCorto(iso) {
  const { dia, num } = partesDia(iso);
  return dia + ' ' + num;
}

export function Mapa({ sub }) {
  const viaje = useViaje();
  const dias = diasDelViaje(viaje);
  const ideas = useIdeas();
  const categorias = useCategorias();
  const eventos = useEventos();

  const [modo, setModo] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(sub) ? 'itinerario' : 'guardados'));
  const [cat, setCat] = useState('todas');
  const [dia, setDia] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : 'todos'));
  const [conGuardados, setConGuardados] = useState(false);
  const [elegido, setElegido] = useState(null);
  const [yo, setYo] = useState(null); // { lat, lng } cuando se activa «Dónde estoy»
  const [errorYo, setErrorYo] = useState('');
  const [mapa, setMapa] = useState(null);
  const L = window.L;

  // Abierto desde una idea o una actividad: cuando llegan los datos, se elige ese punto.
  const pendiente = useRef(/^\d{4}-\d{2}-\d{2}$/.test(sub) ? '' : sub);
  const centrar = useRef('');
  useEffect(() => {
    const id = pendiente.current;
    if (!id) return;
    const idea = ideas.find((i) => i.id === id);
    const evento = eventos.find((e) => e.id === id) || (idea?.evento);
    centrar.current = id;
    if (idea && idea.estado === 'guardada') {
      setModo('guardados');
      setElegido(id);
    } else if (evento) {
      centrar.current = evento.id;
      setModo('itinerario');
      setDia(evento.fecha);
      setElegido(evento.id);
    } else {
      centrar.current = '';
      return;
    }
    pendiente.current = '';
  }, [ideas, eventos]);

  // ── Puntos ──
  const guardados = ideas.filter((i) => i.estado === 'guardada');
  const colorCat = (id) => categorias.find((c) => c.id === id)?.color || COLOR_IDEA;
  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || 'Sin categoría';
  const deIdea = (i, extra = {}) => ({
    id: i.id, tipo: 'idea', titulo: i.titulo, color: colorCat(i.categoriaId), etiqueta: nombreCat(i.categoriaId),
    lat: i.lat, lng: i.lng, lugar: i.lugar, mapsUrl: i.mapsUrl, url: i.url, fuente: i.fuente, href: '#/ideas/' + encodeURIComponent(i.id), ...extra,
  });
  // Una actividad que vino de una idea usa la ubicación de la idea si no tiene la suya.
  const conUbicacion = (e) => {
    if (tieneUbicacion(e)) return e;
    const idea = e.ideaId && ideas.find((i) => i.id === e.ideaId);
    return idea && tieneUbicacion(idea) ? { ...e, lat: idea.lat, lng: idea.lng, lugar: e.lugar || idea.lugar, mapsUrl: e.mapsUrl || idea.mapsUrl } : e;
  };
  const deEvento = (e, texto) => ({
    id: e.id, tipo: 'evento', titulo: e.titulo, color: CATEGORIAS[e.categoria] || CATEGORIAS.Otro, texto,
    etiqueta: diaCorto(e.fecha) + (e.hora ? ' · ' + horario(e.hora, e.duracion) : ''),
    lat: e.lat, lng: e.lng, lugar: e.lugar, mapsUrl: e.mapsUrl, href: '#/itinerario/' + e.fecha,
  });

  let candidatos;
  let linea = [];
  if (modo === 'guardados') {
    const sinCategoria = (i) => !categorias.some((c) => c.id === i.categoriaId);
    candidatos = guardados.filter((i) => cat === 'todas' || (cat === '' ? sinCategoria(i) : i.categoriaId === cat)).map((i) => deIdea(i));
  } else {
    const delFiltro = eventos.filter((e) => dia === 'todos' || e.fecha === dia).map(conUbicacion);
    let n = 0;
    // Un día: números en el orden del día. Todos los días: el número es el día del viaje.
    candidatos = delFiltro.map((e) => deEvento(e, dia === 'todos' ? String(dias.indexOf(e.fecha) + 1 || '') : tieneUbicacion(e) ? String(++n) : ''));
    if (dia !== 'todos') linea = candidatos.filter(tieneUbicacion).map((p) => [p.lat, p.lng]);
    if (conGuardados) candidatos = [...candidatos, ...guardados.map((i) => deIdea(i, { tenue: true }))];
  }
  let puntos = candidatos.filter(tieneUbicacion);
  const sinUbicacion = candidatos.filter((p) => !tieneUbicacion(p) && !p.tenue);
  if (yo) puntos = puntos.map((p) => ({ ...p, km: km(yo, p) }));
  // Guardados: con «Dónde estoy», lo más cerca primero.
  const lista = modo === 'guardados' && yo ? [...puntos].sort((a, b) => a.km - b.km) : puntos.filter((p) => !p.tenue);
  const actual = puntos.find((p) => p.id === elegido);

  // ── Pines ──
  const capa = useRef(null);
  const clavePuntos = puntos.map((p) => [p.id, p.lat, p.lng, p.color, p.texto, p.tenue].join(',')).join('|') + '|' + elegido;
  useEffect(() => {
    if (!mapa) return;
    capa.current?.remove();
    const grupo = L.layerGroup().addTo(mapa);
    if (linea.length > 1) L.polyline(linea, { color: '#16161A', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(grupo);
    puntos.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: iconoPin(L, { color: p.color, texto: p.tenue ? '' : p.texto, elegido: p.id === elegido, tenue: p.tenue && p.id !== elegido }),
        title: p.titulo,
        alt: p.titulo,
        zIndexOffset: p.id === elegido ? 1000 : p.tenue ? -100 : 0,
      }).on('click', () => setElegido(p.id)).addTo(grupo);
    });
    capa.current = grupo;
  }, [mapa, clavePuntos]);

  // Encuadre: cada vez que cambia el filtro (y la primera vez que hay puntos).
  const claveFiltro = [modo, cat, dia, conGuardados].join('|');
  const encuadrado = useRef('');
  useEffect(() => {
    if (!mapa || encuadrado.current === claveFiltro) return;
    if (!puntos.length) {
      if (ideas.length || eventos.length) mapa.setView(RIO, 11);
      encuadrado.current = ideas.length || eventos.length ? claveFiltro : '';
      return;
    }
    const elegidoAhora = puntos.find((p) => p.id === elegido);
    if (elegidoAhora) mapa.setView([elegidoAhora.lat, elegidoAhora.lng], 15);
    else if (puntos.length === 1) mapa.setView([puntos[0].lat, puntos[0].lng], 15);
    else mapa.fitBounds(puntos.map((p) => [p.lat, p.lng]), { padding: [36, 36], maxZoom: 16 });
    encuadrado.current = claveFiltro;
  }, [mapa, claveFiltro, puntos.length, elegido]);

  // Abierto desde una idea o actividad: va a ese punto apenas está en el mapa.
  useEffect(() => {
    const p = puntos.find((x) => x.id === centrar.current);
    if (!mapa || !p) return;
    mapa.setView([p.lat, p.lng], 16);
    centrar.current = '';
  }, [mapa, clavePuntos]);

  // ── Dónde estoy ──
  const seguimiento = useRef({});
  useEffect(() => () => {
    if (seguimiento.current.id != null) navigator.geolocation.clearWatch(seguimiento.current.id);
  }, []);
  useEffect(() => {
    if (!mapa || !yo) return;
    const s = seguimiento.current;
    if (s.punto) s.punto.setLatLng([yo.lat, yo.lng]);
    else s.punto = L.circleMarker([yo.lat, yo.lng], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#1A73E8', fillOpacity: 1, interactive: false }).addTo(mapa);
    if (!s.centrado) {
      mapa.setView([yo.lat, yo.lng], Math.max(mapa.getZoom(), 14));
      s.centrado = true;
    }
  }, [mapa, yo]);

  function dondeEstoy() {
    setErrorYo('');
    const s = seguimiento.current;
    if (yo && mapa) {
      mapa.setView([yo.lat, yo.lng], Math.max(mapa.getZoom(), 15));
      return;
    }
    if (!navigator.geolocation) return setErrorYo('Este celular no comparte la ubicación.');
    s.centrado = false;
    s.id = navigator.geolocation.watchPosition(
      (pos) => setYo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setErrorYo(err.code === 1 ? 'No diste permiso para ver tu ubicación. Activalo en los ajustes del navegador.' : 'No pude encontrar dónde estás.'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }

  function elegir(p) {
    setElegido(p.id);
    if (mapa) mapa.setView([p.lat, p.lng], Math.max(mapa.getZoom(), 15));
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function alListo(m) {
    m.on('click', () => setElegido(null));
    setMapa(m);
  }

  // Que el filtro elegido quede a la vista en la tira.
  const tira = useRef(null);
  useEffect(() => {
    tira.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [modo, dia, cat]);

  // ── Filtros ──
  const ubicadosEn = (lista) => lista.filter(tieneUbicacion).length;
  const catsConGuardados = categorias.filter((c) => guardados.some((i) => i.categoriaId === c.id));
  const sinCat = guardados.some((i) => !categorias.some((c) => c.id === i.categoriaId));
  const eventosUbicados = eventos.map(conUbicacion);

  return html`
    <header class="titulo-pantalla">
      <p class="chico">Río y Búzios</p>
      <${TituloPestanas} actual="mapa" />
    </header>
    <div class="segmentos" role="group" aria-label="Qué ver">
      <button type="button" aria-pressed=${modo === 'guardados' ? 'true' : 'false'} onClick=${() => { setModo('guardados'); setElegido(null); }}>Guardados · ${ubicadosEn(guardados)}</button>
      <button type="button" aria-pressed=${modo === 'itinerario' ? 'true' : 'false'} onClick=${() => { setModo('itinerario'); setElegido(null); }}>Itinerario · ${ubicadosEn(eventosUbicados)}</button>
    </div>
    ${modo === 'guardados' && html`
      <div class="tira-filtros" role="group" aria-label="Categoría" ref=${tira}>
        <button type="button" class="filtro" aria-pressed=${cat === 'todas' ? 'true' : 'false'} onClick=${() => setCat('todas')}>Todas</button>
        ${catsConGuardados.map((c) => html`
          <button type="button" class="filtro" aria-pressed=${cat === c.id ? 'true' : 'false'} onClick=${() => { setCat(c.id); setElegido(null); }}>
            <span class="punto-color" style=${'background:' + c.color} aria-hidden="true"></span>${c.nombre}
            <span class="cuenta-filtro">${ubicadosEn(guardados.filter((i) => i.categoriaId === c.id))}</span>
          </button>`)}
        ${sinCat && html`<button type="button" class="filtro" aria-pressed=${cat === '' ? 'true' : 'false'} onClick=${() => setCat('')}>Sin categoría</button>`}
      </div>`}
    ${modo === 'itinerario' && html`
      <div class="tira-filtros" role="group" aria-label="Día" ref=${tira}>
        <button type="button" class="filtro" aria-pressed=${dia === 'todos' ? 'true' : 'false'} onClick=${() => { setDia('todos'); setElegido(null); }}>Todos</button>
        ${dias.map((d, k) => html`
          <button type="button" class="filtro" aria-pressed=${dia === d ? 'true' : 'false'} onClick=${() => { setDia(d); setElegido(null); }}>
            Día ${k + 1} · ${diaCorto(d)}${d === hoyISO() ? ' · hoy' : ''}
            <span class="cuenta-filtro">${ubicadosEn(eventosUbicados.filter((e) => e.fecha === d))}</span>
          </button>`)}
        <span class="separador" aria-hidden="true"></span>
        <button type="button" class="filtro" aria-pressed=${conGuardados ? 'true' : 'false'} onClick=${() => setConGuardados(!conGuardados)}>+ Guardados</button>
      </div>`}

    <${MapaBase} alListo=${alListo}>
      <button type="button" class="mapa-boton" onClick=${dondeEstoy} aria-label="Mostrar dónde estoy">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      </button>
    <//>

    <main class="contenido">
      ${errorYo && html`<p class="error" role="alert">${errorYo}</p>`}
      ${modo === 'itinerario' && puntos.some((p) => !p.tenue) && html`<p class="nota">${dia === 'todos' ? 'El número de cada pin es el día del viaje.' : 'Los números siguen el orden del día.'}</p>`}
      ${actual && html`<${TarjetaPunto} p=${actual} />`}

      ${lista.filter((p) => p.id !== elegido).map((p) => html`
        <div class="fila-punto" key=${p.id}>
          <button type="button" class="texto" onClick=${() => elegir(p)}>
            <span class="pin-lista" style=${'background:' + p.color} aria-hidden="true">${p.tenue ? '' : p.texto}</span>
            <span class="cuerpo">
              <span class="titulo">${p.titulo}</span>
              <span class="sub">${[p.etiqueta, p.lugar, p.km != null && textoDistancia(p.km)].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
          <a class="flecha-link" href=${linkComoLlegar(p)} target="_blank" rel="noopener" aria-label=${'Cómo llegar a ' + p.titulo}><${Flecha} /></a>
        </div>`)}

      ${puntos.length === 0 && html`
        <section class="tarjeta grande vacio" style="background:var(--amarillo)">
          <p class="titulo-vacio">${candidatos.length ? 'Falta marcarlos en el mapa' : 'Nada por acá todavía'}</p>
          <p>${modo === 'guardados'
            ? 'Al guardar un lugar en Ideas, pegá el link de Google Maps o marcalo en el mapa.'
            : 'Al agregar una actividad, pegá el link de Google Maps o marcala en el mapa.'}</p>
        </section>`}

      ${sinUbicacion.length > 0 && html`
        <section class="seccion">
          <h2>Sin ubicación · ${sinUbicacion.length}</h2>
          <p class="nota">Editalos y pegá el link de Maps (o marcalos en el mapa) para que aparezcan.</p>
          <div class="opciones">
            ${sinUbicacion.map((p) => html`<a class="boton-borde" href=${p.href}>${p.titulo}</a>`)}
          </div>
        </section>`}
    </main>
  `;
}

/** Lo que aparece al tocar un pin. */
function TarjetaPunto({ p }) {
  const fuente = { tiktok: 'TikTok', reels: 'Reels' }[p.fuente] || 'link';
  return html`<section class="tarjeta punto-elegido" style=${'background:' + p.color} aria-live="polite">
    <div class="chips">
      <span class="chip claro">${p.etiqueta}</span>
      ${p.km != null && html`<span class="chip claro">${textoDistancia(p.km)}</span>`}
    </div>
    <div>
      <h2 class="titulo-tarjeta">${p.titulo}</h2>
      ${p.lugar && html`<p class="sub-tarjeta">${p.lugar}</p>`}
    </div>
    <div class="acciones">
      <a class="boton chico" href=${linkComoLlegar(p)} target="_blank" rel="noopener">Cómo llegar</a>
      ${p.url && html`<a class="boton-borde" href=${p.url} target="_blank" rel="noopener">Ver ${fuente}</a>`}
      ${p.mapsUrl && html`<a class="boton-borde" href=${linkAlLugar(p)} target="_blank" rel="noopener">Abrir en Maps</a>`}
      <a class="boton-borde" href=${p.href}>${p.tipo === 'idea' ? 'Ver idea' : 'Ver el día'}</a>
    </div>
  </section>`;
}
