import { Hono, type Context } from "hono";
import { getSupabaseForRequest } from "../config/supabase.ts";

export const auditRouter = new Hono();

const ACTION_LABEL_MAP: Record<number, "INSERT" | "UPDATE" | "DELETE" | "SELECT"> = {
  1: "INSERT",
  2: "UPDATE",
  3: "DELETE",
  4: "SELECT",
};

const ACTION_CODE_MAP: Record<string, number> = {
  INSERT: 1,
  UPDATE: 2,
  DELETE: 3,
  SELECT: 4,
};

// Middleware: Verifica JWT válido y rol Supervisor real contra Postgres
auditRouter.use("*", async (c: Context, next: () => Promise<void>) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No autenticado: se requiere token Bearer válido" }, 401);
  }

  const db = getSupabaseForRequest(c);
  const { data: isSup, error } = await db.rpc("is_supervisor");
  if (error) {
    return c.json({ error: "Token inválido o expirado" }, 401);
  }
  if (!isSup) {
    return c.json({ error: "Acceso restringido: requiere rol Supervisor/Admin" }, 403);
  }

  await next();
});

// GET /api/audit-logs — Listado de trazabilidad y eventos de auditoría (con filtro por usuario y acción)
auditRouter.get("/", async (c: Context) => {
  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Math.max(Number(c.req.query("offset") || "0"), 0);
  const actionParam = c.req.query("action");
  const filterUserId = c.req.query("user_id");

  const db = getSupabaseForRequest(c);

  let query = db
    .from("audit_logs")
    .select(
      "id, user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actionParam) {
    const mappedCode = ACTION_CODE_MAP[actionParam.toUpperCase()] || Number(actionParam);
    if (!isNaN(mappedCode) && [1, 2, 3, 4].includes(mappedCode)) {
      query = query.eq("action", mappedCode);
    }
  }

  if (filterUserId) {
    query = query.eq("user_id", filterUserId);
  }

  const { data, count, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const normalizedLogs = (data || []).map((row) => ({
    ...row,
    action_code: row.action,
    action: ACTION_LABEL_MAP[row.action as number] || "SELECT",
  }));

  return c.json({
    total: count || 0,
    limit,
    offset,
    logs: normalizedLogs,
  });
});
