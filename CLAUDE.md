# Cómo se trabaja en este repositorio

Esto lo lee cualquier asistente de IA que abra el proyecto, en cualquier sesión.
Es la versión corta y operativa de [`docs/12-el-metodo.md`](docs/12-el-metodo.md),
que explica de dónde salió cada regla.

---

## Cómo se entrega el trabajo

- **Una tarea por vez**, numerada («Tarea 2 de 4»), con **un solo bloque de
  comandos**, y se espera el resultado antes de la siguiente.
- **Cada bloque dice dónde se corre**: `▶ EN NINOFERHP`, `▶ EN PC-SERVICIOS`,
  `▶ EN SSMS`, `▶ EN TU NAVEGADOR`.
- **Explicar antes de hacer** cuando el trabajo toca datos, dinero o producción.
  La explicación es donde aparecen los desacuerdos, y ahí salen baratos.
- **Contestar lo que se preguntó**, sin abrir tres temas nuevos.
- **Nada está hecho hasta verlo verde.** Se dice el número de pruebas que pasan.
- Los archivos se escriben **directo en la carpeta del proyecto**, no se mandan
  como zip al chat.

## Cómo se prueba

> **Una guarda que nunca se disparó no es una guarda.**

- Toda prueba nueva que vigile una regla se **verifica por mutación**: se
  introduce a propósito el error que dice evitar, se comprueba que falla, y se
  restaura. Si pasa en verde, la prueba está mal.
- **Comprobar que el código existe no comprueba que se ejecuta.** Acotar el trozo
  que se inspecciona: el cuerpo de una función, no el archivo entero.
- **Comprobar también lo que NO tiene que estar**, con un comentario que diga por
  qué.
- **No contar contra un número escrito a mano**: contar contra la otra cosa
  («tantos filtros como consultas»), así la regla crece sola.
- La suite se corre desde `apps/api` con `npx jest`, nunca desde la raíz.

## Cómo se escribe el código

- **Una regla que deciden dos lados vive en `packages/shared`.** Cálculos,
  validaciones, formatos. Dos copias se separan en el primer arreglo.
- **La pantalla avisa, el servidor impide, la base garantiza.** Nunca dejar una
  regla sólo en la interfaz.
- **El mensaje de error dice qué hacer**, no sólo qué pasó, y nombra los valores.
- Los comentarios cuentan **por qué** y, cuando corresponde, **qué error lo
  originó**. No describen la línea de abajo.
- Nada de SQL armado por concatenación. Todo parámetro entra por `request.input()`.

## Base de datos

> La base del cliente es producción viva: ahí se está facturando mientras la web
> consulta.

- **A `todoHierro` no se le escribe directo.** Ni un INSERT, UPDATE ni DELETE
  desde el API ni desde un script del repositorio.
- **La única escritura es el módulo de presupuestos**, y sólo ejecutando los SP
  del cliente (`dbo.sp_..._web`, los crea y mantiene el cliente), siempre con el
  idConfig 999 y el `idUsuario` de la sesión. Ver
  [`docs/13-presupuestos.md`](docs/13-presupuestos.md).
- **Lo que este proyecto crea en producción** vive versionado en `db/` y se aplica
  con revisión: las vistas del esquema `web` (`001`) y los permisos de `web_ro`
  (`002` presupuestos, `003` reportes). Ningún otro script crea, altera ni
  escribe nada en esa base.
- **Los reportes** (`docs/14-reportes.md`) sólo leen, y sólo los ve quien tiene
  `"reportes": true` en el padrón: los protege `ReportesGuard` en el API.
- El API entra **sólo** con el login `web_ro`. Tiene `GRANT SELECT, EXECUTE` sobre
  `web`, `DENY INSERT, UPDATE, DELETE, ALTER` sobre `dbo`, y permisos **objeto por
  objeto** (y columna por columna) sobre lo que el presupuesto usa de `dbo`. La
  lista de `db/002` y la del código son la misma: la guarda `sp-autorizados` las
  compara. Un objeto nuevo se agrega en los dos lados; nunca se da un permiso de
  esquema ni se agrega `web_ro` a un rol.
- **El motor es SQL Server 2008 R2.** No existe `OFFSET ... FETCH` (la paginación
  va con `ROW_NUMBER()`), ni `STRING_AGG`, ni `TRY_CONVERT`, ni `IIF`. La guarda
  `sql-compatibilidad` lo vigila.
- Antes de escribir una consulta, **mirar el esquema**. No inventar columnas.
- Los precios los calcula la función `dbo.funPrecioMercaderia` del cliente. **No
  se replica esa fórmula**: se consulta la vista que la usa, para que la web
  muestre siempre el mismo precio que el sistema de escritorio.

## Lo que no se hace

- No correr `npm audit fix --force`.
- No commitear `.env`, certificados, `usuarios.json`, `presupuestoEjemplo.pdf` ni
  claves. Las contraseñas no viajan por el chat: las escribe el usuario en su consola.
- No probar sobre producción cuando hay alternativa.
- No exponer nunca `costo`, `costoAnterior` ni `precio2` de la base del cliente.
  Es el dato más sensible que tiene y ninguna pantalla lo necesita.

---

## Este proyecto en concreto

- Monorepo npm: `apps/api` (NestJS + `mssql`, sin ORM), `apps/web` (React + Vite
  + Tailwind), `packages/shared` (TypeScript puro, sin dependencias).
- **Orden de compilación, no negociable**: `shared` → `api` → `web`.
- Base del cliente: `todoHierro`, SQL Server 2008 R2 sobre Windows Server 2012 R2
  en Encarnación, alcanzada por OpenVPN terminada en el Mikrotik.
- Producción: pc-servicios corre Ubuntu. pm2 (`todohierro-api`, **una sola
  instancia** — el worker de caché corre dentro del proceso, y el candado que
  numera los presupuestos también) detrás de nginx.
  Tras tocar `.env`: `pm2 restart todohierro-api --update-env`.
- **El API escucha en `127.0.0.1`.** nginx es el único camino hacia él.
- `NODE_OPTIONS=--tls-min-v1.0`, porque SQL Server 2008 R2 cifra el login con
  TLS 1.0 y Node 20+ lo rechaza. Baja el mínimo de TLS de todo el proceso: si
  mañana el API llama servicios externos, tenerlo presente.
- Si se agrega o saca un proceso de pm2, hay que volver a hacer `pm2 save`. Si no,
  el próximo reinicio restaura la lista vieja — y no avisa.
- El idioma del código, los comentarios, los mensajes y la documentación es
  **castellano**.

Arquitectura y decisiones: [`docs/01-arquitectura.md`](docs/01-arquitectura.md).
El método y de dónde salió cada regla: [`docs/12-el-metodo.md`](docs/12-el-metodo.md).
