#!/usr/bin/env bash
set -e

DOMAIN="nora.vis7ar.com"
API_DOMAIN="api.nora.vis7ar.com"
APP_DIR="/var/www/${DOMAIN}"

echo "=========================================="
echo "🚀 Aprovisionando Nora en Visar (0 Docker)"
echo "   Dominio: ${DOMAIN}"
echo "=========================================="

# 1. Instalar Deno si no está instalado
if ! command -v deno &> /dev/null; then
    echo "[1/5] Instalando Deno en el sistema..."
    curl -fsSL https://deno.land/install.sh | sh
    export DENO_INSTALL="/root/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"
    echo 'export DENO_INSTALL="/root/.deno"' >> /root/.bashrc
    echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> /root/.bashrc
else
    echo "[1/5] Deno ya está instalado: $(deno --version | head -n 1)"
fi

# 2. Crear directorios de despliegue
echo "[2/5] Creando directorios en ${APP_DIR}..."
mkdir -p "${APP_DIR}/dist/nora/browser"
mkdir -p "${APP_DIR}/backend"

# 3. Configurar Nginx
echo "[3/5] Configurando Virtual Host en Nginx..."
cp /var/www/${DOMAIN}/deploy/nora.vis7ar.com.conf /etc/nginx/sites-available/${DOMAIN}
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}

nginx -t
systemctl reload nginx

# 4. Configurar e Iniciar Servicio Systemd de Backend
echo "[4/5] Configurando servicio systemd para Deno..."
cp /var/www/${DOMAIN}/deploy/nora-backend.service /etc/systemd/system/nora-backend.service
systemctl daemon-reload
systemctl enable nora-backend
systemctl restart nora-backend

# 5. Obtener Certificados SSL con Certbot
echo "[5/5] Activando SSL con Let's Encrypt para ${DOMAIN} y ${API_DOMAIN}..."
if command -v certbot &> /dev/null; then
    certbot --nginx -d "${DOMAIN}" -d "${API_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || true
else
    echo "Certbot no está instalado. Instalándolo con apt..."
    apt-get update && apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "${DOMAIN}" -d "${API_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || true
fi

echo "=========================================="
echo "🎉 Despliegue de Nora completado con éxito"
echo "   Frontend PWA: https://${DOMAIN}"
echo "   Backend API:  https://${API_DOMAIN}"
echo "=========================================="
systemctl status nora-backend --no-pager
