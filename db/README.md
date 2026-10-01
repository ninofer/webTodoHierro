# Objetos que este proyecto crea en la base del cliente

La base `todoHierro` es producción viva: ahí se está facturando mientras la web
consulta. La regla del repositorio es **se la lee, nunca se le escribe**.

Estos scripts son la única excepción, y está acotada:

- `001` crea objetos de **lectura** (vistas) dentro del esquema `web`.
- `002` sólo da y quita **permisos** a `web_ro` para el módulo de presupuestos:
  `EXECUTE` sobre los SP `_web` del cliente y `SELECT` objeto por objeto, y
  columna por columna donde la tabla tiene costos. No crea objetos ni toca datos.
  La escritura del presupuesto la hacen esos SP por encadenamiento de propiedad;
  `web_ro` sigue con `DENY INSERT, UPDATE, DELETE` sobre `dbo`.
- `003` da `EXECUTE` sobre los dos SP de los reportes de ventas, que sólo leen.
  Ver `docs/14-reportes.md`.
- Ningún script modifica tablas, inserta ni actualiza datos.
- Los SP `_web` **no están acá**: los creó y los mantiene el cliente, como el
  resto de su sistema. Ver `docs/13-presupuestos.md`.
- Cada uno comprueba en qué base está parado antes de hacer nada.
- Van con BOM UTF-8 y CRLF, para que SSMS no rompa los acentos.

**Una migración aplicada no se edita.** Lo que corrige un script que ya corrió es
otro script con el número siguiente.

## Lo que no está acá

La creación del login `web_ro` y sus permisos, porque lleva una contraseña. Se
corre a mano una sola vez, y la contraseña la escribe el usuario en su consola.
Los permisos que tiene que tener están en `docs/01-arquitectura.md`, punto 3.

## Cómo se aplican

En SSMS, conectado a la base del cliente, en orden numérico. El script aborta si
está parado en otra base.
