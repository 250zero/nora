import type { Context, MiddlewareHandler, Next } from "hono";
import {
  extractUserIdFromRequest,
  getSupabaseForRequest,
  getSupabaseUserClient,
  supabase,
} from "../config/supabase.ts";

const UUID_IN_PATH_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function sanitizePayload(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const secretKey of ["password", "token", "refreshToken", "access_token", "refresh_token"]) {
    if (secretKey in clone) {
      clone[secretKey] = "[REDACTED]";
    }
  }
  return clone;
}

export const auditMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    // Capturar y sanitizar IP para tipo inet nativo de PostgreSQL (7 o 19 bytes)
    const rawIp =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip") ||
      "127.0.0.1";

    const cleanIp =
      rawIp.includes(":") && !rawIp.includes("[") && rawIp.indexOf(":") === rawIp.lastIndexOf(":")
        ? rawIp.split(":")[0]
        : rawIp;

    const rawUa = c.req.header("user-agent") || "Unknown";
    const userAgent = rawUa.length > 500 ? rawUa.substring(0, 500) : rawUa;

    let reqBody: unknown = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        reqBody = sanitizePayload(await c.req.json());
      } catch {
        // Ignorar cuerpos no JSON
      }
    }

    // Ejecutar handler de negocio primero
    await next();

    const actionMap: Record<string, number> = {
      POST: 1,
      PUT: 2,
      PATCH: 2,
      DELETE: 3,
      GET: 4,
    };
    const action = actionMap[method] || 4;

    // Auditar peticiones relevantes exitosas (excluyendo healthcheck)
    if (c.res.status >= 200 && c.res.status < 400 && !path.includes("/health")) {
      const userId = extractUserIdFromRequest(c);
      const pathMatch = path.match(UUID_IN_PATH_REGEX);
      const recordId = (c.get("auditRecordId") as string | undefined) || (pathMatch ? pathMatch[0] : null);
      const auditToken = c.get("auditToken") as string | undefined;
      const durationMs = Date.now() - startTime;

      const dbClient = auditToken
        ? getSupabaseUserClient(`Bearer ${auditToken}`)
        : c.req.header("Authorization")
        ? getSupabaseForRequest(c)
        : supabase;

      // Inserción asíncrona no bloqueante
      (async () => {
        try {
          const tableName = (path.split("/")[2] || "api").substring(0, 63);
          const { error } = await dbClient.from("audit_logs").insert({
            user_id: auditToken || c.req.header("Authorization") ? userId : null,
            table_name: tableName,
            record_id: recordId,
            action: action,
            old_data: null,
            new_data: reqBody
              ? { payload: reqBody, status: c.res.status, duration_ms: durationMs }
              : { status: c.res.status, duration_ms: durationMs },
            ip_address: cleanIp,
            user_agent: userAgent,
          });
          if (error) {
            console.error("⚠️ Error guardando audit_log:", error.message);
          }
        } catch (err) {
          console.error("⚠️ Excepción en auditMiddleware:", err);
        }
      })();
    }
  };
};
