import { Hono, type Context } from "hono";
import { supabase } from "../config/supabase.ts";

export const agendaRouter = new Hono();

// GET /api/agenda — Tareas organizadas para el calendario
agendaRouter.get("/", async (c: Context) => {
  const year = c.req.query("year") || new Date().getFullYear().toString();
  const month = c.req.query("month") || (new Date().getMonth() + 1).toString().padStart(2, "0");
  const queryUserId = c.req.query("user_id");

  const headerUserId = c.req.header("X-User-Id");
  const headerRole = Number(c.req.header("X-Active-Role")) || 1;

  let query = supabase
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

  // Si es Miembro (rol 1), SIEMPRE se aísla por su user_id
  if (headerRole === 1 && headerUserId) {
    query = query.or(`owner_id.eq.${headerUserId},assignee_id.eq.${headerUserId}`);
  } else if (queryUserId) {
    // Si es Supervisor (rol 2) y filtra por un usuario específico
    query = query.or(`owner_id.eq.${queryUserId},assignee_id.eq.${queryUserId}`);
  }

  const { data: tasks, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Agrupar tareas por fecha (YYYY-MM-DD)
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
