/**
 * Río 2027 — backend de la app.
 *
 * Instalación (una sola vez):
 *   1. Ejecutá setup(): crea las pestañas y el código del viaje (lo ves en el registro).
 *   2. Implementar > Nueva implementación > App web
 *      Ejecutar como: yo · Quién tiene acceso: cualquier usuario.
 *
 * Importante: no edites datos a mano en la planilla. Cada fila necesita su
 * updatedAt para que los celulares se enteren del cambio.
 */

// Columnas de cada pestaña y su tipo: s = texto, n = número, b = sí/no, j = lista.
// Todas llevan además id (primera columna), updatedAt y deleted (al final).
const TABLAS = {
  Viaje:         { nombre: 's', fechaInicio: 's', fechaFin: 's', monedaBase: 's', cambioUSD: 'n', cambioUYU: 'n', linkAlbum: 's' },
  Personas:      { nombre: 's', color: 's' },
  Itinerario:    { fecha: 's', hora: 's', titulo: 's', lugar: 's', mapsUrl: 's', categoria: 's', participantes: 'j', ideaId: 's' },
  Reservas:      { tipo: 's', titulo: 's', fecha: 's', hora: 's', detalle: 's', codigo: 's', direccion: 's' },
  Ideas:         { titulo: 's', categoriaId: 's', nota: 's', url: 's', fuente: 's', estado: 's', personaId: 's' },
  Votos:         { ideaId: 's', personaId: 's', valor: 'n' },
  Categorias:    { nombre: 's' },
  Gastos:        { fecha: 's', monto: 'n', moneda: 's', cambio: 'n', descripcion: 's', pagoId: 's', participantes: 'j' },
  Liquidaciones: { fecha: 's', deId: 's', aId: 's', monto: 'n' },
  Equipaje:      { tipo: 's', nombre: 's', personaId: 's', listo: 'b' },
};

const MAX_OPS = 500;
const MAX_TEXTO = 2000;
const ID_VALIDO = /^[A-Za-z0-9:_-]{1,80}$/;

function columnas_(tabla) {
  return ['id'].concat(Object.keys(TABLAS[tabla]), ['updatedAt', 'deleted']);
}

// ───────────────────────── Instalación ─────────────────────────

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLAS).forEach(function (tabla) {
    const cols = columnas_(tabla);
    const sh = ss.getSheetByName(tabla) || ss.insertSheet(tabla);
    // Todo como texto plano: si no, Sheets convierte "2027-01-18" o "08:30" en fechas.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  ss.getSheets().forEach(function (sh) {
    if (!TABLAS[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CODIGO')) props.setProperty('CODIGO', nuevoCodigo_());
  if (!props.getProperty('VIAJE_ID')) props.setProperty('VIAJE_ID', Utilities.getUuid());

  const viaje = ss.getSheetByName('Viaje');
  if (viaje.getLastRow() < 2) {
    const reloj = { t: Number(props.getProperty('RELOJ') || 0) };
    const fila = ['viaje', 'Río 2027', '2027-01-18', '', 'BRL', '', '', '', String(avanzar_(reloj)), 'false'];
    viaje.getRange(2, 1, 1, fila.length).setNumberFormat('@').setValues([fila]);
    props.setProperty('RELOJ', String(reloj.t));
  }
  Logger.log('Listo. Código del viaje: ' + props.getProperty('CODIGO'));
}

/** Genera un código nuevo. Los celulares con el código viejo vuelven a la pantalla de entrada. */
function rotarCodigo() {
  const codigo = nuevoCodigo_();
  PropertiesService.getScriptProperties().setProperty('CODIGO', codigo);
  Logger.log('Código nuevo: ' + codigo);
}

/** Muestra el código actual en el registro. */
function verCodigo() {
  Logger.log('Código del viaje: ' + PropertiesService.getScriptProperties().getProperty('CODIGO'));
}

function nuevoCodigo_() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
  let c = '';
  for (let i = 0; i < 4; i++) c += letras.charAt(Math.floor(Math.random() * letras.length));
  return 'RIO-' + c;
}

function normalizarCodigo_(c) {
  return String(c || '').replace(/\s/g, '').toUpperCase();
}

// ───────────────────────── API ─────────────────────────

function doGet() {
  return ContentService.createTextOutput('Río 2027: el backend funciona.');
}

/**
 * Única llamada de la app: sube los cambios pendientes y baja lo nuevo.
 * Pedido:    { codigo, since, ops: [{ tabla, fila }] }
 * Respuesta: { ok, viajeId, cursor, cambios: { Tabla: [fila] }, rechazados: [{ tabla, id, motivo }] }
 */
function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'formato' });
  }
  const props = PropertiesService.getScriptProperties();
  if (!pedido || normalizarCodigo_(pedido.codigo) !== props.getProperty('CODIGO')) {
    return json_({ ok: false, error: 'codigo' });
  }
  const ops = Array.isArray(pedido.ops) ? pedido.ops : [];
  if (ops.length > MAX_OPS) return json_({ ok: false, error: 'demasiados' });
  const since = Number(pedido.since) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reloj = { t: Number(props.getProperty('RELOJ') || 0) };
    const relojInicial = reloj.t;
    const cache = {};
    const rechazados = [];

    ops.forEach(function (op) {
      const motivo = aplicar_(ss, cache, reloj, op);
      if (motivo) rechazados.push({ tabla: op && op.tabla, id: op && op.fila && op.fila.id, motivo: motivo });
    });
    Object.keys(cache).forEach(function (tabla) { guardar_(cache[tabla]); });
    if (reloj.t !== relojInicial) props.setProperty('RELOJ', String(reloj.t));

    const cambios = {};
    Object.keys(TABLAS).forEach(function (tabla) {
      const t = cargar_(ss, cache, tabla);
      const iUpd = t.cols.indexOf('updatedAt');
      const filas = t.filas.slice(1)
        .filter(function (f) { return Number(f[iUpd]) > since; })
        .map(function (f) { return leer_(tabla, t.cols, f); });
      if (filas.length) cambios[tabla] = filas;
    });
    return json_({ ok: true, viajeId: props.getProperty('VIAJE_ID'), cursor: reloj.t, cambios: cambios, rechazados: rechazados });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Reloj estrictamente creciente: dos escrituras nunca comparten updatedAt,
// así ningún celular se pierde un cambio por caer en el mismo milisegundo.
function avanzar_(reloj) {
  reloj.t = Math.max(Date.now(), reloj.t + 1);
  return reloj.t;
}

// ───────────────────────── Lectura y escritura ─────────────────────────

function cargar_(ss, cache, tabla) {
  if (cache[tabla]) return cache[tabla];
  const sh = ss.getSheetByName(tabla);
  if (!sh) throw new Error('Falta la pestaña ' + tabla + '. Ejecutá setup().');
  const cols = columnas_(tabla);
  const n = sh.getLastRow();
  const filas = n > 1 ? sh.getRange(1, 1, n, cols.length).getValues() : [cols.slice()];
  filas[0] = cols.slice();
  const indice = {};
  for (let i = 1; i < filas.length; i++) indice[String(filas[i][0])] = i;
  cache[tabla] = { sh: sh, cols: cols, filas: filas, indice: indice, sucio: false };
  return cache[tabla];
}

function guardar_(t) {
  if (!t.sucio) return;
  t.sh.getRange(1, 1, t.filas.length, t.cols.length).setNumberFormat('@').setValues(t.filas);
}

/** Aplica un cambio. Devuelve el motivo si se rechaza, o nada si salió bien. */
function aplicar_(ss, cache, reloj, op) {
  if (!op || typeof op !== 'object') return 'op';
  const tipos = TABLAS[op.tabla];
  if (!tipos || !Object.prototype.hasOwnProperty.call(TABLAS, op.tabla)) return 'tabla';
  const f = op.fila;
  if (!f || typeof f !== 'object' || !ID_VALIDO.test(String(f.id || ''))) return 'id';

  const t = cargar_(ss, cache, op.tabla);
  const fila = [String(f.id)];
  const campos = Object.keys(tipos);
  for (let i = 0; i < campos.length; i++) {
    const v = aCelda_(tipos[campos[i]], f[campos[i]]);
    if (v === undefined) return 'campo ' + campos[i];
    fila.push(v);
  }

  if (op.tabla === 'Viaje' && f.id !== 'viaje') return 'id';
  if (op.tabla === 'Personas' && !f.deleted) {
    const nombre = normalizarNombre_(f.nombre);
    if (!nombre || nombre.length > 40) return 'nombre';
    for (let i = 1; i < t.filas.length; i++) {
      const otra = t.filas[i];
      if (otra[0] !== f.id && otra[t.cols.indexOf('deleted')] !== 'true' && normalizarNombre_(otra[1]) === nombre) return 'duplicado';
    }
  }
  if (op.tabla === 'Categorias' && !f.deleted) {
    const nombre = normalizarNombre_(f.nombre);
    if (!nombre) return 'nombre';
    for (let i = 1; i < t.filas.length; i++) {
      const otra = t.filas[i];
      if (otra[0] !== f.id && otra[t.cols.indexOf('deleted')] !== 'true' && normalizarNombre_(otra[1]) === nombre) return 'duplicado';
    }
  }

  fila.push(String(avanzar_(reloj)), f.deleted ? 'true' : 'false');
  const i = t.indice[fila[0]];
  if (i) {
    t.filas[i] = fila;
  } else {
    t.indice[fila[0]] = t.filas.length;
    t.filas.push(fila);
  }
  t.sucio = true;
}

// Valor de la app → texto de la celda. undefined = valor inválido.
function aCelda_(tipo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 's') {
    if (typeof v !== 'string' || v.length > MAX_TEXTO) return undefined;
    return /^[=+@]/.test(v) ? "'" + v : v; // que Sheets no lo tome como fórmula
  }
  if (tipo === 'n') return typeof v === 'number' && isFinite(v) ? String(v) : undefined;
  if (tipo === 'b') return typeof v === 'boolean' ? String(v) : undefined;
  if (tipo === 'j') {
    if (!Array.isArray(v) || v.length > 100) return undefined;
    if (!v.every(function (x) { return typeof x === 'string' && ID_VALIDO.test(x); })) return undefined;
    return JSON.stringify(v);
  }
  return undefined;
}

// Fila de la planilla → objeto para la app.
function leer_(tabla, cols, f) {
  const tipos = TABLAS[tabla];
  const o = { id: String(f[0]) };
  for (let i = 1; i < cols.length; i++) {
    const col = cols[i];
    const v = f[i];
    if (col === 'updatedAt') o.updatedAt = Number(v) || 0;
    else if (col === 'deleted') o.deleted = v === true || v === 'true';
    else if (tipos[col] === 'n') o[col] = v === '' ? null : Number(v);
    else if (tipos[col] === 'b') o[col] = v === true || v === 'true';
    else if (tipos[col] === 'j') o[col] = parsearLista_(v);
    else o[col] = String(v).replace(/^'(?=[=+@])/, '');
  }
  return o;
}

function parsearLista_(v) {
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x : [];
  } catch (err) {
    return [];
  }
}

function normalizarNombre_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}
