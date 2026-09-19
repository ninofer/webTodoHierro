# Objetos que este proyecto crea en la base del cliente

La base `todoHierro` es producción viva: ahí se está facturando mientras la web
consulta. La regla del repositorio es **se la lee, nunca se le escribe**.

Estos scripts son la única excepción, y está acotada:

- Sólo crean objetos de **lectura** (vistas y, si hiciera falta, procedimientos
  que sólo consultan) dentro del esquema `web`.
- No tocan `dbo`, no modifican tablas, no insertan ni actualizan datos.
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
