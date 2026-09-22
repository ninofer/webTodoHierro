# Despliegue en pc-servicios (Ubuntu, pm2 + nginx)

nginx adelante, un solo proceso de Node bajo pm2 detrás.

```
Celular ─▶ Cloudflare ─▶ nginx (80/443, TLS con certbot) ──┬── apps/web/dist   archivos estáticos
                                                            └── /api/ ──▶ 127.0.0.1:3001   pm2: todohierro-api
                                                                               │
                                                                        Mikrotik (OpenVPN)
                                                                               │
                                                                SQL Server 2008 R2 — 192.168.88.4:1433
```

| Dato | Valor |
|---|---|
| Usuario del servidor | `sistema` (no hay cuenta de servicio aparte) |
| Raíz del proyecto | `/home/sistema/webTodoHierro` (el clon del repositorio **es** la carpeta de ejecución) |
| Proceso de pm2 | `todohierro-api`, **una sola instancia**, modo fork |
| Puerto del API | `127.0.0.1:3001` — nunca `0.0.0.0` |
| Sitio de nginx | `/etc/nginx/sites-available/todohierro` |

En la raíz conviven cosas que no están en el repositorio y que `git pull` no
pisa, porque están en el `.gitignore`: el `.env`, el `usuarios.json` y `logs/`.

Como se compila en el servidor, hacen falta las dependencias de desarrollo
(TypeScript, la CLI de Nest, Vite). Por eso `npm ci` completo y no
`--omit=dev`.

---

## Primera instalación

Son nueve tareas. Se corre una, se mira el resultado, y recién ahí la
siguiente. Todas van **▶ EN PC-SERVICIOS**, por SSH, como el usuario
`sistema`, salvo donde se indica otra cosa.

### Tarea 1 de 9 — Programas base

**▶ EN PC-SERVICIOS**

```bash
sudo apt update && sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v && npm -v && pm2 -v && nginx -v
```

Lo que tiene que dar: Node **20.x o superior**. El Node que trae el repositorio
de Ubuntu suele ser más viejo y el proyecto exige `>=20` (`package.json`).

`build-essential` está por `argon2`: normalmente baja un binario ya
compilado, pero si para esa combinación de Node y sistema no hay, lo compila
en el momento y sin compilador `npm ci` falla.

### Tarea 2 de 9 — ¿Llega a la base del cliente?

Antes de instalar nada del proyecto, comprobar el camino de red. Si esto no
anda, todo lo demás arranca pero no trae datos, y el motivo no salta a la vista.

**▶ EN PC-SERVICIOS**

```bash
ip -4 addr show | grep inet
timeout 5 bash -c '</dev/tcp/192.168.88.4/1433' && echo "1433 ABIERTO" || echo "1433 CERRADO"
```

- La IP de este servidor tiene que ser la que figura como **origen** en la regla
  del Mikrotik (`172.25.1.14` según `docs/00-traspaso.md`). Si la VM es nueva y
  la IP cambió, **hay que actualizar la regla en el Mikrotik** antes de seguir.
- `1433 ABIERTO` es la condición para continuar. `CERRADO` quiere decir regla
  del Mikrotik, ruta, o VPN caída — no un problema del proyecto.

> Si el servidor **no** está en el cluster de TREEKINGS (una VPS en un
> proveedor externo), no tiene ruta hacia el Mikrotik: necesitaría un cliente
> OpenVPN propio y una regla nueva. Eso es un cambio de arquitectura y se decide
> antes, no durante la instalación.

### Tarea 3 de 9 — El `.env`

El `.env` va en la **raíz** del proyecto (no en `apps/api`). pm2 arranca el
proceso con `cwd` en la raíz y el API lo busca ahí.

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
cp apps/api/.env.ejemplo .env
chmod 600 .env
openssl rand -base64 48      # esto es el JWT_SECRETO: copiarlo
nano .env
```

Valores de producción:

| Variable | Valor |
|---|---|
| `API_HOST` | `127.0.0.1` — **nunca** `0.0.0.0` |
| `API_PUERTO` | `3001` (si se cambia, cambiar también `proxy_pass` en nginx) |
| `SQL_HOST` | `192.168.88.4` |
| `SQL_USUARIO` | `web_ro` |
| `SQL_CLAVE` | la escribís vos, a mano. No viaja por el chat. |
| `JWT_SECRETO` | lo que dio `openssl rand` (mínimo 32 caracteres) |
| `USUARIOS_ARCHIVO` | `/home/sistema/webTodoHierro/usuarios.json` |

`chmod 600` porque el `.env` tiene la clave de la base del cliente: que lo lea
sólo `sistema`.

### Tarea 4 de 9 — Dependencias, pruebas y compilación

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
npm ci
(cd apps/api && npx jest)
npm run build:shared && npm run build:api && npm run build:web
mkdir -p logs
ls apps/api/dist/main.js apps/web/dist/index.html
```

- Las pruebas tienen que pasar **todas**. Anotar el número. Si alguna falla, no
  se sigue.
- El orden `shared → api → web` no es negociable: el API consume el `dist` de
  `shared`.
- `logs/` tiene que existir antes de arrancar pm2. Si no, el proceso queda vivo
  pero sin poder escribir su log: vivo y mudo.
- El último `ls` tiene que mostrar los dos archivos.

### Tarea 5 de 9 — El primer usuario del portal

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
node deploy/crear-usuario.js
chmod 600 usuarios.json
```

Pide usuario, contraseña (mínimo 10 caracteres) y nombre real. La contraseña
se escribe en la consola del servidor, no en ningún otro lado.

### Tarea 6 de 9 — pm2 y el arranque automático

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

`pm2 startup systemd` **no instala nada por sí solo**: imprime un comando de
una línea que empieza con `sudo env PATH=...`. Copiarlo y correrlo tal cual.
Eso crea el servicio `pm2-sistema` de systemd, que corre `pm2 resurrect` en
cada arranque y restaura la lista que dejó `pm2 save`.

Comprobar:

```bash
pm2 status todohierro-api
tail -n 20 logs/api-out.log
curl -s http://127.0.0.1:3001/api/salud; echo
systemctl status pm2-sistema --no-pager
```

En el log tiene que aparecer `API escuchando en http://127.0.0.1:3001/api` y,
si la base responde, `Catálogo recargado: N filas en M ms`. `/api/salud` tiene
que devolver `ok: true`. Si da `ok: false`, el error de la última recarga viene
en la misma respuesta: volver a la tarea 2.

### Tarea 7 de 9 — nginx

`deploy/nginx-todohierro.conf` ya tiene `root` apuntando a
`/home/sistema/webTodoHierro/apps/web/dist`. Lo único que hay que cambiar es
`server_name` por el dominio real.

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
sudo cp deploy/nginx-todohierro.conf /etc/nginx/sites-available/todohierro
sudo nano /etc/nginx/sites-available/todohierro        # server_name TU-DOMINIO
sudo ln -s /etc/nginx/sites-available/todohierro /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo chmod o+x /home/sistema
sudo -u www-data test -r /home/sistema/webTodoHierro/apps/web/dist/index.html && echo "nginx PUEDE leer" || echo "nginx NO puede leer"
sudo nginx -t && sudo systemctl reload nginx
curl -s -H "Host: TU-DOMINIO" http://127.0.0.1/api/salud; echo
```

Por qué cada cosa rara:

- **`rm .../default`**: el sitio que trae nginx instalado también escucha en el
  80 como `default_server`. Si queda, las visitas que no coinciden exactamente
  con `server_name` ven la página de bienvenida de nginx.
- **`chmod o+x /home/sistema`**: desde Ubuntu 21.04 las carpetas personales se
  crean con permisos `750`. nginx corre como `www-data` y no puede *atravesar*
  `/home/sistema` para llegar a `dist`: responde **403** o **500** aunque la
  configuración esté perfecta. `o+x` deja atravesar la carpeta, **no** listarla
  ni leer lo que hay adentro (el `.env` sigue en `600`). La línea con `test -r`
  es la prueba de que quedó bien: tiene que decir `nginx PUEDE leer`.
- **El `curl` final** pasa por nginx y llega al API: tiene que dar el mismo JSON
  que en la tarea 6.

### Tarea 8 de 9 — Firewall, DNS y certificado

**▶ EN PC-SERVICIOS**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

`OpenSSH` va **antes** de `enable`: si no, la sesión SSH con la que estás
trabajando se corta y no hay forma de volver a entrar sin consola de la VM.
El 3001 no se abre: el API sólo lo ve nginx, por `127.0.0.1`.

**▶ EN TU NAVEGADOR** (Cloudflare / Hostinger)

Crear el registro `A` del dominio apuntando a la IP pública con la que se llega
a este servidor. **Mientras se pide el certificado, dejarlo en «DNS only»
(nube gris).** Con la nube naranja y «Always Use HTTPS» activo, Cloudflare
redirige a HTTPS la validación de Let's Encrypt, que llega por el 80, y el
pedido falla.

**▶ EN PC-SERVICIOS**

```bash
sudo certbot --nginx -d TU-DOMINIO
sudo certbot renew --dry-run
```

certbot reescribe `/etc/nginx/sites-available/todohierro`: agrega el bloque
443 con el certificado y convierte el 80 en un redirect a HTTPS. La renovación
queda automática (timer de systemd); el `--dry-run` confirma que funciona en
vez de darla por sentada.

**Recién ahora anda el login.** La cookie de sesión se emite con `Secure` en
producción, y el navegador no la guarda sobre `http://`. Si se prueba el login
antes de tener el certificado, «entra y vuelve a pedir usuario»: no es un bug.

**Si después se pasa Cloudflare a nube naranja**:

1. Modo SSL en **Full (strict)** — el origen ya presenta un certificado válido.
2. Descomentar el bloque `real_ip` en `/etc/nginx/sites-available/todohierro`
   con los rangos vigentes de <https://www.cloudflare.com/ips/>, y
   `sudo nginx -t && sudo systemctl reload nginx`.

Sin el paso 2, nginx ve la IP de Cloudflare como origen de *todas* las
visitas, y el freno de login (`freno-login.service.ts`) bloquea a todo el mundo
por el intento fallido de una sola persona.

### Tarea 9 de 9 — Verificación final, con reinicio

**▶ EN TU NAVEGADOR**

- `https://TU-DOMINIO/api/salud` → `ok: true`, sin pedir sesión.
- `https://TU-DOMINIO/` → pantalla de login; entrar con el usuario de la
  tarea 5 y buscar un artículo.
- Recargar la página estando en una ruta interna: tiene que seguir en esa
  pantalla, no dar 404.

**▶ EN PC-SERVICIOS**

```bash
sudo reboot
```

Volver a entrar por SSH después de un minuto:

```bash
pm2 status todohierro-api
curl -s http://127.0.0.1:3001/api/salud; echo
```

Si el proceso está `online` sin haber tocado nada, el arranque automático
funciona. Una instalación que nunca se reinició no probó el arranque automático.

---

## Publicaciones siguientes

Se empuja desde la máquina de desarrollo y se publica desde pc-servicios. Lo
que viaja es el commit: no se copian archivos entre máquinas.

**▶ EN NINOFERHP**

```powershell
git push
```

**▶ EN PC-SERVICIOS**

```bash
cd /home/sistema/webTodoHierro
./scripts/publicar.sh "qué se está publicando"
```

(La primera vez: `chmod +x scripts/publicar.sh`, o correrlo como
`bash scripts/publicar.sh "..."`.)

**Publicar implica unos segundos de caída.** El script comprueba que está
parado en el repositorio correcto y que existe el `.env`, hace
`git pull --ff-only`, detiene el API, corre `npm ci` y las pruebas, **aborta si
alguna falla**, compila `shared → api → web` y reinicia con `--update-env`. Cada
publicación queda anotada en `logs/publicaciones.log` con fecha, commit y
mensaje. El porqué de cada paso está en los comentarios de
`scripts/publicar.sh`.

Si alguna vez cambia `deploy/nginx-todohierro.conf` en el repositorio, el
script **no** lo aplica: la copia viva está en `/etc/nginx` y ya tiene los
agregados de certbot. Se lleva el cambio a mano y se prueba con
`sudo nginx -t` antes de `reload`.

## Lo que se olvida y cuesta caro

**`pm2 save` después de cambiar la lista de procesos.** Si se agrega o saca un
proceso y no se guarda, el próximo reinicio restaura la lista vieja. No avisa.

**`--update-env` al reiniciar tras tocar el `.env`.** Sin esa bandera, pm2 le
pasa las variables viejas al proceso nuevo:

```bash
pm2 restart todohierro-api --update-env
```

**Una sola instancia.** Nada de `pm2 scale` ni `-i max`: el worker que recarga
la caché del catálogo vive dentro del proceso, y con dos instancias habría dos
cachés consultando por separado la base del cliente, que es producción viva.

**El API escucha en `127.0.0.1`.** Si alguna vez aparece `API_HOST=0.0.0.0` en
el `.env`, cualquiera en la red le habla directo a Node y saltea nginx, el HTTPS
y Cloudflare.

**La IP del servidor en la regla del Mikrotik.** Si la VM se recrea, la IP
cambia y el API arranca pero nunca conecta.

**Rotar `JWT_SECRETO` cierra todas las sesiones abiertas.** Es lo esperado,
pero conviene avisar antes.

## Si el sitio no vuelve después de un reinicio

En orden, porque el primero es el que más veces es:

1. `systemctl status pm2-sistema` — ¿corrió el servicio de arranque?
2. `pm2 list` — ¿está el proceso?
3. `tail -n 50 logs/api-error.log` — ¿arrancó y se cayó? Un `.env` incompleto
   frena el proceso a propósito, con un mensaje que dice qué falta.
4. `curl -s http://127.0.0.1:3001/api/salud` — si da `ok: false`, ¿está arriba
   la VPN y la regla del Mikrotik apunta a la IP correcta de esta máquina?
   (Tarea 2.)
5. `sudo systemctl status nginx` y `sudo nginx -t` — ¿nginx está arriba y su
   configuración es válida?
6. `sudo tail -n 50 /var/log/nginx/error.log` — un `Permission denied` ahí es
   el permiso de `/home/sistema` (Tarea 7).
