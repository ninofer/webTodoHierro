<#
    Publica el portal. SE CORRE EN PC-SERVICIOS, dentro del clon del repositorio.

        .\scripts\publicar.ps1 -Mensaje "que se esta publicando"

    Trae los cambios, compila en el lugar y reinicia el API. No copia nada a otra
    carpeta: el clon ES la carpeta de ejecucion, igual que netjoin.

    Frena ante el primer error. Nada esta hecho hasta verlo verde: si las pruebas
    fallan, no se compila ni se reinicia.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Mensaje
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }

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
git pull --ff-only
$commit = (git rev-parse --short HEAD).Trim()

Paso 'Dependencias'
# npm ci y no npm install: instala exactamente lo del package-lock. Un deploy no
# es el momento de que una dependencia cambie de version sola.
npm ci

Paso 'Pruebas'
Push-Location apps\api
npx jest
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Las pruebas fallaron. No se publica.' }
Pop-Location

# El orden no es negociable: el API consume el dist de shared.
Paso 'Compilando shared'
npm run build:shared
Paso 'Compilando api'
npm run build:api
Paso 'Compilando web'
npm run build:web

# dist esta en .gitignore, asi que el web.config hay que poner de nuevo despues
# de cada compilacion. Sin el, IIS no sabe mandar /api a Node y devuelve el
# index.html para todo: la pantalla carga y no trae datos.
Paso 'Configuracion de IIS'
Copy-Item 'deploy\web.config' 'apps\web\dist\web.config' -Force

Paso 'Reiniciando el API'
pm2 restart todohierro-api --update-env
if ($LASTEXITCODE -ne 0) {
    Write-Host 'El proceso no existia. Se levanta y se guarda la lista.' -ForegroundColor Yellow
    pm2 start '.\ecosystem.config.js'
    pm2 save
}

New-Item -ItemType Directory -Force -Path 'logs' | Out-Null
"[{0:yyyy-MM-dd HH:mm}] {1} - {2}" -f (Get-Date), $commit, $Mensaje |
    Add-Content 'logs\publicaciones.log'

Paso 'Estado'
pm2 status todohierro-api
Write-Host "`nPublicado $commit. Verifica: https://<tu-dominio>/api/salud" -ForegroundColor Green
