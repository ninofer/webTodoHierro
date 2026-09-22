# Traspaso — leer esto primero

Este documento es para alguien que retoma el proyecto sin haber estado en las
conversaciones previas. Dice qué es, en qué estado está, qué falta y qué errores
ya pagamos.

Estado al 19/09/2026: **el API funciona en producción contra los datos reales del
cliente.** Falta publicarlo para que se vea desde internet.

Decisión del 22/09/2026: **pc-servicios se instala sobre Ubuntu**, no Windows.
Adelante va nginx (no IIS) y el arranque automático de pm2 se resuelve con
`pm2 startup systemd`, sin tarea programada. El resto — pm2, la VPN al
Mikrotik, el esquema `web`, la caché — no cambia.

---

## 1. Qué es

Un portal web para que los dueños de **Todo Hierro** (ferretería de hierro en
Encarnación, Paraguay) consulten precios y stock desde el celular.

Su sistema de gestión es de escritorio, hecho en VB.NET 2010 contra SQL Server
2008 R2. **No se modifica.** El portal lee la misma base, en solo lectura.

Dos capas del cliente están sin soporte: el motor de base de datos desde julio de
2019 y el sistema operativo (Windows Server 2012 R2) desde octubre de 2023.
Además la base corre en una **PC de escritorio**, no en un servidor. El portal no
crea ese riesgo, pero lo vuelve más visible, y todo el diseño asume que esas
máquinas no se pueden endurecer más de lo que están.

## 2. Orden de lectura

1. **`CLAUDE.md`** (raíz) — las reglas de trabajo. Una tarea por vez, verificación
   por mutación, qué no se toca de la base del cliente. Es corto y no es opcional.
2. **`docs/01-arquitectura.md`** — la topología, por qué cada decisión, y qué del
   sistema original **no** se porta y por qué.
3. **`docs/02-despliegue.md`** — cómo se publica, la tarea programada de arranque,
   y qué mirar cuando algo no vuelve.
4. **`docs/12-el-metodo.md`** — de dónde salió cada regla de trabajo. Portable a
   otros proyectos.
5. **`db/README.md`** — la única excepción a «no se escribe en la base del
   cliente», y hasta dónde llega.

## 3. Las tres máquinas

| Máquina | Qué es | Carpeta | Se toca |
|---|---|---|---|
| **NINOFERHP** | La máquina de desarrollo | `C:\Fuentes\IA\webTodoHierro` | Sí |
| **pc-servicios** | Servidor de aplicación (Ubuntu), en el cluster Proxmox de TREEKINGS | `~/todohierro` (por SSH, no hay escritorio) | Sí |
| **SRVTodoHierro** | La PC del cliente, con el SQL y el sistema VB | — | **No** |

`NINOFERHP` y `pc-servicios` son **dos clones del mismo repositorio**. No se
copian archivos entre ellas: lo que viaja es el commit.

Repositorio: `github.com/ninofer/webTodoHierro` (privado).

## 4. Cómo llega el API a la base

```
Celular ─▶ Cloudflare ─▶ nginx en pc-servicios ─▶ API Node (127.0.0.1:3001)
                                                        │
                                                 Mikrotik (servidor OpenVPN)
                                                        │
                                          SQL Server 2008 R2 — 192.168.88.4:1433
```

El servidor del cliente es **un cliente más** de la VPN de TREEKINGS: sale hacia
afuera y no abre ningún puerto. `pc-servicios` **no tiene cliente VPN instalado**:
la VPN termina en el Mikrotik y el servidor sólo tiene una ruta.

La regla del Mikrotik es la que sostiene el modelo de seguridad:

> TCP 1433, con estado, **origen 172.25.1.14** (pc-servicios) → **destino
> 192.168.88.4**. Y nada iniciado desde el lado del cliente hacia el cluster.

**Si pc-servicios se recrea como una VM Ubuntu nueva, esa IP cambia.** Hay que
actualizar el origen de esta regla en el Mikrotik con la IP de la VM nueva
*antes* de dar por terminada la migración — si no, el API arranca, pero
`SqlService` no puede conectar nunca y `/api/salud` queda en `ok: false` sin
que el motivo salte a la vista (el timeout de conexión tarda en avisar).

## 5. La frontera en la base

El API entra con el login `web_ro`, que tiene `GRANT SELECT, EXECUTE` sobre el
esquema `web` y `DENY SELECT` sobre `dbo`. No pertenece a ningún rol de servidor.

Todo lo que el API consulta pasa por vistas publicadas en `web`
(`db/001-esquema-web.sql`). Si hace falta una tabla nueva, **se publica una vista,
no se amplía el permiso**.

Lo que nunca cruza: `costo`, `costoAnterior`, `precio2`, `comisionCanje`. El costo
de compra es el dato más sensible de esa base. Hay una guarda que lo vigila.

## 6. Lo que funciona hoy, verificado

Medido en pc-servicios el 19/09/2026:

```json
{"ok":true,"filas":1434,"antiguedadSeg":77,"ultimaCargaMs":568,
 "base":{"conectada":true,"error":null}}
```

- El API corre bajo pm2 como `todohierro-api`, una instancia, modo fork.
- Carga el catálogo entero (1.434 artículos) cada dos minutos y resuelve las
  búsquedas en memoria: **1 ms** contra los 384–634 ms que costaba consultar la
  base en cada tecla.
- Autenticación con argon2 y sesión en cookie `HttpOnly`. Hay un usuario creado.
- 50 pruebas en verde, entre ellas siete guardas verificadas por mutación.

## 7. Lo que falta, en orden

**1. Arreglar `UsuariosService`.** Si falta el archivo del padrón, lanza en
`onModuleInit` y **tumba el arranque entero** — Nest aborta y `app.listen()` nunca
corre, así que el proceso figura `online` en pm2 pero no escucha. Ya nos costó una
hora el 19/09. Es el mismo error que ya se corrigió en `SqlService`: no debe
lanzar, debe registrar el problema, dejar el padrón vacío, rechazar los login con
un mensaje claro e informarlo en `/api/salud`. Hay que escribir la guarda y
romperla a propósito, como manda el método.

**2. Publicar por nginx, en Ubuntu.** Es lo único que separa al portal de estar
en línea. `pc-servicios` deja de ser Windows/IIS: la instalación pasa a
Ubuntu con nginx como reverse proxy (`deploy/nginx-todohierro.conf`) y
certificado propio con certbot/Let's Encrypt. Falta: levantar la VM, el
`server_name` con hostname propio (se pensó `todohierro.emiliomuller.com`), el
registro DNS apuntando a la IP nueva, correr `certbot --nginx`, y **actualizar
la regla del Mikrotik con la IP nueva de la VM** (ver punto 4 de la sección
anterior). El dominio `emiliomuller.com` está en Hostinger. Pasos completos en
`docs/02-despliegue.md`.

**3. El arranque automático.** En Ubuntu esto ya no necesita una tarea
programada a mano ni un script propio: `pm2 startup systemd` genera un
servicio de systemd que corre `pm2 resurrect` al reiniciar, y `pm2 save`
guarda la lista de procesos. Documentado en `docs/02-despliegue.md`.

**4. Los tres reportes.** Facturación Total, Resumen de Servicios y Ranking de
Ventas, con descarga en PDF. El ranking ya sale de `sp_consultaRankingVentas`; los
otros dos tienen el SQL embebido dentro de archivos `.rpt` de Crystal Reports y
hay que extraerlo abriéndolos en el diseñador (**Base de datos → Mostrar consulta
SQL**). El dueño iba a pasar un PDF de muestra con el diseño esperado. Acá entra
`react-table`, que se dejó fuera a propósito hasta tener una tabla de verdad.

**5. La guarda `clases-css-existen`.** Falta porque con Tailwind hay que verificar
contra la salida compilada del framework, y eso ata la prueba a un build previo.

**6. El dominio del cliente.** Todo Hierro tiene su dominio en Hostinger. El plan
acordado es **no mover sus nameservers**: se usa un custom hostname de Cloudflare
for SaaS (100 incluidos en el plan Free), el cliente agrega un CNAME y su correo y
su sitio actual quedan intactos. Está explicado en el documento de arquitectura
que se armó con el dueño.

## 8. Los errores que ya pagamos

Cada uno costó tiempo real. Están acá para no repetirlos.

**Nota (22/09/2026), con pc-servicios pasando a Ubuntu:** de la lista de abajo,
el `EPERM` de `argon2`, el `$ErrorActionPreference` y los *junctions* de npm
eran específicos de Windows y no aplican en pc-servicios una vez migrado
(`scripts/publicar.sh` es la versión Ubuntu de `publicar.ps1`, con el mismo
cuidado de comprobar el código de salida de cada paso externo). Lo demás —el
proceso `online` que no escucha, `npx` descargando de más, el alias al fuente
de `shared`, la compatibilidad con SQL Server 2008 R2, el TLS 1.0— es del
proyecto, no del sistema operativo, y sigue igual.

**El proceso `online` que no escucha.** Si cualquier `onModuleInit` lanza, Nest
aborta el arranque, pero los `setInterval` ya registrados mantienen vivo al
proceso. pm2 lo muestra `online` y el puerto no responde. Pasó dos veces: con el
SQL inalcanzable y con el padrón de usuarios ausente. Ante ese síntoma, mirar
`logs/api-error-*.log` antes que cualquier otra cosa.

**`npm ci` con el API corriendo.** Borra `node_modules` entero y Windows no deja
borrar un módulo nativo cargado en memoria (`argon2`). Falla con `EPERM`. Por eso
`publicar.ps1` detiene el proceso antes de instalar.

**`$ErrorActionPreference = 'Stop'` no cubre comandos externos.** Una publicación
siguió compilando y reiniciando con `node_modules` a medio instalar. Todo comando
externo va por la función `Ejecutar`, que comprueba `$LASTEXITCODE`.

**`npx` descargando paquetes en medio de un despliegue.** Al no encontrar jest
local, `npx` se puso a bajar jest 30 y preguntó por teclado. Un script de
despliegue que espera una respuesta se cuelga para siempre. Jest se invoca por su
ruta.

**El script que se actualiza a sí mismo.** `publicar.ps1` hace `git pull` como
primer paso, pero PowerShell ya cargó el archivo en memoria: si el pull trae una
versión nueva del propio script, esa corrida sigue usando la vieja. Hay que
volver a ejecutarlo. **Queda pendiente** que el script lo detecte y lo avise.

**Renombrar la carpeta del proyecto rompe los workspaces.** En Windows npm enlaza
los workspaces con *junctions*, que son rutas absolutas. Tras un renombre hay que
correr `npm install` para rehacerlos. Las pruebas no lo notan, porque jest resuelve
por su propio `moduleNameMapper`.

**`export *` de un paquete CommonJS no lo ve Rollup.** Vite convierte CJS a ESM
sólo bajo `node_modules`, y un workspace enlazado resuelve a su ruta real, fuera de
ahí. El error dice «X is not exported by shared/dist/index.js» aunque X esté
exportado. Por eso la web usa un **alias al código fuente** de `shared`, no a su
`dist`.

**`OFFSET ... FETCH` no existe en SQL Server 2008 R2.** Ni `STRING_AGG`, ni
`TRY_CONVERT`, ni `IIF`, ni `THROW`, ni `DROP ... IF EXISTS`. La guarda
`sql-compatibilidad` lo vigila. La paginación va con `ROW_NUMBER()`.

**SQL Server 2008 R2 cifra el login con TLS 1.0 siempre**, aun con
`encrypt: false`. Node 20+ lo rechaza y el error no menciona TLS por ningún lado.
De ahí el `NODE_OPTIONS=--tls-min-v1.0` en `ecosystem.config.js`.

**El nombre mal escrito que nunca falló.** El formulario de consulta del sistema
VB llama a `sp_stockSucursales`, pero en la base el procedimiento se llama
`sp_stcokSucursales`. El `exec` falla, el `Try/Catch` se lo traga, y el panel queda
vacío. **Nunca funcionó en años**, y nadie se enteró porque la única prueba posible
era alguien mirando la pantalla. Está sin corregir: es del sistema del cliente, no
de este proyecto.

**`pm2` agrega el número de instancia al nombre del log.** Los archivos son
`api-out-1.log` y `api-error-1.log`, no `api-out.log`. Se puede unificar con
`merge_logs: true`. **Pendiente.**

**Una prueba en verde no es una prueba.** La primera versión de la guarda
`arranque-sin-base` seguía pasando con el error puesto, porque un `onModuleInit`
declarado `async` devuelve una promesa rechazada en vez de lanzar, y
`not.toThrow()` no lo ve. Lo encontró la verificación por mutación. Si no se rompe
cada guarda a propósito, no se sabe si sirve.

## 9. Accesos que hacen falta

- El repositorio `ninofer/webTodoHierro`.
- **pc-servicios**: acceso SSH, para publicar, pm2 y nginx.
- **El Mikrotik**, para la regla que deja pasar a pc-servicios hacia el SQL del
  cliente (y para actualizarla si la VM cambia de IP).
- **La VPN de TREEKINGS**, para alcanzar el SQL del cliente.
- **Radmin**, si hay que entrar al servidor del cliente. Es el acceso que usa el
  dueño hoy.
- La contraseña del login `web_ro`. No está en el repositorio ni debe estarlo. El
  `.env` de producción ya está en `pc-servicios` y no se versiona.
- Acceso a Hostinger, para el DNS de `emiliomuller.com`.

## 10. Una cosa sobre el método

El documento `docs/12-el-metodo.md` no es relleno. Las reglas de trabajo de este
repositorio —una tarea por vez, decir en qué máquina se corre cada comando,
explicar antes de tocar producción, y romper cada guarda a propósito— salieron de
errores concretos, y en estos días evitaron varios más.

La que más rinde: **una guarda que nunca se disparó no es una guarda.**
