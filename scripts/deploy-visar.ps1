[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$HostServer = "",

    [Parameter(Mandatory=$false)]
    [string]$User = ""
)

# Cargar variables de entorno desde el .env raíz
$EnvFile = "$PSScriptRoot\..\.env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $name = $parts[0].Trim()
            $val = $parts[1].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $val, "Process")
        }
    }
}

if (-not $HostServer) {
    $HostServer = [System.Environment]::GetEnvironmentVariable("VISAR_HOST")
}
if (-not $User) {
    $User = [System.Environment]::GetEnvironmentVariable("VISAR_USER")
    if (-not $User) { $User = "root" }
}
$Domain = [System.Environment]::GetEnvironmentVariable("VISAR_DOMAIN")
if (-not $Domain) { $Domain = "nora.vis7ar.com" }

if (-not $HostServer) {
    Write-Error "❌ Error: VISAR_HOST no está definido en el archivo .env ni fue suministrado como parámetro."
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Despliegue en Servidor Visar ($HostServer)" -ForegroundColor Cyan
Write-Host "   Dominio: https://$Domain" -ForegroundColor DarkGray
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Compilación del Frontend Angular PWA
Write-Host "`n[1/4] Compilando PWA Angular..." -ForegroundColor Yellow
Set-Location -Path "$PSScriptRoot\..\pwa"
npm run build -- --configuration production
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Error al compilar PWA Angular."
    Set-Location -Path "$PSScriptRoot\.."
    exit 1
}
Set-Location -Path "$PSScriptRoot\.."
Write-Host "✅ PWA compilada correctamente." -ForegroundColor Green

# 2. Sincronización de Frontend a Visar
Write-Host "`n[2/4] Sincronizando estáticos PWA en /var/www/$Domain/dist/..." -ForegroundColor Yellow
scp -r ./pwa/dist/nora/* ${User}@${HostServer}:/var/www/${Domain}/dist/nora/

# 3. Sincronización de Backend Deno a Visar
Write-Host "`n[3/4] Sincronizando Backend Deno en /var/www/$Domain/backend/..." -ForegroundColor Yellow
scp -r ./backend/* ${User}@${HostServer}:/var/www/${Domain}/backend/
scp .env ${User}@${HostServer}:/var/www/${Domain}/backend/.env

# 4. Reinicio de Servicio y Recarga Nginx
Write-Host "`n[4/4] Reiniciando nora-backend y recargando Nginx..." -ForegroundColor Yellow
ssh ${User}@${HostServer} "systemctl restart nora-backend && sudo nginx -t && sudo systemctl reload nginx"

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "🎉 Despliegue completado con éxito: https://$Domain" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
