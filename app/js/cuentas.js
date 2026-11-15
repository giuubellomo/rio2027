// Cuentas de los gastos (RF-31, RF-32 y RF-34). Todo en centavos enteros para no perder plata al redondear.

export const MONEDAS = {
  BRL: { nombre: 'Reales', simbolo: 'R$' },
  USD: { nombre: 'Dólares', simbolo: 'US$' },
  UYU: { nombre: 'Pesos', simbolo: '$U' },
};

/**
 * Texto que escribió la persona → centavos. Acepta «1.250,50», «1250,5», «12.5» y «1.250».
 * Devuelve null si está vacío y false si no es un monto válido.
 */
export function aCentavos(texto) {
  let t = String(texto ?? '').trim().replace(/\s|R\$|US\$|\$U|\$/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // «1.250» son mil doscientos cincuenta
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return false;
  const c = Math.round(Number(t) * 100);
  return c > 0 && c <= 1e11 ? c : false;
}

/** Centavos → texto para editar: 125050 → «1250,50». */
export function centavosATexto(c) {
  if (!c) return '';
  return (c / 100).toFixed(2).replace(/,00$|\.00$/, '').replace('.', ',');
}

const formatos = {};
/** 125050, 'BRL' → «R$ 1.250,50» */
export function plata(centavos, moneda = 'BRL') {
  formatos[moneda] ||= new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n = formatos[moneda].format(Math.abs(centavos) / 100);
  return (centavos < 0 ? '−' : '') + (MONEDAS[moneda]?.simbolo || moneda) + ' ' + n;
}

/**
 * Tipo de cambio de la pestaña Viaje para una moneda, con el mismo sentido que en Ajustes:
 * dólares = cuántos reales vale 1 US$; pesos = cuántos pesos vale 1 R$.
 */
export function cambioDelViaje(viaje, moneda) {
  if (moneda === 'BRL') return 1;
  if (moneda === 'USD') return viaje?.cambioUSD || null;
  if (moneda === 'UYU') return viaje?.cambioUYU || null;
  return null;
}

/** Monto del gasto pasado a reales, en centavos (RF-32). Usa el cambio guardado en el gasto. */
export function enReales(gasto) {
  const m = gasto.monto || 0;
  if (gasto.moneda === 'USD') return Math.round(m * gasto.cambio);
  if (gasto.moneda === 'UYU') return Math.round(m / gasto.cambio);
  return m;
}

/**
 * Reparte un total entre personas sin perder centavos (RF-31).
 * Los centavos que sobran van de a uno, siempre a las mismas personas (orden por id) para que
 * todos los celulares den lo mismo.
 */
export function repartir(total, ids) {
  const orden = [...new Set(ids)].sort();
  const n = orden.length;
  const partes = new Map();
  if (!n) return partes;
  const base = Math.floor(total / n);
  const resto = total - base * n;
  orden.forEach((id, i) => partes.set(id, base + (i < resto ? 1 : 0)));
  return partes;
}

/**
 * Neto de cada persona en centavos de reales: positivo = le deben, negativo = debe (RF-34).
 * Una liquidación «de → a» cuenta como si «de» le hubiera prestado esa plata a «a».
 */
export function netos(gastos, liquidaciones) {
  const neto = new Map();
  const sumar = (id, c) => neto.set(id, (neto.get(id) || 0) + c);
  for (const g of gastos) {
    const total = enReales(g);
    sumar(g.pagoId, total);
    for (const [id, parte] of repartir(total, g.participantes || [])) sumar(id, -parte);
  }
  for (const l of liquidaciones) {
    sumar(l.deId, l.monto);
    sumar(l.aId, -l.monto);
  }
  return neto;
}

/** La menor cantidad de transferencias para quedar a mano: el que más debe le paga al que más le deben (RF-34). */
export function transferencias(neto) {
  const deben = [...neto].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }));
  const cobran = [...neto].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));
  const orden = (a, b) => b.c - a.c || (a.id < b.id ? -1 : 1);
  const lista = [];
  while (deben.length && cobran.length) {
    deben.sort(orden);
    cobran.sort(orden);
    const d = deben[0];
    const a = cobran[0];
    const monto = Math.min(d.c, a.c);
    lista.push({ deId: d.id, aId: a.id, monto });
    d.c -= monto;
    a.c -= monto;
    if (!d.c) deben.shift();
    if (!a.c) cobran.shift();
  }
  return lista;
}

const formatoPesos = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });

/**
 * Para mostrar: centavos de reales → «$U 1.250» (pesos enteros, con el cambio de Ajustes).
 * Las cuentas se siguen haciendo en reales; solo cambia cómo se ven.
 * Sin tipo de cambio cargado, se muestra en reales.
 */
export function enPesos(centavosReales, viaje) {
  const cambio = viaje?.cambioUYU;
  if (!cambio) return plata(centavosReales, 'BRL');
  const pesos = Math.round((centavosReales * cambio) / 100);
  return (pesos < 0 ? '−' : '') + '$U ' + formatoPesos.format(Math.abs(pesos));
}
