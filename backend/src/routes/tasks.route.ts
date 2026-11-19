import { Hono, type Context } from "hono";
import { z } from "zod";
import { supabase } from "../config/supabase.ts";

export const tasksRouter = new Hono();

// Schema de validación Zod para crear/editar tareas
const taskSchema = z.object({
  title: z.string().min(1, "El título es obligatorio").max(200),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato debe ser YYYY-MM-DD").optional().nullable(),
  due_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato debe ser HH:mm o HH:mm:ss").optional().nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  responsible_name: z.string().max(80).optional().nullable(),
  source: z.union([z.literal(1), z.literal(2)]).default(1),
  assignee_id: z.string().uuid().optional().nullable(),
});

// GET /api/tasks — Listado de tareas con filtros
tasksRouter.get("/", async (c: Context) => {
  const statusParam = c.req.query("status");
  const userId = c.req.query("user_id");
  const search = c.req.query("search");

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
      completed_at,
      created_at,
      updated_at
    `)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (statusParam) {
    const statusNum = Number(statusParam);
    if (!isNaN(statusNum)) query = query.eq("status", statusNum);
  }

  if (userId) {
    query = query.or(`owner_id.eq.${userId},assignee_id.eq.${userId}`);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ tasks: data || [] });
});

// GET /api/tasks/:id/detail — Ficha estándar con trazabilidad detallada
tasksRouter.get("/:id/detail", async (c: Context) => {
  const taskId = c.req.param("id");

  // Obtener la tarea con datos del perfil creador
  const { data: task, error: taskError } = await supabase
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
      completed_at,
      created_at,
      updated_at
    `)
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return c.json({ error: "Tarea no encontrada" }, 404);
  }

  // Obtener nombre del creador en profiles
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", task.owner_id)
    .single();

  // Obtener el registro de auditoría de creación para extraer IP y User-Agent
  const { data: auditLog } = await supabase
    .from("audit_logs")
    .select("ip_address, user_agent, created_at")
    .eq("table_name", "tasks")
    .eq("record_id", taskId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return c.json({
    task,
    audit_detail: {
      creator_name: ownerProfile?.display_name || "Usuario del Sistema",
      creator_email: ownerProfile?.email || "",
      created_at: task.created_at,
      source_channel: task.source === 2 ? "Asistente IA Nora (Chat Lenguaje Natural)" : "PWA Web / Móvil Manual",
      device_info: auditLog?.user_agent || "PWA Client",
      ip_address: auditLog?.ip_address || "127.0.0.1",
      last_updated: task.updated_at,
    },
  });
});

// POST /api/tasks — Crear tarea
tasksRouter.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = taskSchema.parse(body);

    const ownerId = c.req.header("X-User-Id") || "a0000000-0000-0000-0000-000000000001";

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        ...validated,
        owner_id: ownerId,
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ task: data }, 201);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return c.json({ error: "Datos inválidos", issues: err.errors }, 400);
    }
    return c.json({ error: "Error interno" }, 500);
  }
});

// PATCH /api/tasks/:id/status — Toggle optimista de estado
tasksRouter.patch("/:id/status", async (c: Context) => {
  const taskId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const newStatus = Number(body.status);

  if (![1, 2, 3].includes(newStatus)) {
    return c.json({ error: "Estado inválido (debe ser 1=pendiente, 2=en_progreso, 3=hecha)" }, 400);
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: newStatus,
      completed_at: newStatus === 3 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ task: data });
});

// PUT /api/tasks/:id — Actualizar tarea
tasksRouter.put("/:id", async (c: Context) => {
  const taskId = c.req.param("id");
  try {
    const body = await c.req.json();
    const validated = taskSchema.partial().parse(body);

    const { data, error } = await supabase
      .from("tasks")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ task: data });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return c.json({ error: "Datos inválidos", issues: err.errors }, 400);
    }
    return c.json({ error: "Error interno" }, 500);
  }
});

// DELETE /api/tasks/:id — Eliminar tarea
tasksRouter.delete("/:id", async (c: Context) => {
  const taskId = c.req.param("id");

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true, deleted_id: taskId });
});
