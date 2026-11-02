// Ajustes: cambiar de persona o de código (RF-05) y datos del viaje (RF-43).
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { guardar, vaciar } from '../db.js';
import { sesion } from '../sesion.js';
import { sincronizar } from '../sync.js';
import { VERSION } from '../config.js';
import { Avatar, useSync, useViaje, useYo } from '../ui.js';

export function Ajustes() {
  const yo = useYo();
  return html`
    <header class="titulo-pantalla"><p class="chico">Río 2027</p><h1>Ajustes</h1></header>
    <main class="contenido">
      <section class="seccion">
        <h2>Vos</h2>
        <div style="display:flex;align-items:center;gap:12px">
          <${Avatar} persona=${yo} tam=${52} />
          <p style="flex:1;font-size:18px;font-weight:800">${yo?.nombre}</p>
          <button type="button" class="boton-borde" onClick=${() => sesion.set({ personaId: null })}>Cambiar</button>
        </div>
      </section>
      <${DatosViaje} />
      <${Sincronizacion} />
      <${Codigo} />
      <p class="nota" style="text-align:center">Versión ${VERSION}</p>
    </main>
  `;
}

function DatosViaje() {
  const viaje = useViaje();
  const [form, setForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (viaje && !form) setForm(aFormulario(viaje));
  }, [viaje]);
  if (!form) return null;

  const cambiar = (campo) => (e) => {
    setForm({ ...form, [campo]: e.currentTarget.value });
    setMensaje(null);
  };

  async function enviar(e) {
    e.preventDefault();
    if (!form.fechaInicio) return setMensaje({ error: 'Falta la fecha de ida.' });
    if (form.fechaFin && form.fechaFin < form.fechaInicio) return setMensaje({ error: 'La vuelta no puede ser antes de la ida.' });
    const usd = aNumero(form.cambioUSD);
    const uyu = aNumero(form.cambioUYU);
    if (usd === false || uyu === false) return setMensaje({ error: 'El tipo de cambio tiene que ser un número mayor a 0.' });
    await guardar('Viaje', {
      ...viaje,
      nombre: form.nombre.trim() || 'Río 2027',
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      cambioUSD: usd,
      cambioUYU: uyu,
      linkAlbum: form.linkAlbum.trim(),
      deleted: false,
    });
    setMensaje({ ok: 'Guardado. Les llega a todas cuando haya señal.' });
  }

  return html`<form class="seccion" onSubmit=${enviar}>
    <h2>Datos del viaje</h2>
    <div class="campo">
      <label for="v-nombre">Nombre</label>
      <input id="v-nombre" class="entrada" type="text" maxlength="60" value=${form.nombre} onInput=${cambiar('nombre')} />
    </div>
    <div class="dos-columnas">
      <div class="campo">
        <label for="v-ini">Ida</label>
        <input id="v-ini" class="entrada" type="date" value=${form.fechaInicio} onInput=${cambiar('fechaInicio')} />
      </div>
      <div class="campo">
        <label for="v-fin">Vuelta</label>
        <input id="v-fin" class="entrada" type="date" value=${form.fechaFin} min=${form.fechaInicio} onInput=${cambiar('fechaFin')} />
      </div>
    </div>
    <div class="dos-columnas">
      <div class="campo">
        <label for="v-usd">1 US$ = ¿R$?</label>
        <input id="v-usd" class="entrada" type="text" inputmode="decimal" placeholder="5,60" value=${form.cambioUSD} onInput=${cambiar('cambioUSD')} />
      </div>
      <div class="campo">
        <label for="v-uyu">1 R$ = ¿$U?</label>
        <input id="v-uyu" class="entrada" type="text" inputmode="decimal" placeholder="7,50" value=${form.cambioUYU} onInput=${cambiar('cambioUYU')} />
      </div>
    </div>
    <p class="ayuda nota">Los gastos se pasan a reales con estos valores.</p>
    <div class="campo">
      <label for="v-album">Link del álbum de fotos</label>
      <input id="v-album" class="entrada" type="url" inputmode="url" placeholder="https://photos.app.goo.gl/…" value=${form.linkAlbum} onInput=${cambiar('linkAlbum')} />
    </div>
    ${mensaje?.error && html`<p class="error" role="alert">${mensaje.error}</p>`}
    ${mensaje?.ok && html`<p class="ok" role="status">${mensaje.ok}</p>`}
    <button class="boton chico" type="submit">Guardar</button>
  </form>`;
}

function aFormulario(v) {
  const num = (n) => (n == null ? '' : String(n).replace('.', ','));
  return {
    nombre: v.nombre || '',
    fechaInicio: v.fechaInicio || '',
    fechaFin: v.fechaFin || '',
    cambioUSD: num(v.cambioUSD),
    cambioUYU: num(v.cambioUYU),
    linkAlbum: v.linkAlbum || '',
  };
}

/** '5,60' → 5.6 · '' → null · inválido → false */
function aNumero(texto) {
  const t = String(texto).trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : false;
}

function Sincronizacion() {
  const s = useSync();
  const estado = s.sincronizando ? 'Sincronizando…'
    : s.valor === 'sinSenal' ? 'Sin señal'
    : s.valor === 'error' ? 'Hubo un error al sincronizar'
    : 'Conectada';
  const hora = s.ultima ? s.ultima.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : null;
  return html`<section class="seccion">
    <h2>Sincronización</h2>
    <p style="font-weight:600">${estado}${hora ? ` · última vez a las ${hora}` : ''}</p>
    <p class="nota">${s.pendientes ? `${s.pendientes} ${s.pendientes === 1 ? 'cambio espera' : 'cambios esperan'} para subir.` : 'No hay cambios pendientes.'}</p>
    <button type="button" class="boton chico" onClick=${sincronizar} disabled=${s.sincronizando}>Sincronizar ahora</button>
  </section>`;
}

function Codigo() {
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const s = useSync();
  const codigo = sesion.codigo;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el navegador no dejó: se puede copiar a mano */
    }
  }

  async function salir() {
    await vaciar();
    sesion.set({ codigo: null, personaId: null, cursor: null, viajeId: null });
  }

  return html`<section class="seccion">
    <h2>Código del viaje</h2>
    <div class="codigo-viaje">
      <span>${codigo}</span>
      <button type="button" class="boton chico" style="min-height:44px" onClick=${copiar}>${copiado ? '¡Copiado!' : 'Copiar'}</button>
    </div>
    <p class="nota">Pasáselo a las demás para que entren.</p>
    ${!confirmando && html`<button type="button" class="boton-borde peligro" onClick=${() => setConfirmando(true)}>Salir del viaje</button>`}
    ${confirmando && html`
      <p class="error" role="alert">Se borran los datos de este celular${s.pendientes ? ` y se pierden ${s.pendientes} cambios que no se subieron` : ''}. En la planilla no se borra nada.</p>
      <div class="acciones">
        <button type="button" class="boton-borde peligro" onClick=${salir}>Sí, salir</button>
        <button type="button" class="boton-borde" onClick=${() => setConfirmando(false)}>Cancelar</button>
      </div>`}
  </section>`;
}
