<#
    Publica el portal. SE CORRE EN PC-SERVICIOS, dentro del clon del repositorio.

        .\scripts\publicar.ps1 -Mensaje "que se esta publicando"

    Trae los cambios, compila en el lugar y reinicia el API. No copia nada a otra
    carpeta: el clon ES la carpeta de ejecucion, igual que netjoin.

    IMPLICA UNOS MINUTOS DE CAIDA. El API se detiene antes de instalar
    dependencias: npm ci borra node_modules entero y Windows no deja borrar un
    modulo nativo que un proceso tiene cargado (argon2). Se detiene primero y se
    levanta al final.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Mensaje
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }

<#
    Corre un comando externo y frena si devuelve un codigo distinto de cero.

    $ErrorActionPreference = 'Stop' NO alcanza: no aplica a los comandos externos.
    El 19/09/2026 `npm ci` fallo con EPERM y el script siguio compilando y
    reiniciando igual, con node_modules a medio instalar.
#>
function Ejecutar([string]$descripcion, [scriptblock]$bloque) {
    & $bloque
    if ($LASTEXITCODE -ne 0) {
        throw "$descripcion fallo con codigo $LASTEXITCODE. No se publica."
    }
}

# De donde esta corriendo se deduce todo. Un script correcto en la carpeta
# equivocada es un error que no avisa.
$paquete = Get-Content 'package.json' -Raw | ConvertFrom-Json
if ($paquete.name -ne 'todohierro-web') {
    throw "Esto no parece el repositorio del portal: package.json dice '$($paquete.name)'. Parate en el clon y volve a correrlo."
}
if (-not (Test-Path '.env')) {
    throw "Falta el .env en $raiz. Copia apps\api\.env.ejemplo, completalo, y volve a correrlo."
}

Paso "Publicando desde $raiz : $Mensaje"

Paso 'Trayendo cambios'
Ejecutar 'git pull' { git pull --ff-only }
$commit = (git rev-parse --short HEAD).Trim()

# Se detiene ANTES de instalar. Si el proceso no existe todavia, pm2 devuelve
# error y esta bien: no hay nada que detener.
Paso 'Deteniendo el API'
pm2 stop todohierro-api
$global:LASTEXITCODE = 0

Paso 'Dependencias'
# npm ci y no npm install: instala exactamente lo del package-lock. Un deploy no
# es el momento de que una dependencia cambie de version sola.
Ejecutar 'npm ci' { npm ci }

Paso 'Pruebas'
# Se invoca el jest instalado por su ruta, no con npx: si npx no lo encuentra,
# se pone a descargarlo de internet y pregunta por teclado. Un script de
# despliegue que espera una respuesta se cuelga para siempre.
$jest = Join-Path $raiz 'node_modules\jest\bin\jest.js'
if (-not (Test-Path $jest)) { throw "No esta jest en $jest. Reviso la instalacion de dependencias." }
Push-Location 'apps\api'
try   { Ejecutar 'las pruebas' { node $jest } }
finally { Pop-Location }

# El orden no es negociable: el API consume el dist de shared.
Paso 'Compilando shared'
Ejecutar 'build:shared' { npm run build:shared }
Paso 'Compilando api'
Ejecutar 'build:api' { npm run build:api }
Paso 'Compilando web'
Ejecutar 'build:web' { npm run build:web }

# dist esta en .gitignore, asi que el web.config hay que poner de nuevo despues
# de cada compilacion. Sin el, IIS no sabe mandar /api a Node y devuelve el
# index.html para todo: la pantalla carga y no trae datos.
Paso 'Configuracion de IIS'
Copy-Item 'deploy\web.config' 'apps\web\dist\web.config' -Force

# logs/ esta en .gitignore, asi que el clone no la crea. Tiene que existir ANTES
# de arrancar pm2: si no, pm2 no puede escribir su log y el proceso queda vivo
# pero mudo, que es la peor combinacion para diagnosticar cualquier cosa.
Paso 'Carpeta de logs'
New-Item -ItemType Directory -Force -Path 'logs' | Out-Null

Paso 'Levantando el API'
pm2 restart todohierro-api --update-env
if ($LASTEXITCODE -ne 0) {
    Write-Host 'El proceso no existia. Se levanta y se guarda la lista.' -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    Ejecutar 'pm2 start' { pm2 start '.\ecosystem.config.js' }
    Ejecutar 'pm2 save'  { pm2 save }
}
$global:LASTEXITCODE = 0

"[{0:yyyy-MM-dd HH:mm}] {1} - {2}" -f (Get-Date), $commit, $Mensaje |
    Add-Content 'logs\publicaciones.log'

Paso 'Estado'
pm2 status todohierro-api
Write-Host "`nPublicado $commit. Verifica: https://<tu-dominio>/api/salud" -ForegroundColor Green
