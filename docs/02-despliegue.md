# Despliegue en pc-servicios (Ubuntu)

nginx adelante, un solo proceso de Node bajo pm2 detrás. Reemplaza a la
instalación original pensada sobre Windows Server + IIS: la aplicación no
cambió, sólo lo que hay alrededor.

```
Cloudflare (WAF) ──▶ nginx (443, TLS con certbot) ──┬── apps/web/dist   archivos estáticos
                                                     └── /api ──▶ 127.0.0.1:3001   pm2: todohierro-api
```

Raíz en producción: `~/todohierro` (la carpeta del usuario con el que se hace
`ssh` a pc-servicios — no hay una cuenta de servicio aparte).

## Lo que hay que tener instalado

En pc-servicios (Ubuntu 22.04 o superior):

- **Node 20 o superior** y npm. Si el repositorio de paquetes de Ubuntu trae
  una versión vieja, instalar desde [NodeSource](https://github.com/nodesource/distributions)
  o con `nvm`.
- **pm2 global**: `npm install -g pm2`.
- **nginx**: `sudo apt install nginx`.
- **certbot**, con el plugin de nginx: `sudo apt install certbot python3-certbot-nginx`.
- **git**.

## Las dos carpetas

| Máquina | Carpeta | Para qué |
|---|---|---|
| NINOFERHP (Windows) | `C:\Fuentes\IA\webTodoHierro` | Desarrollo. Desde acá se empuja a GitHub. |
| pc-servicios (Ubuntu) | `~/todohierro` | Clon del repositorio. Acá se hace `git pull`, se compila y corre pm2. |

Son dos clones del mismo repositorio, en dos sistemas operativos distintos.
**No se copian archivos entre ellas**: lo que viaja es el commit.

En `~/todohierro` conviven cosas que no están en el repositorio y que
`git pull` no pisa, porque están en el `.gitignore`: el `.env`, el
`usuarios.json` y `logs/`.

Como se compila en el servidor, pc-servicios necesita las dependencias de
desarrollo (TypeScript, la CLI de Nest, Vite). Por eso `npm ci` completo y no
`--omit=dev`.

## Primera instalación

**▶ EN PC-SERVICIOS**

1. `git clone https://github.com/ninofer/webTodoHierro.git ~/todohierro && cd ~/todohierro`
2. Copiar `apps/api/.env.ejemplo` a `.env` y completarlo. La contraseña de
   `web_ro`, el `JWT_SECRETO` y `USUARIOS_ARCHIVO` (algo como
   `/home/tu-usuario/todohierro/usuarios.json`) se escriben ahí, a mano.
3. `npm ci`
4. `apps/api` corre sus pruebas: `cd apps/api && npx jest && cd ../..`
5. Compilar en orden: `npm run build:shared && npm run build:api && npm run build:web`
6. Crear la carpeta de logs: `mkdir -p logs`
7. Crear el primer usuario: `node deploy/crear-usuario.js`
8. Arrancar con pm2: `pm2 start ecosystem.config.js`
9. `pm2 save` — sin esto, el próximo reinicio no levanta el API.
10. `pm2 startup systemd` — imprime un comando `sudo env PATH=...` de una
    línea. Copiarlo y correrlo tal cual: instala el servicio de systemd que
    llama a `pm2 resurrect` en cada arranque. Es la única vez que hace falta.
11. Configurar nginx y el certificado (abajo).

## nginx y el certificado

El sitio está en `deploy/nginx-todohierro.conf`. Antes de instalarlo, editar
ahí mismo `server_name` (el dominio real) y `root` (la ruta absoluta a
`~/todohierro/apps/web/dist` — nginx no expande `~`, hay que escribirla
completa, por ejemplo `/home/tu-usuario/todohierro/apps/web/dist`).

```bash
sudo cp deploy/nginx-todohierro.conf /etc/nginx/sites-available/todohierro
sudo ln -s /etc/nginx/sites-available/todohierro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Con el DNS ya apuntando al servidor, pedir el certificado:

```bash
sudo certbot --nginx -d TU-DOMINIO
```

certbot reescribe `/etc/nginx/sites-available/todohierro` agregando el bloque
443 y el redirect desde el 80. Queda con renovación automática (systemd timer
de certbot); conviene probarla una vez con `sudo certbot renew --dry-run`.

**Si Cloudflare sigue proxeando el tráfico** (nube naranja), poner el modo SSL
en **Full (strict)** — ahora el origen presenta un certificado válido — y
descomentar el bloque `real_ip` de `deploy/nginx-todohierro.conf` con los
rangos de Cloudflare. Sin eso, nginx ve la IP de Cloudflare como origen de
*todas* las visitas, y el freno de login (`freno-login.service.ts`) bloquea a
todo el mundo por el intento fallido de una sola persona — el mismo tipo de
bug que ya se evitó una vez con `trust proxy: 'loopback'` en `main.ts`, pero
un escalón más atrás.

## El arranque automático

**No hace falta tarea programada ni script propio.** Eso era la solución para
Windows, donde `pm2-windows-startup` no sirve porque escribe en la clave `Run`
del registro y necesita que alguien inicie sesión.

En Ubuntu, `pm2 startup systemd` (paso 10 de la instalación) genera un
servicio real de systemd. Al reiniciar el servidor, systemd lo levanta solo y
corre `pm2 resurrect`, que restaura la lista que dejó `pm2 save`. Se puede
inspeccionar como cualquier otro servicio:

```bash
systemctl status pm2-$(whoami)
journalctl -u pm2-$(whoami) --since "10 min ago"
```

## Publicaciones siguientes

Se empuja desde NINOFERHP y se publica desde pc-servicios.

**▶ EN NINOFERHP**

```powershell
git push
```

**▶ EN PC-SERVICIOS**

```bash
cd ~/todohierro
./scripts/publicar.sh "qué se está publicando"
```

(La primera vez: `chmod +x scripts/publicar.sh`, o correrlo como
`bash scripts/publicar.sh "..."`.)

**Publicar implica unos segundos de caída.** El script detiene el API antes de
instalar dependencias, corre las pruebas y **aborta si alguna falla**. Recién
entonces compila en el orden `shared → api → web` y reinicia el API con
`--update-env`. A diferencia de la versión anterior sobre Windows, acá no hace
falta reponer ningún archivo de configuración después de compilar: con nginx,
la configuración del sitio vive en `/etc/nginx`, no adentro de la carpeta que
se sirve.

Antes de todo eso comprueba que está parado en el repositorio correcto y que
existe el `.env`. Un script correcto corrido en la carpeta equivocada es un
error que no avisa.

Cada publicación queda anotada en `logs/publicaciones.log` con fecha, commit y
mensaje. El detalle de qué hace cada paso del script, y por qué, está en los
comentarios de `scripts/publicar.sh`.

## Lo que se olvida y cuesta caro

**`pm2 save` después de cambiar la lista de procesos.** Si se agrega o saca un
proceso y no se guarda, el próximo reinicio restaura la lista vieja. No avisa.

**`--update-env` al reiniciar tras tocar el `.env`.** Sin esa bandera, pm2 le
pasa las variables viejas al proceso nuevo. Ya está puesto en
`scripts/publicar.sh`, pero si se reinicia a mano hay que acordarse.

**El API escucha en `127.0.0.1`.** Si alguna vez aparece un `API_HOST=0.0.0.0`
en el `.env` de producción, cualquiera en la red puede hablarle directo a Node
y saltear nginx, el HTTPS y todo lo que Cloudflare hace adelante.

**La renovación del certificado.** certbot la deja automática, pero conviene
confirmarla una vez con `sudo certbot renew --dry-run` y no darla por sentada
sin más.

## Verificación después de publicar

```bash
pm2 status todohierro-api
tail -n 20 logs/api-out.log
```

En el log tiene que aparecer `Catálogo recargado: N filas en M ms` y
`API escuchando en http://127.0.0.1:3001/api`.

Desde afuera, `https://<dominio>/api/salud` devuelve el estado de la caché sin
pedir sesión y sin exponer ningún dato del cliente.

## Si el sitio no vuelve después de un reinicio

En orden, porque el primero es el que más veces es:

1. `systemctl status pm2-$(whoami)` — ¿corrió el servicio de arranque?
2. `pm2 list` — ¿está el proceso?
3. `logs/api-error.log` — ¿arrancó y se cayó? Un `.env` incompleto frena el
   proceso a propósito, con un mensaje que dice qué falta.
4. ¿Está arriba la VPN, y la regla del Mikrotik apunta a la IP correcta de
   esta máquina? Sin eso la caché no carga y `/api/salud` responde con
   `ok: false` y el error de la última recarga.
5. `sudo systemctl status nginx` y `sudo nginx -t` — ¿nginx está arriba y su
   configuración es válida?
