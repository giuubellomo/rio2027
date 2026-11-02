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
