// Qué llevar: lista del grupo con quién lleva cada cosa y checklist personal (RF-37 a RF-39).
import { html, useState } from '../vendor/preact-htm.js';
import { guardar, borrar, nuevoId, db } from '../db.js';
import { Avatar, BotonBorrar, Hoja, useLive, usePersonas, useSesion } from '../ui.js';

/** Ítems vivos de Equipaje, en orden alfabético. */
export function useEquipaje() {
  return useLive(async () => (await db.Equipaje.toArray())
    .filter((e) => !e.deleted && e.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [], []);
}

/** Cosas del grupo que nadie se anotó para llevar (RF-09). */
export function sinDuena(equipaje, personas) {
  return equipaje.filter((e) => e.tipo === 'grupo' && !personas.some((p) => p.id === e.personaId));
}

export function Llevar() {
  const equipaje = useEquipaje();
  const personas = usePersonas();
  const { personaId } = useSesion();
  const [vista, setVista] = useState('grupo');
  const [editando, setEditando] = useState(null);

  const grupo = equipaje.filter((e) => e.tipo === 'grupo');
  const mio = equipaje.filter((e) => e.tipo === 'personal' && e.personaId === personaId);
  const libres = sinDuena(equipaje, personas).length;
  const listos = mio.filter((e) => e.listo).length;

  return html`
    <header class="titulo-pantalla con-volver">
      <a class="cerrar" href="#/inicio" aria-label="Volver a Inicio">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </a>
      <div>
        <p class="chico">${libres === 0 ? (grupo.length ? 'Todo tiene dueña' : 'Para no llevar todas lo mismo') : libres === 1 ? '1 cosa sin dueña' : `${libres} cosas sin dueña`}</p>
        <h1>Qué llevar</h1>
      </div>
    </header>
    <div class="segmentos" role="group" aria-label="Lista">
      <button type="button" aria-pressed=${vista === 'grupo' ? 'true' : 'false'} onClick=${() => setVista('grupo')}>Del grupo</button>
      <button type="button" aria-pressed=${vista === 'mio' ? 'true' : 'false'} onClick=${() => setVista('mio')}>Lo mío</button>
    </div>
    <main class="contenido">
      ${vista === 'grupo' && html`
        <p class="explica">Con que lo lleve una alcanza. Anotate y nadie lo repite.</p>
        ${grupo.map((e) => html`<${ItemGrupo} key=${e.id} e=${e} personas=${personas} yoId=${personaId} alEditar=${() => setEditando(e)} />`)}
        <${Agregar} placeholder="Algo para el grupo" alAgregar=${(nombre) => guardar('Equipaje', { id: nuevoId(), tipo: 'grupo', nombre, personaId: '', listo: false, deleted: false })} />`}

      ${vista === 'mio' && html`
        <section class="progreso-llevar" style="background:var(--lila)">
          <div class="fila-saldo">
            <p class="etiqueta">Tu valija</p>
            <p class="monto-medio">${listos} de ${mio.length}</p>
          </div>
          <div class="barra" role="progressbar" aria-label="Cosas listas" aria-valuemin="0" aria-valuemax=${mio.length} aria-valuenow=${listos}>
            <span style=${'width:' + (mio.length ? Math.round((listos / mio.length) * 100) : 0) + '%'}></span>
          </div>
        </section>
        ${mio.map((e) => html`<${ItemMio} key=${e.id} e=${e} alEditar=${() => setEditando(e)} />`)}
        <${Agregar} placeholder="Algo para vos" alAgregar=${(nombre) => guardar('Equipaje', { id: nuevoId(), tipo: 'personal', nombre, personaId, listo: false, deleted: false })} />
        <p class="nota">Las demás no ven tu lista en la app, pero queda guardada en la planilla del viaje.</p>`}
    </main>
    ${editando && html`<${FormItem} item=${editando} alCerrar=${() => setEditando(null)} />`}
  `;
}

function ItemGrupo({ e, personas, yoId, alEditar }) {
  const duena = personas.find((p) => p.id === e.personaId);
  const mia = duena?.id === yoId;
  const anotar = (personaId) => guardar('Equipaje', { ...e, personaId });

  return html`<div class=${'item-llevar' + (duena ? '' : ' libre')} style=${duena ? 'background:' + duena.color : ''}>
    <button type="button" class="nombre" onClick=${alEditar} aria-label=${'Editar ' + e.nombre}>${e.nombre}</button>
    ${!duena && html`<button type="button" class="boton chico" onClick=${() => anotar(yoId)}>Lo llevo yo</button>`}
    ${duena && html`<span class="pildora-persona claro"><${Avatar} persona=${duena} tam=${26} />${mia ? 'Vos' : duena.nombre}</span>`}
    ${mia && html`<button type="button" class="soltar" aria-label=${'Ya no llevo ' + e.nombre} onClick=${() => anotar('')}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>`}
  </div>`;
}

function ItemMio({ e, alEditar }) {
  return html`<div class=${'item-llevar mio' + (e.listo ? ' listo' : '')}>
    <button type="button" class="tilde" role="checkbox" aria-checked=${e.listo ? 'true' : 'false'} aria-label=${e.nombre}
      onClick=${() => guardar('Equipaje', { ...e, listo: !e.listo })}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </button>
    <button type="button" class="nombre" onClick=${alEditar} aria-label=${'Editar ' + e.nombre}>${e.nombre}</button>
  </div>`;
}

function Agregar({ placeholder, alAgregar }) {
  const [nombre, setNombre] = useState('');
  async function enviar(ev) {
    ev.preventDefault();
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    setNombre(''); // antes de guardar, así lo que se escriba mientras tanto no se mezcla
    await alAgregar(limpio[0].toUpperCase() + limpio.slice(1));
  }
  return html`<form class="fila-entrada agregar-llevar" onSubmit=${enviar}>
    <label class="sr" for=${'agregar-' + placeholder}>${placeholder}</label>
    <input id=${'agregar-' + placeholder} class="entrada" type="text" maxlength="60" placeholder=${placeholder} value=${nombre} onInput=${(ev) => setNombre(ev.currentTarget.value)} />
    <button type="submit" class="boton-agregar oscuro" aria-label="Agregar">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  </form>`;
}

function FormItem({ item, alCerrar }) {
  const [nombre, setNombre] = useState(item.nombre);
  async function enviar(ev) {
    ev.preventDefault();
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    await guardar('Equipaje', { ...item, nombre: limpio });
    alCerrar();
  }
  async function eliminar() {
    await borrar('Equipaje', item);
    alCerrar();
  }
  return html`<${Hoja} titulo="Editar" alCerrar=${alCerrar}>
    <form class="formulario" onSubmit=${enviar}>
      <div class="campo">
        <label for="l-nombre">Qué</label>
        <input id="l-nombre" class="entrada" type="text" maxlength="60" value=${nombre} onInput=${(ev) => setNombre(ev.currentTarget.value)} />
      </div>
      <button class="boton" type="submit">Guardar</button>
      <${BotonBorrar} que="de la lista" onBorrar=${eliminar} />
    </form>
  <//>`;
}
