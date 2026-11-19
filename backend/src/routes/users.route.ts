import { Hono, type Context } from "hono";
import { supabase } from "../config/supabase.ts";

export const usersRouter = new Hono();

// Middleware simple para verificar rol Supervisor
usersRouter.use("*", async (c: Context, next: () => Promise<void>) => {
  const activeRole = c.req.header("X-Active-Role");
  // En modo MVP se valida el rol activo enviado en el header del token
  if (activeRole !== "2") {
    return c.json({ error: "Acceso denegado: se requiere rol Supervisor/Admin" }, 403);
  }
  await next();
});

// GET /api/users — Listar colaboradores con conteo de tareas
usersRouter.get("/", async (c: Context) => {
  // 1. Obtener todos los perfiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, email, timezone, created_at")
    .order("created_at", { ascending: true });

  if (profilesError) {
    return c.json({ error: profilesError.message }, 500);
  }

  // 2. Obtener roles asignados
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role");

  const rolesMap = new Map<string, number>();
  for (const r of roles || []) {
    rolesMap.set(r.user_id, r.role);
  }

  // 3. Obtener conteo de tareas por usuario
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, owner_id, status");

  const taskCountMap = new Map<string, { total: number; pending: number; completed: number }>();
  for (const t of tasks || []) {
    const current = taskCountMap.get(t.owner_id) || { total: 0, pending: 0, completed: 0 };
    current.total += 1;
    if (t.status === 3) current.completed += 1;
    else current.pending += 1;
    taskCountMap.set(t.owner_id, current);
  }

  const result = (profiles || []).map((p: Record<string, any>) => {
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

// GET /api/users/:id/tasks — Drill-down de tareas de un colaborador
usersRouter.get("/:id/tasks", async (c: Context) => {
  const targetUserId = c.req.param("id");

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("owner_id", targetUserId)
    .order("due_date", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ user_id: targetUserId, tasks: tasks || [] });
});

// DELETE /api/users/:id — Borrado de usuario en cascada estricta
usersRouter.delete("/:id", async (c: Context) => {
  const targetUserId = c.req.param("id");

  // Al borrar de profiles o auth.users, la base de datos ejecuta ON DELETE CASCADE
  // eliminando todas las tareas, roles y mensajes del usuario automáticamente.
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", targetUserId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({
    success: true,
    deleted_user_id: targetUserId,
    message: "Usuario y todas sus tareas asociadas eliminados en cascada exitosamente",
  });
});
