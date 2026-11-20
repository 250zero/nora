import { Hono, type Context } from "hono";
import { z } from "zod";
import { extractUserIdFromRequest, getSupabaseForRequest } from "../config/supabase.ts";

export const tasksRouter = new Hono();

tasksRouter.use("*", async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No autenticado: se requiere token Bearer válido" }, 401);
  }
  await next();
});

// Schema de validación Zod para crear/editar tareas
const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio")
    .max(200, "El título no puede exceder 200 caracteres"),
  description: z.string().max(2000).optional().nullable(),
  due_date: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() !== "" ? val.trim() : null))
    .refine((val) => val === null || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "La fecha debe tener formato YYYY-MM-DD",
    }),
  due_time: z
    .string()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim() === "") return null;
      const clean = val.trim();
      return clean.length === 5 ? `${clean}:00` : clean;
    }),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  responsible_name: z.string().max(80).optional().nullable(),
  source: z.union([z.literal(1), z.literal(2)]).default(1),
  assignee_id: z.string().uuid().optional().nullable(),
});

// GET /api/tasks — Listado de tareas con filtros (enforza RLS de Postgres)
tasksRouter.get("/", async (c: Context) => {
  const statusParam = c.req.query("status");
  const queryUserId = c.req.query("user_id");
  const search = c.req.query("search");

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

  if (queryUserId) {
    query = query.or(`owner_id.eq.${queryUserId},assignee_id.eq.${queryUserId}`);
  } else if (currentUserId) {
    const { data: isSup } = await db.rpc("is_supervisor");
    if (!isSup) {
      query = query.or(`owner_id.eq.${currentUserId},assignee_id.eq.${currentUserId}`);
    }
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    const statusCode = error.message.toLowerCase().includes("jwt") ? 401 : 500;
    return c.json({ error: error.message }, statusCode);
  }

  return c.json({ tasks: data || [] });
});

// GET /api/tasks/:id/detail — Ficha estándar con trazabilidad detallada
tasksRouter.get("/:id/detail", async (c: Context) => {
  const taskId = c.req.param("id");
  const db = getSupabaseForRequest(c);
  c.set("auditRecordId", taskId);

  const { data: task, error: taskError } = await db
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
    .maybeSingle();

  if (taskError || !task) {
    return c.json({ error: "Tarea no encontrada o sin acceso" }, 404);
  }

  const { data: ownerProfile } = await db
    .from("profiles")
    .select("display_name, email")
    .eq("id", task.owner_id)
    .maybeSingle();

  // Buscar primero log específico de este record_id; si no existe, fallback al último log del creador
  let { data: auditLog } = await db
    .from("audit_logs")
    .select("ip_address, user_agent, created_at")
    .eq("record_id", taskId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!auditLog) {
    const { data: creatorLog } = await db
      .from("audit_logs")
      .select("ip_address, user_agent, created_at")
      .eq("user_id", task.owner_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    auditLog = creatorLog;
  }

  const reqIp =
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "127.0.0.1";
  const reqUa = c.req.header("user-agent") || "PWA Client";

  return c.json({
    task,
    audit_detail: {
      creator_name: ownerProfile?.display_name || "Usuario del Sistema",
      creator_email: ownerProfile?.email || "",
      created_at: task.created_at,
      source_channel:
        task.source === 2 ? "Asistente IA Nora (Chat Lenguaje Natural)" : "PWA Web / Móvil Manual",
      device_info: auditLog?.user_agent || reqUa,
      ip_address: auditLog?.ip_address || reqIp,
      last_updated: task.updated_at,
    },
  });
});

// POST /api/tasks — Crear tarea
tasksRouter.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = taskSchema.parse(body);

    const db = getSupabaseForRequest(c);
    const ownerId = extractUserIdFromRequest(c);
    if (!ownerId) {
      return c.json({ error: "No autenticado: identidad de usuario requerida" }, 401);
    }

    const taskPayload = {
      ...validated,
      due_time: validated.due_time || (validated.due_date ? "09:00:00" : null),
      owner_id: ownerId,
    };

    const { data, error } = await db.from("tasks").insert(taskPayload).select().single();

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    c.set("auditRecordId", data.id);
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

  const db = getSupabaseForRequest(c);
  const { data, error } = await db
    .from("tasks")
    .update({
      status: newStatus,
      completed_at: newStatus === 3 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 403);
  }
  if (!data) {
    return c.json({ error: "Tarea no encontrada o sin permisos" }, 404);
  }

  c.set("auditRecordId", taskId);
  return c.json({ task: data });
});

// PUT /api/tasks/:id — Actualizar tarea (evita mutar owner_id inmutable)
tasksRouter.put("/:id", async (c: Context) => {
  const taskId = c.req.param("id");
  try {
    const body = await c.req.json();
    const validated = taskSchema.partial().parse(body);

    const db = getSupabaseForRequest(c);
    const { data, error } = await db
      .from("tasks")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select()
      .maybeSingle();

    if (error) {
      return c.json({ error: error.message }, 403);
    }
    if (!data) {
      return c.json({ error: "Tarea no encontrada o sin permisos" }, 404);
    }

    c.set("auditRecordId", taskId);
    return c.json({ task: data });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return c.json({ error: "Datos inválidos", issues: err.errors }, 400);
    }
    return c.json({ error: "Error interno" }, 500);
  }
});

// DELETE /api/tasks/:id — Eliminar tarea (Solo el creador o un supervisor pueden eliminar)
tasksRouter.delete("/:id", async (c: Context) => {
  const taskId = c.req.param("id");
  const db = getSupabaseForRequest(c);
  const currentUserId = extractUserIdFromRequest(c);

  if (!currentUserId) {
    return c.json({ error: "No se proporcionó la identidad del usuario" }, 401);
  }

  const { data: isSup } = await db.rpc("is_supervisor");
  const isSupervisor = Boolean(isSup);

  // 1. Obtener la tarea para verificar propiedad bajo RLS
  const { data: task, error: fetchError } = await db
    .from("tasks")
    .select("id, owner_id, title")
    .eq("id", taskId)
    .maybeSingle();

  if (fetchError || !task) {
    return c.json({ error: "Tarea no encontrada" }, 404);
  }

  // 2. Verificar que quien intenta eliminar sea el creador O un supervisor
  if (task.owner_id !== currentUserId && !isSupervisor) {
    return c.json(
      {
        error: "Acceso denegado: solo el creador o un supervisor pueden eliminar esta tarea.",
        task_owner_id: task.owner_id,
        request_user_id: currentUserId,
      },
      403
    );
  }

  // 3. Proceder con el borrado
  let deleteQuery = db.from("tasks").delete().eq("id", taskId);
  if (!isSupervisor) {
    deleteQuery = deleteQuery.eq("owner_id", currentUserId);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    return c.json({ error: deleteError.message }, 403);
  }

  c.set("auditRecordId", taskId);
  return c.json({
    success: true,
    deleted_id: taskId,
    message: `Tarea "${task.title}" eliminada exitosamente.`,
  });
});
