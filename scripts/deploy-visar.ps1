[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$HostServer = "159.203.103.8",

    [Parameter(Mandatory=$false)]
    [string]$User = "root"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Despliegue en Servidor Visar ($HostServer)" -ForegroundColor Cyan
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
Write-Host "`n[2/4] Sincronizando estaticos PWA en /var/www/nora.vis7ar.com/dist/..." -ForegroundColor Yellow
scp -r ./pwa/dist/nora/* ${User}@${HostServer}:/var/www/nora.vis7ar.com/dist/nora/

# 3. Sincronización de Backend Deno a Visar
Write-Host "`n[3/4] Sincronizando Backend Deno en /var/www/nora.vis7ar.com/backend/..." -ForegroundColor Yellow
scp -r ./backend/* ${User}@${HostServer}:/var/www/nora.vis7ar.com/backend/
scp .env ${User}@${HostServer}:/var/www/nora.vis7ar.com/backend/.env

# 4. Reinicio de Servicio y Recarga Nginx
Write-Host "`n[4/4] Reiniciando nora-backend y recargando Nginx..." -ForegroundColor Yellow
ssh ${User}@${HostServer} "systemctl restart nora-backend && sudo nginx -t && sudo systemctl reload nginx"

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "🎉 Despliegue completado con éxito: https://nora.vis7ar.com" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
