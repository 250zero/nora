import { Hono, type Context } from "hono";
import { z } from "zod";
import { getSupabaseForRequest, supabase } from "../config/supabase.ts";

export const usersRouter = new Hono();

// Middleware: Verifica JWT válido y rol Supervisor real contra Postgres
usersRouter.use("*", async (c: Context, next) => {
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
    return c.json({ error: "Acceso denegado: se requiere rol Supervisor/Admin" }, 403);
  }

  await next();
});

// Schema para creación de usuario en Supabase Auth
const createUserSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  display_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  role: z.union([z.literal(1), z.literal(2), z.literal("1"), z.literal("2")]).default(1),
});

// POST /api/users — Crear usuario con acceso de login a Supabase Auth
usersRouter.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = createUserSchema.parse(body);
    const roleNum = Number(validated.role) === 2 ? 2 : 1;

    // 1. Crear en Supabase Auth; el trigger SECURITY DEFINER handle_new_user() crea profiles + user_roles
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        data: {
          display_name: validated.display_name,
          role: roleNum,
        },
      },
    });

    if (authError || !authData.user) {
      return c.json(
        { error: authError?.message || "Error al registrar usuario en Supabase Auth" },
        400
      );
    }

    const newUserId = authData.user.id;
    c.set("auditRecordId", newUserId);

    return c.json(
      {
        success: true,
        user: {
          id: newUserId,
          email: validated.email,
          display_name: validated.display_name,
          role: roleNum,
          role_label: roleNum === 2 ? "Supervisor" : "Miembro",
        },
        message: `Usuario "${validated.display_name}" creado exitosamente para login.`,
      },
      201
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return c.json({ error: "Datos inválidos", issues: err.errors }, 400);
    }
    return c.json({ error: "Error interno al crear usuario" }, 500);
  }
});

// GET /api/users — Listar colaboradores con conteo de tareas
usersRouter.get("/", async (c: Context) => {
  const db = getSupabaseForRequest(c);

  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, display_name, email, timezone, created_at")
    .order("created_at", { ascending: true });

  if (profilesError) {
    return c.json({ error: profilesError.message }, 500);
  }

  const { data: roles } = await db.from("user_roles").select("user_id, role");

  const rolesMap = new Map<string, number>();
  for (const r of roles || []) {
    rolesMap.set(r.user_id, r.role);
  }

  const { data: tasks } = await db.from("tasks").select("id, owner_id, status");

  const taskCountMap = new Map<string, { total: number; pending: number; completed: number }>();
  for (const t of tasks || []) {
    const current = taskCountMap.get(t.owner_id) || { total: 0, pending: 0, completed: 0 };
    current.total += 1;
    if (t.status === 3) current.completed += 1;
    else current.pending += 1;
    taskCountMap.set(t.owner_id, current);
  }

  const result = (profiles || []).map((p) => {
    const stats = taskCountMap.get(p.id) || { total: 0, pending: 0, completed: 0 };
    const roleId = rolesMap.get(p.id) || 1;
    return {
      id: p.id,
      display_name: p.display_name,
      email: p.email,
      timezone: p.timezone,
      role: roleId,
      role_label: roleId === 2 ? "Supervisor" : "Miembro",
      tasks_stats: stats,
      created_at: p.created_at,
    };
  });

  return c.json({ users: result });
});

// GET /api/users/:id/tasks — Drill-down de tareas de un colaborador (creadas o asignadas)
usersRouter.get("/:id/tasks", async (c: Context) => {
  const targetUserId = c.req.param("id");
  const db = getSupabaseForRequest(c);
  c.set("auditRecordId", targetUserId);

  const { data: tasks, error } = await db
    .from("tasks")
    .select("*")
    .or(`owner_id.eq.${targetUserId},assignee_id.eq.${targetUserId}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ user_id: targetUserId, tasks: tasks || [] });
});

// DELETE /api/users/:id — Borrado completo en auth.users + cascada estricta en public
usersRouter.delete("/:id", async (c: Context) => {
  const targetUserId = c.req.param("id");
  const db = getSupabaseForRequest(c);
  c.set("auditRecordId", targetUserId);

  // Invocar RPC admin_delete_user (elimina de auth.users y cascada a profiles/tasks/roles/chat)
  const { error: rpcError } = await db.rpc("admin_delete_user", {
    target_user_id: targetUserId,
  });

  if (rpcError) {
    // Fallback solo si la RPC no existe aún en la BD; si falló por regla de negocio devolver 400
    if (rpcError.message.toLowerCase().includes("function") && rpcError.message.includes("does not exist")) {
      const { error: delError } = await db.from("profiles").delete().eq("id", targetUserId);
      if (delError) {
        return c.json({ error: delError.message }, 500);
      }
    } else {
      return c.json({ error: rpcError.message }, 400);
    }
  }

  return c.json({
    success: true,
    deleted_user_id: targetUserId,
    message: "Usuario y todas sus tareas asociadas eliminados en cascada exitosamente",
  });
});
