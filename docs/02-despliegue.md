# Despliegue en pc-servicios

IIS adelante, un solo proceso de Node bajo pm2 detrás. Mismo esquema que
`netjoin`, para que quien opera uno opere el otro sin aprender nada nuevo.

```
Cloudflare ──▶ IIS (443) ──┬── apps/web/dist         archivos estáticos
                           └── /api ──▶ 127.0.0.1:3001   pm2: todohierro-api
```

Raíz en producción: `C:\todohierro`.

## Lo que hay que tener instalado

En pc-servicios: Node 20 o superior, pm2 global, IIS con **URL Rewrite** y
**Application Request Routing** (con el proxy habilitado en la configuración del
servidor, que es un tilde aparte y se olvida).

## Las dos carpetas

| Máquina | Carpeta | Para qué |
|---|---|---|
| NINOFERHP | `C:\Fuentes\IA\webTodoHierro` | Desarrollo. Desde acá se empuja a GitHub. |
| pc-servicios | `C:\todohierro` | Clon del repositorio. Acá se hace `git pull`, se compila y corre pm2. |

Son dos clones del mismo repositorio. **No se copian archivos entre ellas**: lo
que viaja es el commit.

En `C:\todohierro` conviven cosas que no están en el repositorio y que `git pull`
no pisa, porque están en el `.gitignore`: el `.env`, el `usuarios.json` y `logs/`.

Como se compila en el servidor, pc-servicios necesita las dependencias de
desarrollo (TypeScript, la CLI de Nest, Vite). Por eso `npm ci` completo y no
`--omit=dev`.

## Primera instalación

**▶ EN PC-SERVICIOS**

1. `git clone https://github.com/ninofer/webTodoHierro.git C:\todohierro`
2. Copiar `apps\api\.env.ejemplo` a `C:\todohierro\.env` y completarlo. La
   contraseña de `web_ro` y el `JWT_SECRETO` se escriben ahí, a mano.
3. `.\scripts\publicar.ps1 -Mensaje "primera instalación"`
4. Crear el primer usuario: `node deploy\crear-usuario.js`
5. Apuntar el sitio de IIS a `C:\todohierro\apps\web\dist` y confirmar que quedó
   el `web.config` ahí.
6. `pm2 save` — sin esto, el próximo reinicio no levanta el API.
7. Crear la tarea programada de arranque (abajo).

## La tarea programada de arranque

**No se usa `pm2-windows-startup`.** Escribe en la clave `Run` del registro, que
necesita que alguien inicie sesión. En un servidor que nadie usa como escritorio
eso equivale a no tener arranque automático: IIS vuelve solo tras un reinicio
porque es un servicio de Windows, y el API no.

En el Programador de tareas:

| Campo | Valor |
|---|---|
| Desencadenador | Al iniciar el equipo, con **1 minuto de retraso** |
| Acción | `C:\todohierro\deploy\arrancar-pm2.cmd` |
| Ejecutar como | La misma cuenta bajo la que se hizo `pm2 save` |
| Opciones | Ejecutar tanto si el usuario inició sesión como si no |

El minuto de retraso es para que SQL Server y la red estén arriba. El script deja
constancia en `logs\arranque.log`: si después de un reinicio el sitio no vuelve,
ese archivo dice si el problema fue el arranque o el proceso.

## Publicaciones siguientes

Se empuja desde NINOFERHP y se publica desde pc-servicios.

**▶ EN NINOFERHP**

```powershell
git push
```

**▶ EN PC-SERVICIOS**

```powershell
cd C:\todohierro
.\scripts\publicar.ps1 -Mensaje "qué se está publicando"
```

**Publicar implica unos minutos de caída.** El script detiene el API antes de
instalar dependencias, porque `npm ci` borra `node_modules` entero y Windows no
deja borrar un módulo nativo que un proceso tiene cargado — `argon2`, en este
caso. El 19/09/2026 una publicación falló con `EPERM: operation not permitted,
unlink argon2.glibc.node` justamente por eso.

El script hace `git pull --ff-only`, detiene el API, `npm ci`, corre las pruebas y
**aborta si alguna falla**. Recién entonces compila en el orden `shared → api → web`, repone
el `web.config` en `apps\web\dist` —que `git pull` no trae, porque `dist` está
ignorado— y reinicia el API con `--update-env`.

Antes de todo eso comprueba que está parado en el repositorio correcto y que
existe el `.env`. Un script correcto corrido en la carpeta equivocada es un error
que no avisa.

Cada publicación queda anotada en `logs\publicaciones.log` con fecha, commit y
mensaje.

Dos detalles del script que existen por errores concretos: cada comando externo
se corre a través de `Ejecutar`, que comprueba el código de salida —
`$ErrorActionPreference = 'Stop'` no aplica a comandos externos, y una vez el
script siguió compilando con `node_modules` a medio instalar—; y jest se invoca
por su ruta y no con `npx`, porque si `npx` no lo encuentra se pone a descargarlo
y pregunta por teclado, colgando el despliegue para siempre.

## Lo que se olvida y cuesta caro

**`pm2 save` después de cambiar la lista de procesos.** Si se agrega o saca un
proceso y no se guarda, el próximo reinicio restaura la lista vieja. No avisa.

**`--update-env` al reiniciar tras tocar el `.env`.** Sin esa bandera, pm2 le pasa
las variables viejas al proceso nuevo. Ya está puesto en `publicar.ps1`, pero si
se reinicia a mano hay que acordarse.

**El API escucha en `127.0.0.1`.** Si alguna vez aparece un `API_HOST=0.0.0.0` en
el `.env` de producción, cualquiera en la red puede hablarle directo a Node y
saltear IIS, el HTTPS y todo lo que Cloudflare hace adelante.

## Verificación después de publicar

```powershell
pm2 status todohierro-api
Get-Content C:\todohierro\logs\api-out.log -Tail 20
```

En el log tiene que aparecer `Catálogo recargado: N filas en M ms` y
`API escuchando en http://127.0.0.1:3001/api`.

Desde afuera, `https://<dominio>/api/salud` devuelve el estado de la caché sin
pedir sesión y sin exponer ningún dato del cliente.

## Si el sitio no vuelve después de un reinicio

En orden, porque el primero es el que más veces es:

1. `C:\todohierro\logs\arranque.log` — ¿corrió la tarea programada?
2. `pm2 list` — ¿está el proceso?
3. `logs\api-error.log` — ¿arrancó y se cayó? Un `.env` incompleto frena el
   proceso a propósito, con un mensaje que dice qué falta.
4. ¿Está arriba la VPN? Sin ella la caché no carga y `/api/salud` responde con
   `ok: false` y el error de la última recarga.
