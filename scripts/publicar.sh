#!/usr/bin/env bash
#
# Publica el portal. SE CORRE EN PC-SERVICIOS (Ubuntu), dentro del clon del
# repositorio.
#
#   ./scripts/publicar.sh "qué se está publicando"
#
# Trae los cambios, compila en el lugar y reinicia el API. No copia nada a
# otra carpeta: el clon ES la carpeta de ejecución.
#
# Equivalente en bash de scripts/publicar.ps1, que se usaba en la instalación
# original sobre Windows/IIS. Dos cosas de esa versión no aplican acá:
#
#   - Detener el API antes de `npm ci` para evitar un EPERM: en Windows, borrar
#     un módulo nativo (argon2) que un proceso tiene cargado falla. En Linux
#     borrar un archivo abierto no falla — el inodo sigue vivo hasta que el
#     proceso lo suelta. Igual se detiene el API antes de instalar, pero por
#     prolijidad (no dejarlo sirviendo con medio node_modules puesto), no por
#     ese motivo.
#   - Reponer deploy/web.config en apps/web/dist después de compilar. Con
#     nginx la configuración del sitio vive en /etc/nginx, no adentro de la
#     carpeta que se sirve: no hay nada que reponer.
#
# Lo que sigue igual: jest no se invoca con npx (si no lo encuentra local, npx
# se pone a descargarlo y pregunta por teclado, y un script de despliegue que
# espera una respuesta se cuelga para siempre), y cada paso externo comprueba
# su código de salida antes de seguir.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: ./scripts/publicar.sh \"qué se está publicando\"" >&2
  exit 1
fi
MENSAJE="$1"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

paso() { printf '\n== %s\n' "$1"; }

# De dónde está corriendo se deduce todo. Un script correcto en la carpeta
# equivocada es un error que no avisa.
NOMBRE_PAQUETE="$(node -p "require('./package.json').name")"
if [[ "$NOMBRE_PAQUETE" != "todohierro-web" ]]; then
  echo "Esto no parece el repositorio del portal: package.json dice '$NOMBRE_PAQUETE'. Parate en el clon y volvé a correrlo." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "Falta el .env en $RAIZ. Copiá apps/api/.env.ejemplo, completalo, y volvé a correrlo." >&2
  exit 1
fi

paso "Publicando desde $RAIZ: $MENSAJE"

paso "Trayendo cambios"
git pull --ff-only
COMMIT="$(git rev-parse --short HEAD)"

# Se detiene ANTES de instalar. Si el proceso no existe todavía, pm2 devuelve
# error y está bien: no hay nada que detener.
paso "Deteniendo el API"
pm2 stop todohierro-api || true

paso "Dependencias"
# npm ci y no npm install: instala exactamente lo del package-lock. Un deploy
# no es el momento de que una dependencia cambie de versión sola.
npm ci

paso "Pruebas"
# jest se invoca por su ruta y no con npx: si npx no lo encuentra, se pone a
# descargarlo de internet y pregunta por teclado. Un script de despliegue que
# espera una respuesta se cuelga para siempre.
JEST="$RAIZ/node_modules/jest/bin/jest.js"
if [[ ! -f "$JEST" ]]; then
  echo "No está jest en $JEST. Revisá la instalación de dependencias." >&2
  exit 1
fi
(cd apps/api && node "$JEST")

# El orden no es negociable: el API consume el dist de shared.
paso "Compilando shared"
npm run build:shared
paso "Compilando api"
npm run build:api
paso "Compilando web"
npm run build:web

# logs/ está en .gitignore, así que el clon no la crea. Tiene que existir
# ANTES de arrancar pm2: si no, pm2 no puede escribir su log y el proceso
# queda vivo pero mudo, que es la peor combinación para diagnosticar
# cualquier cosa.
paso "Carpeta de logs"
mkdir -p logs

paso "Levantando el API"
if pm2 restart todohierro-api --update-env; then
  :
else
  echo "El proceso no existía. Se levanta y se guarda la lista."
  pm2 start ./ecosystem.config.js
  pm2 save
fi

printf '[%s] %s - %s\n' "$(date '+%Y-%m-%d %H:%M')" "$COMMIT" "$MENSAJE" >> logs/publicaciones.log

paso "Estado"
pm2 status todohierro-api
echo
echo "Publicado $COMMIT. Verificá: https://<tu-dominio>/api/salud"
