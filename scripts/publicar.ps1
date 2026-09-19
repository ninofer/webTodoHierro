<#
    Publica el portal en pc-servicios.

        .\scripts\publicar.ps1 -Mensaje "que se esta publicando"

    Frena ante el primer error. Nada esta hecho hasta verlo verde: si las pruebas
    fallan, no se compila ni se copia nada.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Mensaje,

    [string]$Destino = 'C:\todohierro'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }

Paso "Publicando: $Mensaje"

Paso 'Pruebas'
Push-Location apps\api
npx jest
if ($LASTEXITCODE -ne 0) { throw 'Las pruebas fallaron. No se publica.' }
Pop-Location

# El orden no es negociable: el API consume el dist de shared.
Paso 'Compilando shared'
npm run build:shared
Paso 'Compilando api'
npm run build:api
Paso 'Compilando web'
npm run build:web

Paso "Copiando a $Destino"
New-Item -ItemType Directory -Force -Path "$Destino\logs" | Out-Null
robocopy 'apps\api\dist'      "$Destino\apps\api\dist"      /MIR /NFL /NDL /NJH /NJS | Out-Null
robocopy 'packages\shared\dist' "$Destino\packages\shared\dist" /MIR /NFL /NDL /NJH /NJS | Out-Null
robocopy 'apps\web\dist'      "$Destino\apps\web\dist"      /MIR /NFL /NDL /NJH /NJS | Out-Null
Copy-Item 'ecosystem.config.js' "$Destino\ecosystem.config.js" -Force
Copy-Item 'deploy\web.config'   "$Destino\apps\web\dist\web.config" -Force
# robocopy devuelve codigos < 8 cuando copio bien. Solo 8 o mas es error.
if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con codigo $LASTEXITCODE" }
$global:LASTEXITCODE = 0

Paso 'Dependencias de produccion'
Push-Location $Destino
npm install --omit=dev --workspaces --include-workspace-root
Pop-Location

Paso 'Reiniciando el API'
pm2 restart todohierro-api --update-env
# Si el proceso no existia, se levanta y se guarda la lista.
if ($LASTEXITCODE -ne 0) {
    pm2 start "$Destino\ecosystem.config.js"
    pm2 save
}

Paso 'Estado'
pm2 status todohierro-api
Write-Host "`nListo. Verifica: https://<tu-dominio>/api/salud" -ForegroundColor Green
