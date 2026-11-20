import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  getSupabaseForRequest,
  getSupabaseUserClient,
  supabase,
} from "../config/supabase.ts";

export const authRouter = new Hono();

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const registerSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  displayName: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
});

// POST /api/auth/login — Inicio de sesión con Supabase Auth
authRouter.post("/login", async (c: Context) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos de login inválidos", issues: parsed.error.errors }, 400);
    }

    const { email, password } = parsed.data;

    // Autenticar contra Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      return c.json({ error: error?.message || "Credenciales incorrectas" }, 401);
    }

    const userId = data.user.id;
    const accessToken = data.session.access_token;

    // Registrar contexto autenticado para auditMiddleware
    c.set("auditUserId", userId);
    c.set("auditToken", accessToken);

    // Usar cliente scoped con el JWT recién emitido (respeta RLS)
    const userDb = getSupabaseUserClient(`Bearer ${accessToken}`);

    const { data: profile } = await userDb
      .from("profiles")
      .select("display_name, email, timezone")
      .eq("id", userId)
      .maybeSingle();

    const { data: roleRow } = await userDb
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const role = (roleRow?.role as 1 | 2) || 1;

    return c.json({
      token: accessToken,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: {
        id: userId,
        displayName:
          profile?.display_name || data.user.user_metadata?.display_name || email.split("@")[0],
        email: data.user.email,
        timezone: profile?.timezone || "America/Santo_Domingo",
        role,
        roleLabel: role === 2 ? "Supervisor" : "Miembro",
      },
    });
  } catch (err: any) {
    return c.json({ error: "Error interno al iniciar sesión", details: err.message }, 500);
  }
});

// POST /api/auth/register — Registro de nuevo colaborador
authRouter.post("/register", async (c: Context) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos de registro inválidos", issues: parsed.error.errors }, 400);
    }

    const { email, password, displayName } = parsed.data;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role: 1, // Trigger handle_new_user() crea profiles y user_roles con SECURITY DEFINER
        },
      },
    });

    if (error || !data.user) {
      return c.json({ error: error?.message || "No se pudo completar el registro" }, 400);
    }

    const user = data.user;
    if (data.session?.access_token) {
      c.set("auditUserId", user.id);
      c.set("auditToken", data.session.access_token);
    }

    return c.json(
      {
        success: true,
        message: "Registro exitoso",
        token: data.session?.access_token || null,
        refreshToken: data.session?.refresh_token || null,
        session: data.session,
        user: {
          id: user.id,
          email: user.email,
          displayName,
          role: 1,
          roleLabel: "Miembro",
        },
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: "Error interno al registrar usuario", details: err.message }, 500);
  }
});

// GET /api/auth/me — Obtener sesión actual del token
authRouter.get("/me", async (c: Context) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No se proporcionó token de sesión válido" }, 401);
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Sesión inválida o expirada" }, 401);
  }

  const userDb = getSupabaseForRequest(c);

  const { data: profile } = await userDb
    .from("profiles")
    .select("display_name, email, timezone")
    .eq("id", user.id)
    .maybeSingle();

  const { data: roleRow } = await userDb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (roleRow?.role as 1 | 2) || 1;

  return c.json({
    user: {
      id: user.id,
      displayName: profile?.display_name || user.email?.split("@")[0],
      email: user.email,
      timezone: profile?.timezone || "America/Santo_Domingo",
      role,
      roleLabel: role === 2 ? "Supervisor" : "Miembro",
    },
  });
});

// POST /api/auth/logout — Cierre de sesión
authRouter.post("/logout", (c: Context) => {
  return c.json({ success: true, message: "Sesión cerrada exitosamente" });
});
