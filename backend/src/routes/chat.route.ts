import { Hono, type Context } from "hono";
import { z } from "zod";
import { extractUserIdFromRequest, getSupabaseForRequest } from "../config/supabase.ts";
import { chatWithNora, executeTool } from "../services/gemini.service.ts";

export const chatRouter = new Hono();

chatRouter.use("*", async (c: Context, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No autenticado: se requiere token Bearer válido" }, 401);
  }
  await next();
});

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000, "Máximo 2000 caracteres"),
  client_timezone: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string(),
      })
    )
    .optional()
    .default([]),
});

// GET /api/chat/history — Historial de conversación persistido en PostgreSQL (RF-20)
chatRouter.get("/history", async (c: Context) => {
  const db = getSupabaseForRequest(c);
  const userId = extractUserIdFromRequest(c);

  if (!userId) {
    return c.json({ error: "Usuario no identificado" }, 401);
  }

  const { data, error } = await db
    .from("chat_messages")
    .select("id, role, content, actions, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    const status = error.message.toLowerCase().includes("jwt") ? 401 : 500;
    return c.json({ error: error.message }, status);
  }

  const ordered = (data || []).reverse().map((m) => ({
    id: m.id,
    sender: m.role === 1 ? "user" : "nora",
    text: m.content,
    timestamp: m.created_at,
    suggestedSlots: (m.actions as any)?.suggestedSlots,
    actionRequired: (m.actions as any)?.actionRequired,
    actionsSummary: (m.actions as any)?.actionsSummary,
    toolExecuted: (m.actions as any)?.toolExecuted,
  }));

  return c.json({ messages: ordered });
});

// POST /api/chat — Enviar mensaje a Nora con Gemini + persistencia en chat_messages
chatRouter.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos de solicitud inválidos", issues: parsed.error.errors }, 400);
    }

    const db = getSupabaseForRequest(c);
    const userId = extractUserIdFromRequest(c);
    if (!userId) {
      return c.json({ error: "Token de usuario inválido" }, 401);
    }

    // 1. Verificar JWT en PostgREST + obtener zona horaria real del perfil
    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("id, timezone")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      const code = profileErr.message.toLowerCase().includes("jwt") ? 401 : 500;
      return c.json({ error: profileErr.message }, code);
    }

    const userTimeZone =
      profile?.timezone || parsed.data.client_timezone || "America/Santo_Domingo";

    // 2. Guardar mensaje del usuario en chat_messages (role = 1)
    await db.from("chat_messages").insert({
      user_id: userId,
      role: 1,
      content: parsed.data.message.slice(0, 4000),
    });

    // 3. Ejecutar orquestador de Nora (Gemini Tool Calling)
    const response = await chatWithNora(
      parsed.data.message,
      userId,
      parsed.data.history.slice(-20),
      db,
      userTimeZone
    );

    if (response.mutatedTaskIds && response.mutatedTaskIds.length > 0) {
      c.set("auditRecordId", response.mutatedTaskIds[0]);
    }

    // 4. Persistir respuesta de Nora en chat_messages (role = 2)
    await db.from("chat_messages").insert({
      user_id: userId,
      role: 2,
      content: response.reply.slice(0, 4000),
      actions: {
        suggestedSlots: response.suggestedSlots || null,
        actionRequired: response.actionRequired || null,
        actionsSummary: response.actionsSummary || null,
        toolExecuted: response.toolExecuted || null,
      },
    });

    return c.json(response);
  } catch (err: any) {
    console.error("Error en chatRouter:", err);
    const isTimeout = err?.name === "AbortError";
    return c.json(
      {
        error: isTimeout
          ? "La respuesta de Nora tardó demasiado. Puedes reintentar."
          : "No fue posible comunicarse con el servicio de IA. Conservamos tu texto para reintentar.",
        retryable: true,
        details: err?.message,
      },
      isTimeout ? 504 : 502
    );
  }
});

// POST /api/chat/confirm-action — Confirmar o cancelar acción pendiente (ej. borrado)
chatRouter.post("/confirm-action", async (c: Context) => {
  try {
    const body = await c.req.json();
    const { action, taskId, pendingActionId, confirmed } = body;
    const db = getSupabaseForRequest(c);
    const userId = extractUserIdFromRequest(c);

    if (!userId) {
      return c.json({ error: "Usuario no autenticado" }, 401);
    }

    if (!confirmed) {
      if (pendingActionId) {
        await db
          .from("agent_pending_actions")
          .update({ status: 3 })
          .eq("id", pendingActionId)
          .eq("user_id", userId);
      } else if (taskId) {
        await db
          .from("agent_pending_actions")
          .update({ status: 3 })
          .eq("task_id", taskId)
          .eq("user_id", userId)
          .eq("status", 1);
      }
      return c.json({
        message: "Acción cancelada. No se ha modificado ningún registro.",
        cancelled: true,
      });
    }

    if (action === "confirm_delete" && taskId) {
      const result = await executeTool(
        "eliminar_tarea",
        { task_id: taskId, confirmed: true },
        userId,
        db
      );
      c.set("auditRecordId", taskId);

      if (result.result && !result.result.success) {
        return c.json(
          {
            error: result.result.error || "No tienes permiso para eliminar esta tarea.",
            result,
          },
          403
        );
      }

      return c.json({
        message: result.result?.message || "Tarea eliminada exitosamente tras tu confirmación.",
        result,
      });
    }

    return c.json({ error: "Tipo de acción no reconocida o parámetros incompletos" }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
