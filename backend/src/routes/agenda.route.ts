import { Hono, type Context } from "hono";
import { extractUserIdFromRequest, getSupabaseForRequest } from "../config/supabase.ts";

export const agendaRouter = new Hono();

agendaRouter.use("*", async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No autenticado: se requiere token Bearer válido" }, 401);
  }
  await next();
});

// GET /api/agenda — Tareas organizadas para el calendario (scoped por RLS del usuario)
agendaRouter.get("/", async (c: Context) => {
  const year = c.req.query("year") || new Date().getFullYear().toString();
  const month = c.req.query("month") || (new Date().getMonth() + 1).toString().padStart(2, "0");
  const queryUserId = c.req.query("user_id");

  const db = getSupabaseForRequest(c);
  const currentUserId = extractUserIdFromRequest(c);

  let query = db
    .from("tasks")
    .select(`
      id,
      owner_id,
      assignee_id,
      title,
      description,
      due_date,
      due_time,
      priority,
      status,
      responsible_name,
      source,
      completed_at
    `)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true });

  if (queryUserId) {
    query = query.or(`owner_id.eq.${queryUserId},assignee_id.eq.${queryUserId}`);
  } else if (currentUserId) {
    const { data: isSup } = await db.rpc("is_supervisor");
    if (!isSup) {
      query = query.or(`owner_id.eq.${currentUserId},assignee_id.eq.${currentUserId}`);
    }
  }

  const { data: tasks, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const groupedByDate: Record<string, typeof tasks> = {};
  for (const t of tasks || []) {
    const d = t.due_date || "sin_fecha";
    if (!groupedByDate[d]) groupedByDate[d] = [];
    groupedByDate[d].push(t);
  }

  return c.json({
    year,
    month,
    total_tasks: tasks?.length || 0,
    tasks_by_date: groupedByDate,
    raw_tasks: tasks || [],
  });
});
