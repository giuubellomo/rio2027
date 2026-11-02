# Río 2027

App del viaje del grupo: itinerario, reservas, ideas y gastos. Funciona sin señal y se instala en el celular.

## Cómo está armada

| Carpeta | Qué hay |
| --- | --- |
| `app/` | La app que se publica en GitHub Pages: HTML, CSS y JavaScript, sin compilar |
| `backend/Code.gs` | El código que va en Apps Script, pegado a la planilla de Google Sheets |
| `dev/servidor.js` | Servidor de prueba que corre el `Code.gs` real en la compu, sin Google |

Los datos viven en la planilla. Cada celular guarda una copia en IndexedDB, así la app anda sin señal.
Los cambios hechos sin señal se suben cuando vuelve la conexión.

## Probar en la compu

```
node dev/servidor.js
```

Abrí http://localhost:8080 y entrá con el código que aparece en la terminal.
Para empezar de cero, borrá `dev/datos.json`.

## Configurar la planilla (una sola vez)

1. Creá una planilla nueva en Google Sheets, por ejemplo "Río 2027 · datos".
2. Abrí **Extensiones → Apps Script**. Borrá lo que haya y pegá todo `backend/Code.gs`. Guardá.
3. Elegí la función `setup` arriba y tocá **Ejecutar**. Aceptá los permisos.
   En el **Registro de ejecución** aparece el código del viaje (`RIO-XXXX`).
4. **Implementar → Nueva implementación →** tipo **App web**.
   - Ejecutar como: **yo**
   - Quién tiene acceso: **cualquier usuario**
5. Copiá la **URL de la app web** y pegala en `app/js/config.js` (`URL_APPS_SCRIPT`).

Si después cambia `Code.gs`: **Implementar → Administrar implementaciones → editar → Versión nueva**.
Así la URL no cambia.

Funciones útiles en Apps Script: `verCodigo()` muestra el código y `rotarCodigo()` lo cambia.

⚠️ No edites datos a mano en la planilla: los celulares no se enteran de esos cambios.

## Publicar

Cada vez que se sube algo a `main`, GitHub publica `app/` sola (ver `.github/workflows/pages.yml`).
Antes de subir cambios de la app, aumentá `VERSION` en `app/sw.js`. Si no, los celulares siguen usando la versión guardada.
