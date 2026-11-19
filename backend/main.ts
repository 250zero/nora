import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ENV } from "./src/config/env.ts";
import { auditMiddleware } from "./src/middleware/audit.middleware.ts";
import { agendaRouter } from "./src/routes/agenda.route.ts";
import { chatRouter } from "./src/routes/chat.route.ts";
import { healthRouter } from "./src/routes/health.route.ts";
import { tasksRouter } from "./src/routes/tasks.route.ts";
import { usersRouter } from "./src/routes/users.route.ts";

const app = new Hono();

// Middlewares globales
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin: string | undefined) => {
      if (
        !origin ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("vis7ar.com")
      ) {
        return origin;
      }
      return "https://nora.vis7ar.com";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Active-Role", "X-User-Id"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: true,
  })
);

// Middleware de auditoría desacoplada (registra DML y lecturas sin triggers en BD)
app.use("/api/*", auditMiddleware());

// Rutas de la API
app.route("/api/health", healthRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/agenda", agendaRouter);
app.route("/api/users", usersRouter);
app.route("/api/chat", chatRouter);

// Ruta raíz informativa
app.get("/", (c: Context) => {
  return c.json({
    name: "Nora Backend API",
    version: "0.4.0",
    endpoints: [
      "/api/health",
      "/api/agenda",
      "/api/tasks",
      "/api/tasks/:id/detail",
      "/api/users",
      "/api/users/:id/tasks",
      "/api/chat",
      "/api/chat/confirm-action",
    ],
  });
});

console.log(`🚀 Nora Deno Backend corriendo en puerto ${ENV.PORT}...`);

Deno.serve({ port: ENV.PORT }, app.fetch);
