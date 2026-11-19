import { Hono, type Context } from "hono";
import { z } from "zod";
import { chatWithNora, executeTool } from "../services/gemini.service.ts";

export const chatRouter = new Hono();

const chatRequestSchema = z.object({
  message: z.string().min(1, "El mensaje no puede estar vacío"),
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

// POST /api/chat — Enviar mensaje a Nora con Gemini
chatRouter.post("/", async (c: Context) => {
  try {
    const body = await c.req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Datos de solicitud inválidos", issues: parsed.error.errors }, 400);
    }

    // Identificar al usuario que habla (vía header o fallback default del seed)
    const userId = c.req.header("X-User-Id") || "a0000000-0000-0000-0000-000000000001";

    const response = await chatWithNora(
      parsed.data.message,
      userId,
      parsed.data.history
    );

    return c.json(response);
  } catch (err: any) {
    console.error("Error en chatRouter:", err);
    return c.json({ error: "Error al procesar mensaje en el asistente Nora", details: err.message }, 500);
  }
});

// POST /api/chat/confirm-action — Confirmar o cancelar acción pendiente (ej. borrado)
chatRouter.post("/confirm-action", async (c: Context) => {
  try {
    const body = await c.req.json();
    const { action, taskId, confirmed } = body;
    const userId = c.req.header("X-User-Id") || "a0000000-0000-0000-0000-000000000001";

    if (!confirmed) {
      return c.json({
        message: "Acción cancelada. No se ha modificado ningún registro.",
        cancelled: true,
      });
    }

    if (action === "confirm_delete" && taskId) {
      const result = await executeTool("eliminar_tarea", { task_id: taskId }, userId);
      return c.json({
        message: "Tarea eliminada exitosamente tras tu confirmación.",
        result,
      });
    }

    return c.json({ error: "Tipo de acción no reconocida o parámetros incompletos" }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
