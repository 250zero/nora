# 🌟 Nora — Asistente Inteligente de Agenda y Tareas con IA (Google Gemini)

Nora es una solución corporativa de gestión de tiempo y tareas de equipo, diseñada para operar sin fricción manual. Cuenta con una Progressive Web App (PWA) de alto rendimiento en **Angular 19**, un Backend autónomo y ultra-rápido en **Deno (Hono)**, base de datos relacional optimizada en **Supabase Cloud**, y un núcleo de inteligencia artificial impulsado por **Google Gemini**.

---

## 🚀 Enlaces de Producción (Servidor Visar)

- **Frontend PWA:** [https://nora.vis7ar.com](https://nora.vis7ar.com)
- **API Backend:** [https://api.nora.vis7ar.com](https://api.nora.vis7ar.com)
- **Endpoint de Salud:** [https://api.nora.vis7ar.com/api/health](https://api.nora.vis7ar.com/api/health)

---

## 👥 Cuentas de Acceso y Evaluación Inmediata

La aplicación cuenta con botones de acceso rápido con **1 solo clic** en la pantalla de inicio de sesión:

| Rol | Usuario | Contraseña | Capacidades y Alcance |
| :--- | :--- | :--- | :--- |
| 👑 **Supervisor** | `supervisor@nora.com` | `Nora2026!` | Gestión completa de colaboradores, reasignación, drill-down de tareas, modal de borrado en cascada y Panel de Auditoría con IP nativa (`inet`). |
| 👤 **Miembro** | `miembro@nora.com` | `Nora2026!` | Agenda personal Día/Semana/Mes, asistente de IA Nora, creación conversacional sin botón manual ADD y cambio de estado de tareas. |

---

## 🏛️ Arquitectura del Sistema

```
                      ┌───────────────────────────────────────┐
                      │    Navegador / Celular (PWA)          │
                      │    https://nora.vis7ar.com            │
                      └──────────────────┬────────────────────┘
                                         │ HTTPS (443)
                                         ▼
                      ┌───────────────────────────────────────┐
                      │         Nginx Reverse Proxy           │
                      │    (Servidor Visar 159.203.103.8)     │
                      └──────────┬─────────────────┬──────────┘
                                 │                 │
                Estáticos PWA    │                 │ Proxy /api/*
                (/var/www/...)   ▼                 ▼ (Puerto 3001)
                      ┌──────────────────┐  ┌─────────────────────────┐
                      │ Angular 19 PWA   │  │   Deno + Hono Backend   │
                      │ Standalone + OnPush │ (nora-backend.service)  │
                      └──────────────────┘  └──────────────┬──────────┘
                                                           │
                                ┌──────────────────────────┴──────────────────────────┐
                                │                                                     │
                                ▼                                                     ▼
                ┌───────────────────────────────┐                     ┌───────────────────────────────┐
                │        Supabase Cloud         │                     │       Google Gemini AI        │
                │  Postgres 5FN + Supabase Auth │                     │       gemini-3.8-flash        │
                │   (Conexión Privada Servidor) │                     │ (Tool Calling & Disponibilidad)│
                └───────────────────────────────┘                     └───────────────────────────────┘
```

### Principios Innegociables Implementados
1. **0 Exposición de Supabase y Gemini:** El frontend Angular solo se comunica con la API de Deno (`/api/*`). Ni la URL de Supabase, ni la llave anónima, ni la clave de Gemini están expuestas al navegador.
2. **Auditoría Desacoplada sin Triggers:** Toda consulta `SELECT` y mutación `DML` se intercepta en `auditMiddleware` dentro de Deno, capturando la IP real (almacenada en tipo `inet` de PostgreSQL), User-Agent y usuario autenticado sin penalizar la base de datos con triggers.
3. **PWA Offline First:** Cache local reactivo en `TaskStore` mediante `localStorage` / `IndexedDB`, detector automático de conectividad y manifiesto PWA (`manifest.webmanifest`).
4. **Agenda sin Botón ADD Manual:** Los compromisos se orquestan mediante el Asistente IA Nora, quien consulta las horas libres de la agenda laboral y ofrece chips seleccionables (`[ 10:00 AM ]`, `[ 11:30 AM ]`).

---

## 🛠️ Stack Tecnológico

- **Frontend:** Angular 19.2, TypeScript 5, Tailwind CSS 3.4, Signals, ChangeDetectionStrategy.OnPush, Catálogo tipado de iconos SVG.
- **Backend:** Deno 2.1+, Framework Hono 4.6, Zod para validación de contratos, Cliente REST nativo de Google Gemini.
- **Base de Datos:** PostgreSQL en Supabase Cloud, esquema 5FN, tipos optimizados (`inet`, `smallint`), Row Level Security (RLS).
- **Inteligencia Artificial:** Google Gemini 3.8 Flash con Tool Calling (`consultar_horas_libres`, `crear_tarea`, `eliminar_tarea`, `listar_tareas`).
- **Infraestructura:** Servidor Ubuntu Linux en Visar (`159.203.103.8`), Nginx 1.26, Systemd, Certbot (Let's Encrypt SSL).

---

## 📦 Instrucciones para Desplegar los Servicios

### Prerrequisitos en la Máquina Local
- Node.js 20+ y npm
- Deno 2.x
- Python 3 con librería `paramiko` (`pip install paramiko`)
- Archivo `.env` configurado en la raíz

---

### Opción 1: Despliegue Automatizado en 1 Solo Paso (Recomendado)

Desde la raíz del proyecto, ejecuta el script de sincronización con Visar:

```bash
python scripts/deploy_remote.py
```

O en PowerShell:
```powershell
.\scripts\deploy-visar.ps1
```

Este script ejecuta automáticamente:
1. Compilación de producción de Angular PWA (`npm run build`).
2. Sincronización de estáticos en `/var/www/nora.vis7ar.com/dist/nora/browser/`.
3. Sincronización del código de Deno y `.env` en `/var/www/nora.vis7ar.com/backend/`.
4. Actualización del servicio systemd `/etc/systemd/system/nora-backend.service`.
5. Recarga en caliente de Nginx (`nginx -t && systemctl reload nginx`).
6. Verificación de salud HTTP y HTTPS en vivo.

---

### Opción 2: Despliegue Manual Paso a Paso en el Servidor

Si deseas configurar o revisar manualmente el servidor Visar por SSH:

```bash
ssh root@159.203.103.8
```

#### 1. Instalar Deno (si es un nuevo servidor)
```bash
curl -fsSL https://deno.land/install.sh | sh
export PATH="/root/.deno/bin:$PATH"
echo 'export PATH="/root/.deno/bin:$PATH"' >> ~/.bashrc
```

#### 2. Configurar el Servicio Systemd de Deno
Crear el archivo `/etc/systemd/system/nora-backend.service`:
```ini
[Unit]
Description=Nora Deno Backend API (Hono)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/nora.vis7ar.com/backend
EnvironmentFile=/var/www/nora.vis7ar.com/backend/.env
ExecStart=/root/.deno/bin/deno run --allow-net --allow-env --allow-read main.ts
Restart=always
RestartSec=3
Environment=PORT=3001
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Habilitar y arrancar el servicio:
```bash
systemctl daemon-reload
systemctl enable nora-backend
systemctl restart nora-backend
```

#### 3. Configurar el Virtual Host en Nginx
Crear `/etc/nginx/sites-available/nora.vis7ar.com`:
```nginx
server {
    server_name nora.vis7ar.com;
    root /var/www/nora.vis7ar.com/dist/nora/browser;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    server_name api.nora.vis7ar.com;

    location / {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Activar el sitio y recargar Nginx:
```bash
ln -sf /etc/nginx/sites-available/nora.vis7ar.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 4. Obtener Certificados SSL con Certbot
```bash
certbot --nginx -d nora.vis7ar.com -d api.nora.vis7ar.com --non-interactive --agree-tos --register-unsafely-without-email
```

---

## 🔍 Comandos de Operación y Monitoreo en el Servidor

| Acción | Comando |
| :--- | :--- |
| **Ver estado del backend** | `systemctl status nora-backend` |
| **Ver logs en tiempo real** | `journalctl -u nora-backend -f` |
| **Reiniciar backend** | `systemctl restart nora-backend` |
| **Verificar sintaxis de Nginx**| `nginx -t` |
| **Recargar Nginx** | `systemctl reload nginx` |
| **Comprobar salud local** | `curl -s http://127.0.0.1:3001/api/health` |
| **Comprobar salud pública**| `curl -s https://api.nora.vis7ar.com/api/health` |

---

## 🌐 Endpoints de la API Backend

| Método | Endpoint | Protección | Descripción |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Pública | Estado del servicio y timestamp. |
| `POST`| `/api/auth/login` | Pública | Login contra Supabase Auth; devuelve JWT y rol. |
| `POST`| `/api/auth/register` | Pública | Registro de colaborador nuevo en Supabase Auth. |
| `GET` | `/api/auth/me` | Bearer Token | Obtiene perfil y rol del usuario autenticado. |
| `POST`| `/api/auth/logout` | Bearer Token | Cierre de sesión. |
| `GET` | `/api/agenda` | Bearer Token | Agenda formateada para vistas Día/Semana/Mes. |
| `GET` | `/api/tasks` | Bearer Token | Listado de tareas con filtros (estado, búsqueda, usuario). |
| `POST`| `/api/tasks` | Bearer Token | Creación de tarea con validación Zod. |
| `PATCH`| `/api/tasks/:id/status` | Bearer Token | Toggle optimista de completado (1=Pendiente, 3=Lista). |
| `DELETE`| `/api/tasks/:id` | Bearer Token | Eliminación de tarea por ID. |
| `GET` | `/api/users` | Rol Supervisor | Lista de colaboradores con estadísticas de tareas. |
| `GET` | `/api/users/:id/tasks` | Rol Supervisor | Drill-down de tareas de un colaborador. |
| `DELETE`| `/api/users/:id` | Rol Supervisor | Borrado irreversible en cascada estricta. |
| `POST`| `/api/chat` | Bearer Token | Conversación con Asistente Nora + Google Gemini Tool Calling. |
| `POST`| `/api/chat/confirm-action` | Bearer Token | Confirmación de acciones destructivas de IA. |
| `GET` | `/api/audit-logs` | Rol Supervisor | Registro de auditoría con paginación server-side. |

---

## 🗄️ Migraciones de Base de Datos Aplicadas

Todas las migraciones fueron aplicadas con éxito en Supabase Cloud:
1. `0001_init.sql`: Tablas principales 5FN (`profiles`, `tasks`, `audit_logs` con IP `inet`, `chat_messages`), RLS y hardening.
2. `0002_supervisor.sql`: Tabla `user_roles`, función `is_supervisor()`, RLS de roles y guardas de asignación.
3. `0003_auth_users_roles.sql`: Trigger `handle_new_user()` que garantiza la sincronización entre Supabase Auth y los roles del sistema.
4. `0004_auto_confirm_email.sql`: Auto-confirmación inmediata de email en `auth.users` para facilitar el acceso ágil de evaluación.

---

## 📄 Licencia y Derechos

Proyecto desarrollado conforme a las especificaciones y lineamientos de arquitectura corporativa de Visar.
