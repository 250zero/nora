import { Hono, type Context } from "hono";
import { supabase } from "../config/supabase.ts";

export const auditRouter = new Hono();

// Middleware: Solo accesible para Supervisor / Admin
auditRouter.use("*", async (c: Context, next: () => Promise<void>) => {
  const activeRole = c.req.header("X-Active-Role");
  if (activeRole !== "2") {
    return c.json({ error: "Acceso restringido: requiere rol Supervisor/Admin" }, 403);
  }
  await next();
});

// GET /api/audit-logs — Listado de trazabilidad y eventos de auditoría
auditRouter.get("/", async (c: Context) => {
  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const action = c.req.query("action");

  let query = supabase
    .from("audit_logs")
    .select("id, user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq("action", action);
  }

  const { data, count, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({
    total: count || 0,
    limit,
    offset,
    logs: data || [],
  });
});
