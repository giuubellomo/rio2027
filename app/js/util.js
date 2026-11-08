/** Para comparar nombres sin importar mayúsculas, tildes ni espacios de más. */
export function normalizar(texto) {
  return String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

export function inicial(nombre) {
  return (String(nombre || '').trim()[0] || '?').toUpperCase();
}

// Colores de persona: los acentos v2 primero, después tonos que combinan.
export const COLORES = ['#FF7A59', '#C9B6FF', '#8CC8FF', '#8EE3C8', '#FFD84D', '#FFB3D1', '#B8E986', '#FFB570', '#A0E7F0', '#E0C3A0'];

export function colorLibre(personas) {
  const usados = new Set(personas.map((p) => p.color));
  return COLORES.find((c) => !usados.has(c)) || COLORES[personas.length % COLORES.length];
}

// Fechas: se guardan como 'YYYY-MM-DD' (sin hora ni zona) para que no se corran.
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasEntre(desdeISO, hastaISO) {
  return Math.round((Date.parse(hastaISO) - Date.parse(desdeISO)) / 86400000);
}

const formatoDia = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** '2027-01-18' → 'Lunes 18 de enero' */
export function fechaLarga(iso) {
  if (!iso) return '';
  const texto = formatoDia.format(new Date(iso + 'T00:00:00Z')).replace(',', '');
  return texto[0].toUpperCase() + texto.slice(1);
}

/** En qué momento del viaje estamos. */
export function momentoDelViaje(viaje, hoy = hoyISO()) {
  if (!viaje?.fechaInicio) return { modo: 'sinFecha' };
  if (hoy < viaje.fechaInicio) return { modo: 'antes', dias: diasEntre(hoy, viaje.fechaInicio) };
  if (!viaje.fechaFin || hoy <= viaje.fechaFin) return { modo: 'durante', dia: diasEntre(viaje.fechaInicio, hoy) + 1 };
  return { modo: 'despues' };
}

export function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Días del viaje, de la ida a la vuelta (RF-12). Sin fecha de vuelta, solo el primero. */
export function diasDelViaje(viaje) {
  if (!viaje?.fechaInicio) return [];
  const fin = viaje.fechaFin && viaje.fechaFin >= viaje.fechaInicio ? viaje.fechaFin : viaje.fechaInicio;
  const dias = [];
  for (let d = viaje.fechaInicio; d <= fin && dias.length < 60; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

const formatoSemana = new Intl.DateTimeFormat('es-UY', { weekday: 'short', timeZone: 'UTC' });

/** '2027-01-18' → { dia: 'Lun', num: 18 } */
export function partesDia(iso) {
  const d = formatoSemana.format(new Date(iso + 'T00:00:00Z')).replace('.', '');
  return { dia: d[0].toUpperCase() + d.slice(1, 3), num: Number(iso.slice(8, 10)) };
}

/** Fecha y hora de ahora como 'YYYY-MM-DD' y 'HH:MM', para comparar con lo guardado. */
export function ahora() {
  const d = new Date();
  return { fecha: hoyISO(), hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

/** Ordena por fecha y hora; lo que no tiene hora va al final del día (RF-14). */
export function porFechaHora(a, b) {
  return (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.hora || '99').localeCompare(b.hora || '99');
}

/** Link a Maps: el que cargaron o, si no hay, una búsqueda por el lugar. */
export function linkMaps(lugar, url) {
  if (url) return url;
  if (lugar) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugar);
  return null;
}
