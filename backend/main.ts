import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ENV } from "./src/config/env.ts";
import { auditMiddleware } from "./src/middleware/audit.middleware.ts";
import { healthRouter } from "./src/routes/health.route.ts";

const app = new Hono();

// Middlewares globales
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin: string | undefined) => {
      // Permitir localhost, IP directa de Visar y dominio oficial
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
    allowHeaders: ["Content-Type", "Authorization", "X-Active-Role"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: true,
  })
);

// Middleware de auditoría desacoplada (registra DML y lecturas sin triggers en BD)
app.use("/api/*", auditMiddleware());

// Rutas base
app.route("/api/health", healthRouter);

// Ruta raíz informativa
app.get("/", (c: Context) => {
  return c.json({
    name: "Nora Backend API",
    version: "0.1.0",
    docs: "/api/health",
  });
});

console.log(`🚀 Nora Deno Backend corriendo en puerto ${ENV.PORT}...`);

Deno.serve({ port: ENV.PORT }, app.fetch);
