// Gastos: cargar, repartir, lo que falta pagar (gasto por gasto) y pagos hechos (RF-30 a RF-36).
import { html, useState } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { Avatar, BotonAgregar, BotonBorrar, Hoja, useLive, usePersonas, useSesion, useViaje } from '../ui.js';
import { fechaLarga, hoyISO } from '../util.js';
import { MONEDAS, aCentavos, cambioDelViaje, centavosATexto, deudas, enPesos, enReales, plata, repartir } from '../cuentas.js';

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

/** Lo que debo y lo que me deben, sin compensar (centavos de reales). También para Inicio. */
export function misDeudas(cuentas, yoId) {
  const pendientes = deudas(cuentas.gastos, cuentas.liquidaciones).filter((d) => d.falta > 0);
  const sumar = (lista) => lista.reduce((s, d) => s + d.falta, 0);
  return {
    pendientes,
    debo: sumar(pendientes.filter((d) => d.deId === yoId)),
    meDeben: sumar(pendientes.filter((d) => d.aId === yoId)),
  };
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
  const { pendientes, debo, meDeben } = misDeudas(cuentas, personaId);

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
          ${!debo && !meDeben && html`<p class="etiqueta">Estás al día</p>`}
          ${debo > 0 && html`<p class="chico-saldo">Debés <strong>${enPesos(debo, viaje)}</strong></p>`}
          ${meDeben > 0 && html`<p class="chico-saldo">Te deben <strong>${enPesos(meDeben, viaje)}</strong></p>`}
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

      ${vista === 'porPagar' && html`<${PorPagar} pendientes=${pendientes} cuentas=${cuentas} viaje=${viaje} yoId=${personaId} nombre=${nombre} />`}
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

function PorPagar({ pendientes, cuentas, viaje, yoId, nombre }) {
  if (!pendientes.length) {
    return html`<section class="tarjeta grande vacio" style="background:var(--menta)">
      <p class="titulo-vacio">Están a mano 🎉</p>
      <p>${cuentas.gastos.length ? 'No queda nada por pagar.' : 'Cuando carguen gastos, acá aparece quién le debe a quién.'}</p>
    </section>`;
  }
  const grupos = [
    { titulo: 'Lo que debés', lista: pendientes.filter((d) => d.deId === yoId) },
    { titulo: 'Lo que te deben', lista: pendientes.filter((d) => d.aId === yoId) },
    { titulo: 'Entre las demás', lista: pendientes.filter((d) => d.deId !== yoId && d.aId !== yoId) },
  ].filter((g) => g.lista.length);

  return html`
    <p class="explica">Cada gasto por separado. Cuando alguien pague, tocá «Ya pagó» y pasa a Pagos.</p>
    ${grupos.map((g) => html`
      <h2 class="titulo-dia">${g.titulo}</h2>
      ${g.lista.map((d) => html`<${FilaDeuda} key=${d.id} d=${d} viaje=${viaje} yoId=${yoId} nombre=${nombre} />`)}`)}
  `;
}

function FilaDeuda({ d, viaje, yoId, nombre }) {
  const quien = d.deId === yoId
    ? `Le debés a ${nombre(d.aId)}`
    : d.aId === yoId
      ? `${nombre(d.deId)} te debe`
      : `${nombre(d.deId)} le debe a ${nombre(d.aId)}`;
  async function marcarPagada() {
    // El id del pago es el de la deuda: queda atado a este gasto.
    await guardar('Liquidaciones', { id: d.id, fecha: hoyISO(), deId: d.deId, aId: d.aId, monto: d.monto, deleted: false });
  }
  return html`<div class=${'fila-deuda' + (d.deId === yoId ? ' mia' : '')}>
    <div class="texto">
      <p class="titulo">${d.gasto.descripcion}</p>
      <p class="sub">${quien}${d.gasto.fecha ? ' · ' + fechaCorta(d.gasto.fecha) : ''}</p>
      ${d.pagado > 0 && html`<p class="sub">Ya pagó ${enPesos(d.pagado, viaje)}, falta el resto</p>`}
    </div>
    <div class="montos">
      <p class="monto">${enPesos(d.falta, viaje)}</p>
      <button type="button" class="boton chico" onClick=${marcarPagada}>${d.deId === yoId ? 'Ya pagué' : 'Ya pagó'}</button>
    </div>
  </div>`;
}

function fechaCorta(iso) {
  return fechaLarga(iso).replace(/^\S+ /, '');
}

function Pagos({ cuentas, viaje, nombre }) {
  if (!cuentas.liquidaciones.length) {
    return html`<section class="tarjeta grande vacio" style="background:var(--lila)">
      <p class="titulo-vacio">Todavía no hay pagos</p>
      <p>Cuando alguien pague, marcalo en «Por pagar» y queda anotado acá.</p>
    </section>`;
  }
  const gasto = (l) => cuentas.gastos.find((g) => l.id.startsWith(g.id + ':'));
  return html`<section class="seccion">
    <h2>Pagos hechos</h2>
    <p class="nota">Si marcaste uno por error, deshacelo y vuelve a «Por pagar».</p>
    ${cuentas.liquidaciones.map((l) => html`<${FilaPago} key=${l.id} l=${l} gasto=${gasto(l)} viaje=${viaje} nombre=${nombre} />`)}
  </section>`;
}

function FilaPago({ l, gasto, viaje, nombre }) {
  const [confirmando, setConfirmando] = useState(false);
  return html`<div class="fila-pago">
    <div class="texto">
      <p><strong>${nombre(l.deId)}</strong> → <strong>${nombre(l.aId)}</strong> · ${enPesos(l.monto, viaje)}</p>
      <p class="nota">${[gasto?.descripcion, l.fecha && 'pagado el ' + fechaCorta(l.fecha)].filter(Boolean).join(' · ')}</p>
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
