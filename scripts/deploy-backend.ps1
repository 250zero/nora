[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$WithSeed,

    [Parameter(Mandatory=$false)]
    [string]$ProjectRef = ""
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

if (-not $ProjectRef) {
    $ProjectRef = [System.Environment]::GetEnvironmentVariable("SUPABASE_PROJECT_REF")
}

if (-not $ProjectRef) {
    Write-Error "❌ Error: SUPABASE_PROJECT_REF no está definido en el archivo .env ni fue suministrado como parámetro."
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Despliegue Backend Nora — Supabase Cloud" -ForegroundColor Cyan
Write-Host "   Proyecto: $ProjectRef" -ForegroundColor DarkGray
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Enlace con Supabase Cloud
Write-Host "`n[1/3] Verificando enlace con Supabase Cloud..." -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef

# 2. Ejecutar Migraciones DDL/DML pendientes
Write-Host "`n[2/3] Aplicando migraciones pendientes en PostgreSQL..." -ForegroundColor Yellow
npx supabase db push
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Error al aplicar migraciones en Supabase Cloud. Despliegue abortado."
    exit 1
}
Write-Host "✅ Migraciones aplicadas exitosamente." -ForegroundColor Green

# 3. Ejecutar Seeds de forma controlada
if ($WithSeed) {
    Write-Host "`n[3/3] 🌱 Ejecutando Seeds idempotentes en Supabase Cloud..." -ForegroundColor Magenta
    if (Test-Path "$PSScriptRoot\..\supabase\seed.sql") {
        npx supabase db execute --file "$PSScriptRoot\..\supabase\seed.sql"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Seeds aplicados exitosamente." -ForegroundColor Green
        } else {
            Write-Warning "⚠️ Advertencia al ejecutar seeds (verifique logs de constraints)."
        }
    } else {
        Write-Warning "⚠️ Archivo supabase/seed.sql no encontrado."
    }
} else {
    Write-Host "`n[3/3] ⏭️ Omitiendo seeds (ejecute con -WithSeed para sembrar datos demo)." -ForegroundColor DarkGray
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "🎉 Base de Datos sincronizada con exito!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
