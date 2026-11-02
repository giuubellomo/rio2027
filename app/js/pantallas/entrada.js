// Entrada: código del viaje (RF-01) y elegir quién sos (RF-02, RF-03, RF-04).
import { html, useState } from '../vendor/preact-htm.js';
import { guardar, nuevoId } from '../db.js';
import { sesion } from '../sesion.js';
import { entrar, sincronizar } from '../sync.js';
import { SinSenal, CodigoInvalido } from '../api.js';
import { normalizar, colorLibre } from '../util.js';
import { Avatar, Estrella, usePersonas, useSesion } from '../ui.js';

export function Entrada() {
  const { codigo } = useSesion();
  return html`<div class="app">
    <section class="portada">
      <${Estrella} tam=${190} />
      <p class="etiqueta">Viaje del grupo</p>
      <h1>Río<br />2027</h1>
      <p class="bajada">Itinerario, reservas, ideas y gastos en un solo lugar.</p>
    </section>
    <main class="hoja">
      ${codigo ? html`<${ElegirPersona} />` : html`<${PedirCodigo} />`}
    </main>
  </div>`;
}

function PedirCodigo() {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const limpio = codigo.replace(/\s/g, '').toUpperCase();
  const listo = limpio.length >= 6 && !cargando;

  async function continuar(e) {
    e.preventDefault();
    if (!listo) return;
    setCargando(true);
    setError('');
    try {
      await entrar(limpio);
    } catch (err) {
      if (err instanceof CodigoInvalido) setError('Ese código no existe. Revisalo con quien armó el viaje.');
      else if (err instanceof SinSenal) setError('No hay conexión. La primera vez necesitás señal para entrar.');
      else setError('Algo salió mal: ' + err.message);
      setCargando(false);
    }
  }

  return html`<form onSubmit=${continuar} style="display:contents">
    <label for="codigo" style="font-family:var(--titulos);font-size:24px;font-weight:800">Código del viaje</label>
    <input id="codigo" class="entrada-codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
      placeholder="RIO-0000" value=${codigo} onInput=${(e) => setCodigo(e.currentTarget.value.toUpperCase())}
      aria-describedby="codigo-ayuda" aria-invalid=${error ? 'true' : undefined} />
    <p id="codigo-ayuda" class="nota" style="font-size:14px">Te lo pasa quien armó el viaje. Se pone una sola vez.</p>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    <button class="boton" type="submit" disabled=${!listo}>${cargando ? 'Entrando…' : 'Continuar'}</button>
  </form>`;
}

function ElegirPersona() {
  const personas = usePersonas();
  const [elegida, setElegida] = useState(null);
  const [agregandoManual, setAgregando] = useState(false);
  const agregando = agregandoManual || personas.length === 0;
  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState('');

  async function agregarme(e) {
    e.preventDefault();
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    if (limpio.length > 40) return setAviso('El nombre puede tener hasta 40 letras.');
    const existente = personas.find((p) => normalizar(p.nombre) === normalizar(limpio));
    if (existente) {
      setElegida(existente.id);
      setAgregando(false);
      setAviso(`${existente.nombre} ya está en la lista: te seleccionamos.`);
      return;
    }
    const persona = { id: nuevoId(), nombre: limpio, color: colorLibre(personas), deleted: false };
    await guardar('Personas', persona);
    sincronizar();
    sesion.set({ personaId: persona.id });
  }

  function salir() {
    sesion.set({ codigo: null });
  }

  return html`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <h2 style="font-size:28px">¿Quién sos?</h2>
      <button type="button" class="boton-borde" onClick=${salir}>Otro código</button>
    </div>
    ${aviso && html`<p class="ok" role="status">${aviso}</p>`}
    <div role="radiogroup" aria-label="Elegí tu nombre" class="grilla-personas">
      ${personas.map((p) => {
        const on = elegida === p.id;
        return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} class="persona"
          style=${on ? 'background:' + p.color : ''} onClick=${() => { setElegida(p.id); setAviso(''); }}>
          <${Avatar} persona=${p} tam=${48} />${p.nombre}
        </button>`;
      })}
      ${!agregando && html`<button type="button" class="persona nueva" onClick=${() => setAgregando(true)}>
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        No estoy
      </button>`}
    </div>
    ${agregando && html`<form class="campo" onSubmit=${agregarme}>
      <label for="nombre">${personas.length ? 'No estoy en la lista: ¿cómo te llamás?' : 'Sos la primera. ¿Cómo te llamás?'}</label>
      <div style="display:flex;gap:8px">
        <input id="nombre" class="entrada" type="text" autocomplete="given-name" maxlength="40" value=${nombre}
          onInput=${(e) => setNombre(e.currentTarget.value)} />
        <button class="boton chico" type="submit" disabled=${!nombre.trim()}>Agregarme</button>
      </div>
    </form>`}
    ${!agregando && html`<button class="boton" type="button" disabled=${!elegida} onClick=${() => sesion.set({ personaId: elegida })}>
      Entrar
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
    </button>`}
    <p class="nota" style="text-align:center">Queda guardado en este celular. Se cambia en Ajustes.</p>
  `;
}
