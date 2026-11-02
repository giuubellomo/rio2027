// Servidor de prueba: sirve la app y simula Google Sheets corriendo el Code.gs real.
// Uso: node dev/servidor.js  →  http://localhost:8080
// Los datos quedan en dev/datos.json (borralo para empezar de cero).

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', 'app');
const DATOS = path.join(__dirname, 'datos.json');
const PUERTO = Number(process.env.PORT) || 8080;

const estado = fs.existsSync(DATOS) ? JSON.parse(fs.readFileSync(DATOS, 'utf8')) : { hojas: {}, props: {} };
const guardarEstado = () => fs.writeFileSync(DATOS, JSON.stringify(estado, null, 1));

function hoja(nombre) {
  const datos = () => estado.hojas[nombre];
  return {
    getName: () => nombre,
    getMaxRows: () => 1000,
    getLastRow: () => datos().length,
    setFrozenRows() {},
    getRange(fila, col, nFilas, nCols) {
      return {
        setNumberFormat() { return this; },
        setFontWeight() { return this; },
        getValues() {
          const out = [];
          for (let i = 0; i < nFilas; i++) {
            const f = datos()[fila - 1 + i] || [];
            out.push(Array.from({ length: nCols }, (_, j) => f[col - 1 + j] ?? ''));
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((f, i) => {
            const destino = (datos()[fila - 1 + i] ||= []);
            f.forEach((v, j) => { destino[col - 1 + j] = typeof v === 'string' ? v.replace(/^'/, '') : v; });
          });
          return this;
        },
      };
    },
  };
}

const contexto = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => (estado.hojas[n] ? hoja(n) : null),
      insertSheet: (n) => { estado.hojas[n] = []; return hoja(n); },
      getSheets: () => Object.keys(estado.hojas).map(hoja),
      deleteSheet: (h) => { delete estado.hojas[h.getName()]; },
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => estado.props[k] ?? null,
      setProperty: (k, v) => { estado.props[k] = String(v); },
    }),
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (texto) => ({ texto, setMimeType() { return this; } }),
  },
  Utilities: { getUuid: () => require('crypto').randomUUID() },
  Logger: { log: (m) => console.log('[Code.gs]', m) },
  Date, Math, JSON, Number, String, Object, Array, Error,
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), contexto);

if (!estado.props.CODIGO) {
  contexto.setup();
  guardarEstado();
}
console.log('Código del viaje (prueba):', estado.props.CODIGO);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const salida = req.method === 'POST' ? contexto.doPost({ postData: { contents: cuerpo } }) : contexto.doGet();
      guardarEstado();
      // Demora como la de Apps Script, para ver la UI optimista funcionando.
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(salida.texto);
      }, 600);
    });
    return;
  }
  let archivo = path.normalize(path.join(RAIZ, decodeURIComponent(url.pathname)));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (archivo.endsWith(path.sep)) archivo = path.join(archivo, 'index.html');
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(datos);
  });
}).listen(PUERTO, () => console.log(`App de prueba en http://localhost:${PUERTO}`));
