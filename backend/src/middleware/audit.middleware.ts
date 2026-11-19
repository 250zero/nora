import type { Context, MiddlewareHandler, Next } from "hono";
import { supabase } from "../config/supabase.ts";

export const auditMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    // Capturar metadatos reales de red y cliente
    const ipAddress =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip") ||
      "127.0.0.1";
    const userAgent = c.req.header("user-agent") || "Unknown";

    // Clonar body para auditoría en peticiones de mutación
    let reqBody: unknown = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        reqBody = await c.req.json();
      } catch {
        // En caso de multipart o vacío
      }
    }

    // Ejecutar el handler de negocio primero
    await next();

    // Mapeo de método HTTP a enum de auditoría (1=INSERT, 2=UPDATE, 3=DELETE, 4=SELECT)
    const actionMap: Record<string, number> = {
      POST: 1,
      PUT: 2,
      PATCH: 2,
      DELETE: 3,
      GET: 4,
    };
    const action = actionMap[method] || 4;

    // Solo auditar si la respuesta fue exitosa y no es healthcheck
    if (c.res.status >= 200 && c.res.status < 400 && !path.includes("/health")) {
      const user = c.get("user") as { id: string } | undefined;
      const durationMs = Date.now() - startTime;

      // Inserción asíncrona en audit_logs sin bloquear la respuesta
      (async () => {
        try {
          const tableName = path.split("/")[2] || "api";
          await supabase.from("audit_logs").insert({
            user_id: user?.id || null,
            table_name: tableName,
            action: action,
            old_data: null,
            new_data: reqBody
              ? { payload: reqBody, status: c.res.status, duration_ms: durationMs }
              : { status: c.res.status, duration_ms: durationMs },
            ip_address: ipAddress,
            user_agent: userAgent,
          });
        } catch (err) {
          console.error("⚠️ Error en auditMiddleware:", err);
        }
      })();
    }
  };
};
