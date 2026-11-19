import { Hono, type Context } from "hono";
import { supabase } from "../config/supabase.ts";

export const agendaRouter = new Hono();

// GET /api/agenda — Tareas organizadas para el calendario
agendaRouter.get("/", async (c: Context) => {
  const year = c.req.query("year") || new Date().getFullYear().toString();
  const month = c.req.query("month") || (new Date().getMonth() + 1).toString().padStart(2, "0");
  const userId = c.req.query("user_id");

  // Rango de fechas aproximado para el mes
  const startDate = `${year}-${month.padStart(2, "0")}-01`;
  const endDate = `${year}-${month.padStart(2, "0")}-31`;

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

  if (userId) {
    query = query.or(`owner_id.eq.${userId},assignee_id.eq.${userId}`);
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
