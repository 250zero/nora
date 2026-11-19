Prueba técnica 1: Asistente de tareas con IA (PWA) 

# Prueba técnica 1: Asistente de tareas con IA (PWA) 

Nov 19, 2026 

## Objetivo y contexto 

Construir en 8 horas o menos una PWA móvil donde una persona escribe en lenguaje natural lo que tiene pendiente y un agente de IA crea y gestiona las tareas en una base de datos Supabase. 

Escenario: eres el apoyo de operaciones de una pequeña empresa. El equipo recibe pedidos por mensaje, como "cobrarle a Juan el viernes y mandarle la cotización a Ana mañana, urgente", y hoy se pierden en chats. Tu app debe convertir esos mensajes en tareas ordenadas, consultables y con fecha. 

La prueba mide cinco cosas: base de datos y seguridad, experiencia móvil y PWA, integración de IA con herramientas (agente), criterio para priorizar y comunicación. 

## Reglas de la prueba 

- Tiempo máximo: 8 horas, incluidos 30 minutos iniciales para leer y escribir un plan. Stack: libre en el frontend (React, Next, Vue, Svelte u otro). Es obligatorio usar Supabase (Postgres y Auth) y publicar la app en una URL pública. 

- IA: puede usar asistentes de código (Claude, Cursor, Copilot). En la revisión final deberá explicar cada parte de lo que entregó. 

- API de IA: Claude, OpenAI o Gemini. La llave nunca va en el código del navegador; debe vivir en una Edge Function o backend. 

- Código: repositorio Git con commits frecuentes, no uno solo al final. 

- Preguntas: puede hacerle preguntas al evaluador en cualquier momento. Preguntar bien suma puntos. 

- Alcance: es mejor hacer menos funciones y que funcionen que muchas a medias. Lo que no alcance a hacer debe quedar anotado en el README. 

Page 1 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

## Requerimientos funcionales 

La app está completa cuando cumple todos los requerimientos Obligatorios. Los Deseables sirven para diferenciar a los candidatos. 

### A. Cuentas y seguridad 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>01|Registro e inicio de sesión con<br>email y contraseña (Supabase<br>Auth)|Un usuario nuevo se registra,<br>cierra sesión y vuelve a entrar|Obligatorio|
|RF-<br>02|Rutas protegidas|Sin sesión, cualquier pantalla<br>redirige al login|Obligatorio|
|RF-<br>03|Aislamiento de datos por usuario<br>con políticas RLS|Con dos usuarios, A no puede<br>ver ni modificar tareas de B,<br>tampoco llamando la API<br>directamente|Obligatorio|
|RF-<br>04|Perfil con nombre visible|El nombre aparece en el<br>encabezado|Deseable|



### B. Gestión de tareas 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>05|Crear tarea manual con título,<br>descripción, fecha límite,<br>prioridad (baja, media, alta),<br>responsable y estado|Se guarda en Supabase y<br>aparece en la lista sin recargar|Obligatorio|
|RF-|Vistas Hoy, Próximas, Vencidas y|Cada tarea cae en la vista|Obligatorio|
|06|Completadas|correcta según su fecha y estado||
|RF-|Editar y eliminar tareas|Eliminar pide confirmación; los|Obligatorio|
|07||cambios persisten al recargar||
|RF-|Cambiar estado (pendiente, en|El cambio se refleja de inmediato|Obligatorio|
|08|progreso, hecha) con un toque|y se guarda||



Page 2 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>09|Filtros por estado, prioridad y<br>responsable, y búsqueda por<br>texto|Los filtros se combinan entre sí|Deseable|
|RF-<br>10|Validación con mensajes claros|Título vacío o fecha inválida<br>muestran el error junto al campo|Obligatorio|
|. Asi<br>RF-<br>11|stente de IA (agente)<br>Etiquetas o proyectos para<br>agrupar tareas|Se puede filtrar por etiqueta|Deseable|
|ID|Requerimiento|Criterio de aceptación|Prioridad|
|RF-<br>12|Caja de chat donde se escribe en<br>lenguaje natural|"Recuérdame cobrarle a Juan<br>el viernes" crea una tarea con<br>título y fecha correctos|Obligatorio|
|RF-<br>13|Varias tareas en un solo mensaje|"Cobrar a Juan el viernes y<br>cotización a Ana mañana,<br>urgente" crea 2 tareas, con la<br>prioridad alta donde<br>corresponde|Obligatorio|
|RF-<br>14|El agente usa herramientas (tool<br>calling): crear_tarea, listar_tareas,<br>actualizar_tarea, completar_tarea|El modelo no escribe en la<br>base de datos; el backend<br>ejecuta cada herramienta y<br>valida sus parámetros|Obligatorio|
|RF-<br>15|Consultas sobre las tareas<br>existentes|"¿Qué tengo pendiente esta<br>semana?" responde con datos<br>reales de la base, sin inventar|Obligatorio|
|RF-<br>16|Modificaciones por chat|"Marca como hecha la de<br>Juan" funciona; si hay dos<br>tareas de Juan, el agente|Obligatorio|
|||pregunta cuál antes de actuar||



### C. Asistente de IA (agente) 

Page 3 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>17|Confirmación antes de acciones<br>destructivas y resumen de lo<br>ejecutado|Eliminar por chat pide<br>confirmación; tras crear,<br>muestra "Creé 2 tareas" con<br>enlace a cada una|Obligatorio|
|RF-<br>18|Manejo de fallos de la IA|Si la API cae o responde algo<br>inválido, se muestra un error<br>claro, se conserva el texto<br>escrito y se puede reintentar<br>o crear la tarea a mano|Obligatorio|
|RF-<br>19|Fechas relativas en la zona horaria<br>del usuario (por defecto<br>America/Santo_Domingo)|"Mañana" y "el viernes" se<br>resuelven a la fecha correcta,<br>incluso cerca de medianoche|Obligatorio|
|RF-<br>20|Historial de la conversación<br>guardado|Al reabrir la app se ve la<br>conversación anterior|Deseable|
|RF-<br>21|Dictado por voz (Web Speech API)|El botón de micrófono<br>convierte voz en texto en el<br>chat|Deseable|



### D. Móvil y PWA 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>22|Diseño mobile-first|Usable en 360 px de ancho, con<br>botones táctiles cómodos y sin<br>scroll horizontal|Obligatorio|
|RF-<br>23|App instalable: manifest con<br>nombre, íconos 192 y 512 px y<br>color de tema|Se puede añadir a la pantalla de<br>inicio y abre en modo standalone|Obligatorio|
|RF-<br>24|Service worker con soporte sin<br>conexión básico|Sin red, la app abre y muestra las<br>últimas tareas cargadas con un<br>aviso de "sin conexión"|Obligatorio|
|RF-|Estados de carga, vacío y error en|Ninguna pantalla queda en|Obligatorio|
|25|todas las pantallas|blanco o congelada||



Page 4 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-|Recordatorios o notificaciones|Llega una notificación al celular|Deseable|
|26|push de tareas por vencer|antes de la fecha límite||



### E. Despliegue y calidad 

|ID|Requerimiento|Criterio de aceptación|Prioridad|
|---|---|---|---|
|RF-<br>27|Publicación en URL pública<br>(Vercel, Netlify o similar)|El evaluador abre el enlace desde<br>su celular y la app funciona|Obligatorio|
|RF-<br>28|Llaves de la IA fuera del<br>navegador|No aparecen en el código ni en<br>las peticiones del cliente|Obligatorio|
|RF-<br>29|Esquema de base de datos<br>versionado en el repositorio|El SQL o las migraciones<br>permiten recrear las tablas<br>desde cero|Obligatorio|
|RF-<br>30|Pruebas automáticas mínimas|Al menos 3 pruebas sobre las<br>herramientas del agente o el<br>manejo de fechas|Deseable|



## Plan de tareas sugerido 

Los tiempos son una guía, no una obligación. El candidato decide su propio orden y se evalúa si lo justifica. 

### Fase 0: plan (0:00 a 0:30) 

- Leer el brief y escribir un plan de una página con lo que hará y lo que dejará fuera Crear el repositorio y el proyecto de Supabase 

- Escribir las dudas para el evaluador 

### Fase 1: base (0:30 a 1:30) 

- Crear el proyecto frontend y conectar Supabase 

- Implementar registro, inicio de sesión y rutas protegidas (RF-01, RF-02) 

- Diseñar las tablas (por ejemplo tasks y chat_messages) y las políticas RLS (RF-03) 

Page 5 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

### Fase 2: tareas manuales (1:30 a 3:30) 

CRUD de tareas con validación (RF-05, RF-07, RF-10) 

- Vistas Hoy, Próximas, Vencidas y Completadas (RF-06) 

- Cambio de estado con un toque (RF-08) 

- Diseño mobile-first con estados de carga, vacío y error (RF-22, RF-25) 

### Fase 3: cambio sorpresa (3:30 a 4:00) 

Recibir el cambio, estimar el impacto y avisar al evaluador qué hará y qué no 

### Fase 4: agente (4:00 a 6:30) 

- Edge Function o backend que recibe el mensaje y llama a la API de IA (RF-28) Definir las herramientas del agente y ejecutarlas en el servidor con validación (RF-14) Crear tareas desde texto, incluidas varias en un mensaje y fechas relativas (RF-12, RF13, RF-19) 

- Consultar y modificar tareas por chat, con pregunta ante ambigüedad y confirmación al eliminar (RF-15, RF-16, RF-17) 

- Manejo de errores de la IA (RF-18) 

### Fase 5: PWA y despliegue (6:30 a 7:30) 

- Manifest, íconos y service worker con modo sin conexión básico (RF-23, RF-24) Publicar en URL pública y probar la instalación en un celular real (RF-27) 

### Fase 6: cierre (7:30 a 8:00) 

- README con instrucciones, decisiones y lista de lo que quedó fuera 

- Video de 3 a 5 minutos mostrando la app en el celular 

- Crear dos usuarios de prueba para el evaluador 

## Cambio sorpresa 

A las 3:30 h el evaluador entrega este mensaje, sin avisar antes: "El jefe quiere ver las tareas de todo el equipo. Necesitamos un rol de supervisor que vea todas las tareas, se las pueda asignar a otros usuarios y filtre por persona." 

Alternativas si se quiere variar la prueba: 

Page 6 of 7 

Prueba técnica 1: Asistente de tareas con IA (PWA) 

Tareas recurrentes (por ejemplo "todos los lunes"). 

Adjuntar una foto a una tarea con Supabase Storage. 

## Entregables 

1. URL pública de la app, probada en un celular. 

2. Repositorio Git con el historial de commits y el SQL o las migraciones de la base de datos. 

3. README con instrucciones para correrla, decisiones tomadas, y una lista honesta de lo que quedó fuera. 

4. Dos usuarios de prueba (con contraseña) para que el evaluador compruebe el aislamiento de datos. 

5. Video de 3 a 5 minutos mostrando la app instalada en el celular y una conversación con el asistente. 

6. Revisión en vivo de 20 minutos: el candidato explica una decisión técnica y hace un cambio pequeño pedido por el evaluador. 

Page 7 of 7 

