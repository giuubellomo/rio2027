import { API_URL } from './config.js';

export class SinSenal extends Error {}
export class CodigoInvalido extends Error {}

/** Llama a Code.gs. Va como text/plain para que el navegador no haga preflight de CORS. */
export async function llamar(cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new SinSenal('Sin conexión');
  }
  if (!respuesta.ok) throw new SinSenal('El servidor respondió ' + respuesta.status);

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error('Respuesta inválida del servidor');
  }
  if (!datos.ok) {
    if (datos.error === 'codigo') throw new CodigoInvalido('Código inválido');
    throw new Error('Error del servidor: ' + datos.error);
  }
  return datos;
}
