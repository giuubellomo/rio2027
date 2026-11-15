// Gastos: cargar, repartir, balance y transferencias (RF-30 a RF-36).
import { html, useState } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { Avatar, BotonAgregar, BotonBorrar, Hoja, useLive, usePersonas, useSesion, useViaje } from '../ui.js';
import { fechaLarga, hoyISO } from '../util.js';
import { MONEDAS, aCentavos, cambioDelViaje, centavosATexto, enPesos, enReales, netos, plata, repartir, transferencias } from '../cuentas.js';

/** Gastos y liquidaciones vivos, más todas las personas (también las borradas, para mostrar su nombre). */
export function useCuentas() {
  return useLive(async () => {
    const gastos = (await db.Gastos.toArray())
      .filter((g) => !g.deleted && g.monto > 0 && (g.moneda === 'BRL' || g.cambio > 0))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.updatedAt || Infinity) - (a.updatedAt || Infinity) || 0);
    const liquidaciones = (await db.Liquidaciones.toArray())
      .filter((l) => !l.deleted && l.monto > 0)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const todas = await db.Personas.toArray();
    return { gastos, liquidaciones, todas };
  }, [], { gastos: [], liquidaciones: [], todas: [] });
}

/** Mi saldo en centavos de reales: positivo = me deben (para Inicio). */
export function miSaldo(cuentas, yoId) {
  return netos(cuentas.gastos, cuentas.liquidaciones).get(yoId) || 0;
}

export function textoSaldo(c, viaje) {
  if (c > 0) return { titulo: 'Te deben', monto: enPesos(c, viaje) };
  if (c < 0) return { titulo: 'Debés', monto: enPesos(-c, viaje) };
  return { titulo: 'Estás al día', monto: '' };
}

export function Gastos() {
  const cuentas = useCuentas();
  const personas = usePersonas();
  const viaje = useViaje();
  const { personaId } = useSesion();
  const [vista, setVista] = useState('gastos');
  const [editando, setEditando] = useState(null); // null · {} para nuevo · el gasto a editar

  const nombre = (id) => (id === personaId ? 'Vos' : cuentas.todas.find((p) => p.id === id)?.nombre || 'Alguien');
  const total = cuentas.gastos.reduce((s, g) => s + enReales(g), 0);
  const saldo = textoSaldo(miSaldo(cuentas, personaId), viaje);
  const neto = netos(cuentas.gastos, cuentas.liquidaciones);
  for (const p of personas) if (!neto.has(p.id)) neto.set(p.id, 0);
  const pendientes = transferencias(neto);

  // Agrupados por día, del más nuevo al más viejo.
  const dias = [];
  for (const g of cuentas.gastos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo?.fecha === (g.fecha || '')) ultimo.gastos.push(g);
    else dias.push({ fecha: g.fecha || '', gastos: [g] });
  }

  return html`
    <header class="titulo-pantalla con-boton">
      <div><p class="chico">${viaje?.cambioUYU ? 'Todo pasado a pesos' : 'Cargá el cambio en Ajustes para verlo en pesos'}</p><h1>Gastos</h1></div>
      <${BotonAgregar} etiqueta="Agregar gasto" onClick=${() => setEditando({})} />
    </header>
    <div class="segmentos" role="group" aria-label="Vista">
      <button type="button" aria-pressed=${vista === 'gastos' ? 'true' : 'false'} onClick=${() => setVista('gastos')}>Gastos</button>
      <button type="button" aria-pressed=${vista === 'porPagar' ? 'true' : 'false'} onClick=${() => setVista('porPagar')}>Por pagar${pendientes.length ? ' · ' + pendientes.length : ''}</button>
      <button type="button" aria-pressed=${vista === 'pagos' ? 'true' : 'false'} onClick=${() => setVista('pagos')}>Pagos${cuentas.liquidaciones.length ? ' · ' + cuentas.liquidaciones.length : ''}</button>
    </div>
    <main class="contenido">
      <section class="tarjeta resumen-gastos" style="background:var(--amarillo)">
        <div>
          <p class="etiqueta">Total del grupo</p>
          <p class="monto-grande">${enPesos(total, viaje)}</p>
        </div>
        <div class="mi-saldo">
          <p class="etiqueta">${saldo.titulo}</p>
          ${saldo.monto && html`<p class="monto-medio">${saldo.monto}</p>`}
        </div>
      </section>

      ${vista === 'gastos' && html`
        ${dias.map((d) => html`
          <h2 class="titulo-dia">${d.fecha ? fechaLarga(d.fecha) : 'Sin fecha'}</h2>
          ${d.gastos.map((g) => html`<${FilaGasto} key=${g.id} g=${g} viaje=${viaje} yoId=${personaId} nombre=${nombre} alEditar=${() => setEditando(g)} />`)}`)}
        ${cuentas.gastos.length === 0 && html`
          <section class="tarjeta grande vacio" style="background:var(--menta)">
            <p class="titulo-vacio">Todavía no hay gastos</p>
            <p>Cargá lo que pagó cada una y la app calcula quién le debe a quién.</p>
            <button type="button" class="boton chico" onClick=${() => setEditando({})}>Cargar el primero</button>
          </section>`}`}

      ${vista === 'porPagar' && html`<${PorPagar} pendientes=${pendientes} neto=${neto} cuentas=${cuentas} viaje=${viaje} yoId=${personaId} nombre=${nombre} alVerPagos=${() => setVista('pagos')} />`}
      ${vista === 'pagos' && html`<${Pagos} cuentas=${cuentas} viaje=${viaje} nombre=${nombre} />`}
    </main>
    ${editando && html`<${FormGasto} gasto=${editando} personas=${personas} yoId=${personaId} alCerrar=${() => setEditando(null)} />`}
  `;
}

function FilaGasto({ g, viaje, yoId, nombre, alEditar }) {
  const reales = enReales(g);
  const participantes = g.participantes || [];
  const miParte = repartir(reales, participantes).get(yoId);
  const entre = participantes.length === 1 ? 'solo ' + nombre(participantes[0]).replace(/^Vos$/, 'vos') : `entre ${participantes.length}`;

  return html`<button type="button" class="fila-gasto" onClick=${alEditar} aria-label=${'Editar ' + g.descripcion}>
    <div class="texto">
      <p class="titulo">${g.descripcion}</p>
      <p class="sub">${g.pagoId === yoId ? 'Pagaste' : 'Pagó ' + nombre(g.pagoId)} · ${entre}</p>
    </div>
    <div class="montos">
      <p class="monto">${plata(g.monto, g.moneda)}</p>
      ${g.moneda !== 'UYU' && viaje?.cambioUYU && html`<p class="sub">≈ ${enPesos(reales, viaje)}</p>`}
      ${miParte != null && html`<p class="sub">Tu parte ${enPesos(miParte, viaje)}</p>`}
    </div>
  </button>`;
}

// ───────── Por pagar (RF-34 y RF-35) y Pagos ─────────

function PorPagar({ pendientes, neto, cuentas, viaje, yoId, nombre, alVerPagos }) {
  const persona = (id) => cuentas.todas.find((p) => p.id === id);
  // Primero lo que me toca a mí (pagar o cobrar), después el resto.
  const lista = [...pendientes].sort((a, b) => (b.deId === yoId || b.aId === yoId) - (a.deId === yoId || a.aId === yoId));
  const filas = [...neto].sort((a, b) => b[1] - a[1]);

  async function marcarPagada(t) {
    await guardar('Liquidaciones', { id: nuevoId(), fecha: hoyISO(), deId: t.deId, aId: t.aId, monto: t.monto, deleted: false });
  }

  return html`
    ${lista.length === 0
      ? html`<section class="tarjeta grande vacio" style="background:var(--menta)">
          <p class="titulo-vacio">Están a mano 🎉</p>
          <p>${cuentas.gastos.length ? 'Nadie le debe nada a nadie.' : 'Cuando carguen gastos, acá aparece quién le paga a quién.'}</p>
        </section>`
      : html`<p class="explica">Lo que falta pagar para quedar a mano. Cuando alguien pague, tocá «Ya pagó» y pasa a Pagos.</p>`}
    ${lista.map((t) => {
      const mia = t.deId === yoId || t.aId === yoId;
      return html`<div class=${'transferencia' + (mia ? ' mia' : '')}>
        <div class="quienes">
          <${Avatar} persona=${persona(t.deId)} tam=${36} />
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <${Avatar} persona=${persona(t.aId)} tam=${36} />
        </div>
        <p class="texto"><strong>${nombre(t.deId)}</strong> ${t.deId === yoId ? 'le tenés que pagar' : 'le tiene que pagar'} a <strong>${nombre(t.aId).replace(/^Vos$/, 'vos')}</strong></p>
        <div class="fila-saldo">
          <p class="monto-medio">${enPesos(t.monto, viaje)}</p>
          <button type="button" class="boton chico" onClick=${() => marcarPagada(t)}>Ya pagó</button>
        </div>
      </div>`;
    })}

    ${cuentas.gastos.length > 0 && html`
      <section class="seccion">
        <h2>Cómo está cada una</h2>
        ${filas.map(([id, c]) => html`
          <div class="fila-neto">
            <${Avatar} persona=${persona(id)} tam=${36} />
            <p class="texto">${nombre(id)}</p>
            <p class=${'monto' + (c < 0 ? ' debe' : '')}>${c > 0 ? 'le deben ' + enPesos(c, viaje) : c < 0 ? 'debe ' + enPesos(-c, viaje) : 'a mano'}</p>
          </div>`)}
        ${cuentas.liquidaciones.length > 0 && html`<button type="button" class="boton-borde" style="align-self:flex-start" onClick=${alVerPagos}>Ver pagos hechos</button>`}
      </section>`}
  `;
}

function Pagos({ cuentas, viaje, nombre }) {
  if (!cuentas.liquidaciones.length) {
    return html`<section class="tarjeta grande vacio" style="background:var(--lila)">
      <p class="titulo-vacio">Todavía no hay pagos</p>
      <p>Cuando alguien pague lo que debe, marcalo en «Por pagar» y queda anotado acá.</p>
    </section>`;
  }
  return html`<section class="seccion">
    <h2>Pagos hechos</h2>
    <p class="nota">Ya se descontaron del balance. Si marcaste uno por error, deshacelo y vuelve a «Por pagar».</p>
    ${cuentas.liquidaciones.map((l) => html`<${FilaPago} key=${l.id} l=${l} viaje=${viaje} nombre=${nombre} />`)}
  </section>`;
}

function FilaPago({ l, viaje, nombre }) {
  const [confirmando, setConfirmando] = useState(false);
  return html`<div class="fila-pago">
    <div class="texto">
      <p><strong>${nombre(l.deId)}</strong> → <strong>${nombre(l.aId)}</strong> · ${enPesos(l.monto, viaje)}</p>
      <p class="nota">${l.fecha ? fechaLarga(l.fecha) : ''}</p>
    </div>
    ${confirmando
      ? html`<div class="acciones">
          <button type="button" class="boton-borde peligro" onClick=${() => borrar('Liquidaciones', l)}>Sí, deshacer</button>
          <button type="button" class="boton-borde" onClick=${() => setConfirmando(false)}>No</button>
        </div>`
      : html`<button type="button" class="boton-borde" onClick=${() => setConfirmando(true)}>Deshacer</button>`}
  </div>`;
}

// ───────── Formulario (RF-30 y RF-36) ─────────

function FormGasto({ gasto, personas, yoId, alCerrar }) {
  const viaje = useViaje();
  const nuevo = !gasto.id;
  const [form, setForm] = useState({
    descripcion: gasto.descripcion || '',
    monto: centavosATexto(gasto.monto),
    moneda: gasto.moneda || 'BRL',
    cambio: gasto.cambio ? String(gasto.cambio).replace('.', ',') : '',
    fecha: gasto.fecha || hoyISO(),
    pagoId: gasto.pagoId || yoId,
    participantes: gasto.participantes || personas.map((p) => p.id),
  });
  const [error, setError] = useState('');
  const poner = (cambios) => {
    setForm({ ...form, ...cambios });
    setError('');
  };
  const cambiar = (campo) => (e) => poner({ [campo]: e.currentTarget.value });

  // El tipo de cambio queda guardado en cada gasto: si después cambia en Ajustes, los gastos viejos no se mueven.
  const cambioPorDefecto = (moneda) =>
    moneda === gasto.moneda && gasto.cambio ? gasto.cambio : cambioDelViaje(viaje, moneda);
  const cambioVisible = form.cambio || String(cambioPorDefecto(form.moneda) || '').replace('.', ',');

  const alternar = (id) => {
    const p = form.participantes;
    poner({ participantes: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] });
  };
  // Si alguien que estaba en el gasto ya no está en el viaje, se muestra igual para no perderlo.
  const opciones = [...personas, ...form.participantes.filter((id) => !personas.some((p) => p.id === id)).map((id) => ({ id, nombre: 'Alguien que ya no está' }))];

  const montoCent = aCentavos(form.monto);
  const cambioNum = form.moneda === 'BRL' ? 1 : aNumero(cambioVisible);
  const vistaPrevia = montoCent && cambioNum ? enReales({ monto: montoCent, moneda: form.moneda, cambio: cambioNum }) : null;

  async function enviar(e) {
    e.preventDefault();
    const descripcion = form.descripcion.trim();
    if (!descripcion) return setError('Poné en qué se gastó, por ejemplo «Super».');
    if (!montoCent) return setError('Escribí el monto con números, por ejemplo 125,50.');
    if (!cambioNum) return setError(form.moneda === 'USD' ? 'Falta cuántos reales vale 1 US$.' : 'Falta cuántos pesos vale 1 R$.');
    if (!form.pagoId) return setError('Elegí quién pagó.');
    if (!form.participantes.length) return setError('Marcá entre quiénes se divide.');
    await guardar('Gastos', {
      ...gasto,
      id: gasto.id || nuevoId(),
      fecha: form.fecha,
      monto: montoCent,
      moneda: form.moneda,
      cambio: cambioNum,
      descripcion,
      pagoId: form.pagoId,
      participantes: form.participantes,
      deleted: false,
    });
    alCerrar();
  }

  async function eliminar() {
    await borrar('Gastos', gasto);
    alCerrar();
  }

  return html`<${Hoja} titulo=${nuevo ? 'Nuevo gasto' : 'Editar gasto'} alCerrar=${alCerrar}>
    <form class="formulario" onSubmit=${enviar}>
      <div class="campo">
        <label for="g-desc">En qué</label>
        <input id="g-desc" class="entrada" type="text" maxlength="80" placeholder="Super, taxi, caipirinhas…" value=${form.descripcion} onInput=${cambiar('descripcion')} />
      </div>
      <div class="campo">
        <span class="rotulo-campo" id="g-moneda">Moneda</span>
        <div class="segmentos claro" role="radiogroup" aria-labelledby="g-moneda">
          ${Object.entries(MONEDAS).map(([id, m]) => html`
            <button type="button" role="radio" aria-checked=${form.moneda === id ? 'true' : 'false'}
              onClick=${() => poner({ moneda: id, cambio: '' })}>${m.simbolo}</button>`)}
        </div>
      </div>
      <div class="dos-columnas">
        <div class="campo">
          <label for="g-monto">Monto (${MONEDAS[form.moneda].simbolo})</label>
          <input id="g-monto" class="entrada" type="text" inputmode="decimal" placeholder="0,00" value=${form.monto} onInput=${cambiar('monto')} />
        </div>
        <div class="campo">
          <label for="g-fecha">Fecha</label>
          <input id="g-fecha" class="entrada" type="date" value=${form.fecha} onInput=${cambiar('fecha')} />
        </div>
      </div>
      ${form.moneda !== 'BRL' && html`
        <div class="campo">
          <label for="g-cambio">${form.moneda === 'USD' ? '1 US$ = ¿R$?' : '1 R$ = ¿$U?'}</label>
          <input id="g-cambio" class="entrada" type="text" inputmode="decimal" placeholder=${form.moneda === 'USD' ? '5,60' : '7,50'}
            value=${cambioVisible} onInput=${cambiar('cambio')} />
          ${vistaPrevia != null && html`<p class="ayuda">Son ${plata(vistaPrevia)}${viaje?.cambioUYU ? ' (' + enPesos(vistaPrevia, viaje) + ')' : ''}.</p>`}
        </div>`}
      <div class="campo">
        <span class="rotulo-campo" id="g-pago">Pagó</span>
        <div class="opciones" role="group" aria-labelledby="g-pago">
          ${personas.map((p) => html`
            <button type="button" class="persona-chip" aria-pressed=${form.pagoId === p.id ? 'true' : 'false'}
              onClick=${() => poner({ pagoId: p.id })}>
              <${Avatar} persona=${p} tam=${28} />${p.id === yoId ? 'Yo' : p.nombre}
            </button>`)}
        </div>
      </div>
      <div class="campo">
        <span class="rotulo-campo" id="g-entre">Entre quiénes</span>
        <div class="opciones" role="group" aria-labelledby="g-entre">
          ${opciones.map((p) => html`
            <button type="button" class="persona-chip" aria-pressed=${form.participantes.includes(p.id) ? 'true' : 'false'} onClick=${() => alternar(p.id)}>
              <${Avatar} persona=${p} tam=${28} />${p.id === yoId ? 'Yo' : p.nombre}
            </button>`)}
        </div>
        ${vistaPrevia != null && form.participantes.length > 0 && html`
          <p class="ayuda">${form.participantes.length === 1 ? 'Lo paga una sola persona.' : `Cada una pone ${enPesos(Math.floor(vistaPrevia / form.participantes.length), viaje)} aprox.`}</p>`}
      </div>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="boton" type="submit">Guardar</button>
      ${!nuevo && html`<${BotonBorrar} que="el gasto" onBorrar=${eliminar} />`}
    </form>
  <//>`;
}

/** '5,60' → 5.6 · inválido o vacío → null */
function aNumero(texto) {
  const n = Number(String(texto || '').trim().replace(',', '.'));
  return n > 0 && isFinite(n) ? n : null;
}
