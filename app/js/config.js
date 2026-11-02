// URL de la app web de Apps Script (Implementar > Administrar implementaciones > URL).
const URL_APPS_SCRIPT = '';

const enLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// En la compu se usa el servidor de prueba (dev/servidor.js).
export const API_URL = enLocal ? '/api' : URL_APPS_SCRIPT;
export const VERSION = '0.1.0';
