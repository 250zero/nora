# 🌟 Nora — Asistente Inteligente de Agenda y Tareas con IA

> **Nora:** Solución corporativa de gestión de tiempo y tareas de equipo diseñada para operar con interacción natural y automatización conversacional mediante Inteligencia Artificial (Google Gemini), arquitectura PWA Mobile-First en Angular 19, backend autónomo en Deno (Hono) y base de datos relacional en 5FN sobre PostgreSQL con Row Level Security (RLS).

[![Producción en Vivo](https://img.shields.io/badge/Producci%C3%B3n-nora.vis7ar.com-059669?style=for-the-badge&logo=googlechrome&logoColor=white)](https://nora.vis7ar.com)
[![API Health](https://img.shields.io/badge/API%20Health-200%20OK-blue?style=for-the-badge&logo=deno&logoColor=white)](https://api.nora.vis7ar.com/api/health)
[![Backend Runtime](https://img.shields.io/badge/Backend-Deno%202.x%20%2B%20Hono-black?style=for-the-badge&logo=deno&logoColor=white)](https://deno.com)
[![Frontend](https://img.shields.io/badge/Frontend-Angular%2019%20PWA-dd0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.dev)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%205FN-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)

---

## 🚀 1. Enlaces y Accesos a Producción

La plataforma Nora está desplegada y activa en el servidor cloud Visar bajo proxy reverso Nginx con certificados SSL Let's Encrypt:

* **Frontend Web & PWA:** [https://nora.vis7ar.com](https://nora.vis7ar.com)
* **API Backend (Deno BFF):** [https://api.nora.vis7ar.com/api/health](https://api.nora.vis7ar.com/api/health)
* **Servidor Host:** Droplet Ubuntu Linux en Visar (`159.203.103.8`, puerto interno `3001` gestionado mediante Systemd).

---

## 👥 2. Credenciales y Matriz de Acceso (Usuarios Sembrados)

Puedes ingresar en `/login` utilizando los usuarios de demostración precargados:

| Rol | Usuario | Contraseña | Capacidades y Alcance |
| :--- | :--- | :--- | :--- |
| 👑 **Supervisor** | `supervisor@nora.com` | `Nora2026!` | Gestión completa de colaboradores (creación y borrado en cascada), reasignación y edición de tareas del equipo, filtro global por colaborador y acceso al **Panel de Auditoría** con IP nativa (`inet`). |
| 👤 **Miembro** | `miembro@nora.com` | `Nora2026!` | Agenda personal Día/Semana/Mes, vistas rápidas (Hoy/Próximas/Vencidas/Completadas), interacción conversacional con Asistente Nora, edición y borrado exclusivo de tareas creadas por él. |

> *Nota:* La pantalla de login incluye botones de acceso rápido que precargan automáticamente las credenciales con un solo clic.

---

## 🎯 3. Características Principales del Producto

1. **Asistente Inteligente Conversacional (Google Gemini):**
   - Agendamiento y gestión de tareas mediante lenguaje natural en español caribeño / estándar.
   - Orquestación mediante 7 herramientas validadas con Zod: `crear_tarea`, `listar_tareas`, `completar_tarea`, `actualizar_tarea`, `reprogramar_tarea`, `consultar_horas_libres` y `eliminar_tarea`.
   - Detección proactiva de colisiones de horario y sugerencia de franjas libres (`suggestedSlots`).
2. **Agenda Multifuncional Mobile-First:**
   - Visualizaciones de calendario en modos **Día**, **Semana** y **Mes**.
   - Vistas de filtrado rápido: Hoy, Próximas, Vencidas y Completadas.
   - Pestaña de navegación móvil inferior con acceso directo a Agenda, Tareas, Chat Nora y Ajustes/Usuarios.
3. **Ficha Estándar de Tareas con Trazabilidad:**
   - Visualización y edición estructurada: título, descripción, fecha, hora, prioridad (`Baja`, `Media`, `Alta`, `Urgente`), estado y colaborador asignado.
   - Metadatos de origen: canal de creación (`IA Conversacional` vs `Manual`), IP de registro (`inet`) y agente de usuario (`User-Agent`).
4. **Administración de Equipo y Auditoría (Supervisor):**
   - Alta de nuevos colaboradores con sincronización transaccional en `auth.users` y tabla pública `user_roles`.
   - Borrado integral en cascada con función RPC `admin_delete_user`.
   - Panel de auditoría con paginación server-side, filtrado por usuario/acción e IPs reales registradas.
5. **PWA Offline-First:**
   - Caché local reactivo en `TaskStore` mediante almacenamiento cliente y detección de estado de red en tiempo real.
   - Manifiesto instalable en pantallas de inicio móviles y de escritorio.

---

## 🏛️ 4. Arquitectura del Sistema y Stack Tecnológico

### Diagrama de Arquitectura de Producción:
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
               (/var/www/...)    ▼                 ▼ (Puerto 3001)
                      ┌──────────────────┐  ┌─────────────────────────┐
                      │  Angular 19 PWA  │  │   Deno + Hono Backend   │
                      │ Standalone+OnPush│  │ (nora-backend.service)  │
                      └──────────────────┘  └──────────────┬──────────┘
                                                           │
                                ┌──────────────────────────┴──────────────────────────┐
                                │                                                     │
                                ▼                                                     ▼
                ┌───────────────────────────────┐                     ┌───────────────────────────────┐
                │     PostgreSQL en 5FN         │                     │  Google Gemini Flash API      │
                │     (Supabase Cloud)          │                     │  (Tool Calling & Calendario)  │
                └───────────────────────────────┘                     └───────────────────────────────┘
```

### Componentes del Stack:
* **Frontend:** Angular 19.2 (Standalone Components, Signals, `ChangeDetectionStrategy.OnPush`, Tailwind CSS 3.4, PWA Service Worker).
* **Backend:** Deno 2.x, Framework Hono 4.6, Zod para contratos tipados de herramientas, cliente REST de Google Gemini.
* **Base de Datos:** PostgreSQL en 5FN (Supabase Cloud), Row Level Security (RLS) habilitado en todas las tablas, tipos nativos `inet` y `smallint`.
* **Inteligencia Artificial:** Google Gemini con Tool Calling iterativo y tabla dinámica de contexto de 14 días en zona horaria `America/Santo_Domingo`.
* **Infraestructura:** Servidor Ubuntu Linux en Visar, Nginx 1.26 con compresión Gzip, Systemd y Certbot SSL.

### Decisiones Arquitectónicas Clave (ADRs):
1. **ADR-001: Backend en Deno 2.x + Hono (Puerto 3001)**
   - *Decisión:* Ejecución directa de TypeScript sin transpilación, sandbox estricto de seguridad, arranque en <30 ms y consumo ultrabajo de memoria (~40 MB de RAM).
2. **ADR-002: Base de Datos 5FN con RLS Endurecido**
   - *Decisión:* Separación relacional entre `profiles`, `tasks`, `user_roles`, `chat_messages` y `audit_logs`. RLS activado impidiendo lectura de datos ajenos a nivel de base de datos.
3. **ADR-003: Auditoría Desacoplada sin Triggers Pesados**
   - *Decisión:* Las operaciones mutantes se interceptan en el middleware de Deno registrando la IP real `inet`, método y parámetros (con ofuscación automática de contraseñas y tokens), evitando sobrecarga relacional.
4. **ADR-004: Modelo Nora AI-First**
   - *Decisión:* El agendamiento principal se realiza mediante lenguaje natural a través del asistente, asegurando validación anti-colisiones antes de persistir en PostgreSQL.

---

## 💻 5. Guía de Configuración y Ejecución en Local (Paso a Paso)

Sigue estos pasos para ejecutar la plataforma Nora en tu entorno de desarrollo local.

### Prerrequisitos del Sistema:
* **Deno:** Versión 2.x instalada ([instalar Deno](https://deno.land)).
* **Node.js:** Versión 20+ y `npm` ([instalar Node](https://nodejs.org)).
* **PostgreSQL:** Versión 15+ local o instancia de Supabase Cloud.
* **Git:** Para clonar el repositorio.

---

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/250zero/nora.git
cd nora
```

---

### Paso 2: Configuración de Variables de Entorno (`.env`)
Copia la plantilla de ejemplo `.env.example` para generar tu archivo `.env`:

```bash
# En Windows (PowerShell):
Copy-Item .env.example .env

# En Linux / macOS:
cp .env.example .env
```

Edita el archivo `.env` configurando tus credenciales:

| Variable | Descripción | Ejemplo / Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha del backend Deno | `3001` |
| `DATABASE_URL` | Conexión directa a PostgreSQL | `postgresql://postgres:tu_password@localhost:5432/nora_db` |
| `SUPABASE_URL` | URL de la instancia Supabase | `https://tu-proyecto.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave anónima pública de Supabase | `tu_supabase_anon_key` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio para gestión de usuarios | `tu_supabase_service_role_key` |
| `LLM_PROVIDER` | Proveedor del modelo de IA | `gemini` |
| `LLM_API_KEY` | Clave de Google AI Studio / Gemini | `tu_gemini_api_key` |

---

### Paso 3: Inicialización de la Base de Datos y Semillas (Seeds)

Aplica las migraciones SQL en orden:

```bash
# 1. Crear base de datos local
psql -U postgres -c "CREATE DATABASE nora_db;"

# 2. Aplicar migraciones DDL en orden
psql -U postgres -d nora_db -f supabase/migrations/0001_init.sql
psql -U postgres -d nora_db -f supabase/migrations/0002_supervisor.sql
psql -U postgres -d nora_db -f supabase/migrations/0003_auth_users_roles.sql
psql -U postgres -d nora_db -f supabase/migrations/0004_auto_confirm_email.sql
psql -U postgres -d nora_db -f supabase/migrations/0005_backend_rls_grants.sql
psql -U postgres -d nora_db -f supabase/migrations/0006_security_rls_hardening.sql

# 3. Sembrar datos demo (si aplica)
psql -U postgres -d nora_db -f supabase/seed.sql
```

*(Si utilizas Supabase Cloud / CLI: ejecuta `npx supabase db push`)*.

---

### Paso 4: Ejecutar el Backend en Deno (BFF)

Abre una terminal y levanta el backend en modo desarrollo:

```bash
cd backend
deno task dev
```

El servidor quedará disponible en el puerto 3001:
```
[Nora Backend] Escuchando en http://localhost:3001
```

Verifica la salud del servicio:
```bash
curl http://localhost:3001/api/health
# Respuesta: {"status":"healthy","service":"nora-backend",...}
```

---

### Paso 5: Ejecutar el Frontend Angular 19 PWA

En otra terminal, dirígete a `pwa`, instala paquetes e inicia Angular:

```bash
cd pwa
npm install
npm start
```

El script `npm start` inicia `ng serve --proxy-config proxy.conf.json`, redirigiendo de forma automática todas las solicitudes a `/api/*` hacia `http://localhost:3001`.

Abre tu navegador en:
👉 **[http://localhost:4200](http://localhost:4200)**

---

### Paso 6: Verificación Integral del Entorno Local
1. Inicia sesión como **Supervisor** o **Miembro** con un solo clic.
2. Abre la pestaña **Chat Nora** y escribe: *"Crea una reunión con el equipo técnico mañana a las 10:00 AM para revisar sprint"*.
3. Observa cómo el asistente procesa el lenguaje natural, valida colisiones y crea la tarea automáticamente en la Agenda.

---

## 🧪 6. Suite de Pruebas Automatizadas

El backend cuenta con pruebas automatizadas que verifican la interpretación de fechas relativas, el cruce de medianoche en la zona horaria oficial y los esquemas Zod de las herramientas de IA:

```bash
# Ejecutar suite de pruebas en Deno
deno test --config backend/deno.json --allow-env --allow-read backend/tests/agent_tools.test.ts
```

### Cobertura de Pruebas:
* ✅ **Zona Horaria:** Manejo preciso de fechas relativas en `America/Santo_Domingo`.
* ✅ **Cruce de Medianoche:** Resolución correcta de transiciones entre las 23:55 y las 00:05.
* ✅ **Normalización Horaria:** Conversión bidireccional fiable entre formatos 12 horas (AM/PM) y 24 horas.
* ✅ **Contratos Zod:** Validación estricta de parámetros en todas las herramientas del Asistente Nora.

---

## 🌐 7. Catálogo de Endpoints de la API Backend

Todos los endpoints de negocio operan bajo el prefijo `/api/`:

| Método | Endpoint | Protección | Descripción |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Pública | Estado del servicio, uptime y timestamp. |
| `POST` | `/api/auth/login` | Pública | Login contra Supabase Auth; retorna JWT y rol asignado. |
| `POST` | `/api/auth/register` | Pública | Registro de colaborador nuevo en Supabase Auth. |
| `GET` | `/api/auth/me` | Bearer Token | Obtiene perfil y rol del usuario autenticado. |
| `POST` | `/api/auth/logout` | Bearer Token | Cierre y revocación de sesión. |
| `GET` | `/api/agenda` | Bearer Token | Retorna tareas formateadas para vistas de calendario (Día/Semana/Mes). |
| `GET` | `/api/tasks` | Bearer Token | Listado de tareas con filtros por estado, búsqueda o usuario asignado. |
| `POST` | `/api/tasks` | Bearer Token | Creación de tarea con validación Zod. |
| `GET` | `/api/tasks/:id/detail` | Bearer Token | Ficha detallada con trazabilidad completa (canal IA/Manual, IP, agente). |
| `PUT` | `/api/tasks/:id` | Bearer Token | Edición completa de tarea (título, descripción, fecha, hora, prioridad). |
| `PATCH` | `/api/tasks/:id/status` | Bearer Token | Actualización optimista de estado (`1=Pendiente`, `2=En progreso`, `3=Hecha`). |
| `DELETE` | `/api/tasks/:id` | Bearer Token | Eliminación de tarea (restringido al autor o supervisor bajo RLS). |
| `POST` | `/api/users` | Rol Supervisor | Alta de nuevo colaborador con rol en Supabase Auth. |
| `GET` | `/api/users` | Rol Supervisor | Listado de colaboradores con métricas de productividad. |
| `GET` | `/api/users/:id/tasks` | Rol Supervisor | Drill-down de tareas asociadas a un colaborador específico. |
| `DELETE` | `/api/users/:id` | Rol Supervisor | Eliminación completa en cascada (`admin_delete_user`). |
| `GET` | `/api/chat/history` | Bearer Token | Recuperación del historial de mensajes del usuario. |
| `POST` | `/api/chat` | Bearer Token | Conversación con Nora con Tool Calling de Google Gemini. |
| `POST` | `/api/chat/confirm-action` | Bearer Token | Confirmación o cancelación de acciones destructivas pendientes. |
| `GET` | `/api/audit-logs` | Rol Supervisor | Bitácora de auditoría con paginación server-side y filtros. |

---

## 🛠️ 8. Guía de Despliegue en Servidor de Producción (Visar / Linux)

### Prerrequisitos en el Servidor:
* Servidor Ubuntu Linux (`159.203.103.8`) con Nginx, Deno 2.x y certificados SSL activos.
* Llave SSH autorizada en `~/.ssh/id_ed25519_visar`.

### Despliegue Automatizado en 1 Solo Paso:
Desde la raíz del proyecto ejecuta en PowerShell:
```powershell
.\scripts\deploy-visar.ps1
```
*(O en Linux/macOS: `python scripts/deploy_remote.py`)*

El script realiza automáticamente:
1. Compilación de producción de Angular PWA (`npm run build`).
2. Sincronización de estáticos en `/var/www/nora.vis7ar.com/dist/nora/browser/`.
3. Sincronización del backend Deno y `.env` en `/var/www/nora.vis7ar.com/backend/`.
4. Recarga del servicio systemd `/etc/systemd/system/nora-backend.service`.
5. Recarga en caliente de Nginx (`nginx -t && systemctl reload nginx`).

### Comandos de Operación y Monitoreo en el Servidor:
```bash
# Ver estado del backend
systemctl status nora-backend

# Logs en tiempo real
journalctl -u nora-backend -f

# Reiniciar backend
systemctl restart nora-backend

# Comprobar salud local
curl -s http://127.0.0.1:3001/api/health
```

---

## 🔮 9. Roadmap de Producto y Futuros Features (Pendientes Identificados)

### Pendientes Funcionales del Alcance (Backlog Priorizado):
1. **Pestaña de Auto-Registro en Login (`RF-01` UI):** Añadir un selector *"Iniciar Sesión / Registrarse"* en `pwa/src/app/features/auth/login.component.html` conectado al endpoint ya implementado `POST /api/auth/register` en Supabase Auth.
2. **Botón y Modal de Creación Manual de Tareas (`RF-05` UI):** Incorporar en la vista de Agenda un botón *"+ Nueva Tarea"* con formulario directo (título, fecha, hora, prioridad, responsable) validado por campo, complementando el modelo AI-First conversacional y el modal de edición existente (`POST /api/tasks` ya activo en backend).
3. **Service Worker Activo y App Icons PNG 192/512 (`RF-23`, `RF-24`):** Registrar un Service Worker (`sw.js` o `@angular/pwa`) para caché estática del App Shell cuando se abra sin red desde cero, junto con iconos PNG rasterizados dedicados `192x192` y `512x512` además del SVG actual.
4. **Etiquetas y Proyectos Jerárquicos N:M (`RF-11`):** Soporte para categorizar tareas por proyectos o áreas con tableros Kanban y filtros por etiqueta.
5. **Interacción y Dictado por Voz (`RF-21` - Web Speech API & Whisper):** Conectar el ícono `mic-voice.svg` en el chat de Nora para dictado en lenguaje natural en tiempo real.
6. **Notificaciones Push Proactivas (`RF-26` - Web Push VAPID / WhatsApp):** Recordatorios antes de reuniones, vencimientos de tareas críticas y avisos de reasignación.

### Evolución Corporativa de Producto:
7. **Sincronización Bidireccional de Calendarios (Google Calendar, Outlook, Apple Calendar):** Integración nativa vía protocolos CalDAV y APIs oficiales.
8. **Briefing Ejecutivo Matutino y Agendamiento Grupal Inteligente:** Resumen diario de prioridades y cruce automático de disponibilidad entre colaboradores.

---

## ⚡ 10. Mejoras Posibles, Auditoría de Seguridad y Optimizaciones de Arquitectura

### 🛡️ Hallazgos de la Auditoría de Seguridad y Puntos de Mejora (Hardening):
Tras auditar el backend Deno (`auth`, `tasks`, `chat`, `audit.middleware.ts`, `supabase.ts`), la capa PWA y las migraciones SQL RLS, se documentan los siguientes hallazgos críticos y su plan de remediación:

1. **SEC-N01 — Eliminación del Fallback `X-User-Id` y Verificación Criptográfica de JWT en Middleware:**
   - *Hallazgo actual:* `extractUserIdFromRequest()` (`backend/src/config/supabase.ts`) decodifica el payload Base64 del JWT sin validar firma en la capa Deno (delegando la validación a PostgREST), y además admite el header no firmado `X-User-Id` como último recurso. Aunque en rutas principales PostgREST rechaza tokens inválidos y RLS exige `auth.uid()`, endpoints que dependan solo de `extractUserIdFromRequest` o registros de `auditMiddleware` podrían aceptar un `X-User-Id` forjado.
   - *Mejora obligatoria:* Eliminar completamente la lectura de `X-User-Id` y validar criptográficamente todos los JWT entrantes (contra JWKS de Supabase o `supabase.auth.getUser(token)`) en un middleware global de autenticación antes de ejecutar cualquier ruta protegida.
2. **SEC-N02 — Sanitización Estricta contra Inyección de Filtros PostgREST (`.or(...)`):**
   - *Hallazgo actual:* En `backend/src/routes/tasks.route.ts` y `findMatchingTasks()` de `backend/src/services/gemini.service.ts`, el query parameter `user_id` y los términos de búsqueda se interpolan directamente en cadenas `.or(\`title.ilike.%${term}%,...\`)` sin escapar comas ni paréntesis.
   - *Mejora obligatoria:* Validar `user_id` con `z.string().uuid()` y sanitizar/escapar cualquier carácter reservado de PostgREST (`,`, `.`, `(`, `)`) antes de construir filtros dinámicos, o migrar las búsquedas híbridas a funciones RPC parametrizadas en PostgreSQL.
3. **SEC-N03 — Prevención de Escalamiento de Rol por Patrón de Correo en `handle_new_user()`:**
   - *Hallazgo actual:* La función trigger `public.handle_new_user()` definida en `supabase/migrations/0006_security_rls_hardening.sql` asigna automáticamente `role = 2 (Supervisor)` si `new.email ilike '%supervisor%' or new.email ilike '%ana@%'`. En un entorno abierto de registro público, un atacante podría registrar un correo como `mi_supervisor@dominio.com` y obtener privilegios de Supervisor al instante.
   - *Mejora obligatoria:* Remover la heurística basada en patrones de email para que todo auto-registro público nazca estrictamente con `role = 1 (Miembro)`, permitiendo promociones a Supervisor únicamente mediante una función administrativa ejecutada por un Supervisor existente autenticado.
4. **SEC-N04 — Rate Limiting en `/api/chat` / Auth y Guardrails Anti-Prompt Injection:**
   - *Hallazgo actual:* No existe limitación de peticiones por minuto hacia `/api/chat` ni `/api/auth/login`, exponiendo la cuota de Google Gemini a agotamiento y las cuentas a ataques de fuerza bruta. Adicionalmente, los títulos/descripciones almacenados en tareas de equipo entran al contexto de herramientas de Gemini sin delimitación explícita.
   - *Mejora obligatoria:* Agregar middleware de Rate Limiting por usuario/IP, cuotas diarias de tokens en Gemini y delimitación estructurada de datos de usuario (*untrusted data fencing*) en el `systemInstruction` del agente.
5. **SEC-N05 — Lista Blanca Exacta de CORS, Migración a Cookies `HttpOnly` y Sanitización Completa de Auditoría:**
   - *Hallazgo actual:* `backend/main.ts` autoriza CORS evaluando `origin.includes("vis7ar.com")` (vulnerable a dominios trampa que incluyan ese texto), los tokens se guardan en `localStorage` y `auditMiddleware` intenta hacer `c.req.json()` sin validar `Content-Type: application/json`.
   - *Mejora obligatoria:* Usar coincidencia exacta o regex anclado para orígenes permitidos, migrar JWTs hacia cookies `HttpOnly; Secure; SameSite=Strict` con cabeceras `CSP`/`HSTS`, y condicionar el parseo de auditoría estrictamente a `application/json`.

### ⚙️ Optimizaciones de Arquitectura y Escalabilidad:
1. **Streaming en Tiempo Real (Server-Sent Events / WebSockets):** Transmisión token a token de las respuestas del asistente Nora en el chat para reducir la percepción de latencia y mejorar la fluidez de interacción.
2. **Memoria Semántica a Largo Plazo con RAG Vectorial (`pgvector`):** Indexación vectorial del historial de conversaciones, notas corporativas y proyectos pasados para que Nora recuerde contexto extendido y preferencias del usuario.
3. **Caché en Memoria y Rate Limiting Adaptativo (Redis / Upstash):** Protección de cuotas de la API de Google Gemini, aceleración de consultas recurrentes de agenda y limitación inteligente de peticiones por usuario.
4. **Soporte de Modelos LLM Locales / On-Premise (Ollama / vLLM):** Capacidad de alternar entre Gemini en la nube y modelos locales (Llama 3 / Mistral) para entornos con normativas estrictas de soberanía de datos.
5. **Pruebas E2E Automatizadas con Playwright:** Suite integral de pruebas end-to-end simulando la navegación de usuarios, flujos conversacionales y verificación de accesibilidad WCAG 2.1 AA.

---

## 📄 11. Licencia y Gobernanza

Proyecto desarrollado bajo estándares empresariales de arquitectura limpia, patrones de alta disponibilidad y mejores prácticas de ingeniería de software para productividad corporativa y automatización con IA conforme a los lineamientos de Visar.