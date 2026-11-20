import { ENV } from "../config/env.ts";
import { supabase } from "../config/supabase.ts";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

// Declaración de Tools para el payload REST de Gemini
const toolsDeclaration = [
  {
    functionDeclarations: [
      {
        name: "consultar_horas_libres",
        description: "Consulta los bloques de tiempo libres en la agenda de un usuario para una fecha específica (horario de 08:00 a 18:00)",
        parameters: {
          type: "OBJECT",
          properties: {
            fecha: {
              type: "STRING",
              description: "Fecha en formato YYYY-MM-DD para consultar disponibilidad",
            },
            duracion_minutos: {
              type: "NUMBER",
              description: "Duración estimada en minutos de la actividad (por defecto 60)",
            },
          },
          required: ["fecha"],
        },
      },
      {
        name: "crear_tarea",
        description: "Crea una nueva tarea o compromiso en la agenda del usuario",
        parameters: {
          type: "OBJECT",
          properties: {
            title: {
              type: "STRING",
              description: "Título o nombre descriptivo de la tarea o reunión",
            },
            due_date: {
              type: "STRING",
              description: "Fecha de vencimiento en formato YYYY-MM-DD",
            },
            due_time: {
              type: "STRING",
              description: "Hora en formato HH:mm (24 horas, ej. 09:30 o 15:00)",
            },
            priority: {
              type: "NUMBER",
              description: "Prioridad: 1=Baja, 2=Media, 3=Alta (por defecto 2)",
            },
            responsible_name: {
              type: "STRING",
              description: "Nombre del responsable o persona con quien es el compromiso",
            },
            description: {
              type: "STRING",
              description: "Detalles o notas adicionales sobre la tarea",
            },
          },
          required: ["title", "due_date"],
        },
      },
      {
        name: "listar_tareas",
        description: "Lista las tareas o compromisos del usuario para una fecha o rango",
        parameters: {
          type: "OBJECT",
          properties: {
            fecha: {
              type: "STRING",
              description: "Fecha específica en formato YYYY-MM-DD",
            },
          },
          required: ["fecha"],
        },
      },
      {
        name: "eliminar_tarea",
        description: "Elimina una tarea existente por su ID tras confirmación",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "ID UUID de la tarea a eliminar",
            },
            task_title: {
              type: "STRING",
              description: "Título de la tarea a eliminar para confirmar",
            },
          },
          required: ["task_id"],
        },
      },
    ],
  },
];

// Ejecución de Tools
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<{ result: any; suggestedSlots?: string[]; actionRequired?: any }> {
  switch (toolName) {
    case "consultar_horas_libres": {
      const fecha = args.fecha;
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("due_time, duration_minutes, title")
        .eq("owner_id", userId)
        .eq("due_date", fecha)
        .order("due_time", { ascending: true });

      if (error) {
        return { result: { error: error.message } };
      }

      const standardSlots = [
        "08:30",
        "10:00",
        "11:30",
        "14:00",
        "15:30",
        "16:45",
      ];

      const occupiedHours = new Set(
        (tasks || []).map((t) => (t.due_time ? t.due_time.substring(0, 5) : ""))
      );

      const freeSlots = standardSlots.filter((slot) => !occupiedHours.has(slot));

      return {
        result: {
          fecha,
          tareas_ocupadas: tasks || [],
          horarios_disponibles: freeSlots,
        },
        suggestedSlots: freeSlots.slice(0, 4),
      };
    }

    case "crear_tarea": {
      const newTask = {
        owner_id: userId,
        title: args.title,
        due_date: args.due_date,
        due_time: args.due_time ? (args.due_time.length === 5 ? `${args.due_time}:00` : args.due_time) : null,
        priority: args.priority || 2,
        responsible_name: args.responsible_name || null,
        description: args.description || null,
        status: 1, // Pendiente
        source: 2, // 2 = Creada vía Asistente IA Nora
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert(newTask)
        .select()
        .single();

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      return {
        result: { success: true, task: data, message: `Tarea "${args.title}" agendada exitosamente.` },
      };
    }

    case "listar_tareas": {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, due_time, priority, status")
        .eq("owner_id", userId)
        .eq("due_date", args.fecha)
        .order("due_time", { ascending: true });

      if (error) {
        return { result: { error: error.message } };
      }

      return {
        result: { fecha: args.fecha, total: data?.length || 0, tareas: data || [] },
      };
    }

    case "eliminar_tarea": {
      // 1. Obtener la tarea para verificar propiedad
      const { data: task, error: fetchErr } = await supabase
        .from("tasks")
        .select("id, owner_id, title")
        .eq("id", args.task_id)
        .single();

      if (fetchErr || !task) {
        return { result: { success: false, error: "La tarea no existe o ya fue eliminada." } };
      }

      // 2. Comprobar que el usuario que pide eliminar sea el creador
      if (task.owner_id !== userId) {
        return {
          result: {
            success: false,
            error: `Acceso denegado: solo puedes eliminar las tareas que tú mismo has creado. La tarea "${task.title}" pertenece a otro usuario.`,
          },
        };
      }

      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", args.task_id)
        .eq("owner_id", userId);

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      return {
        result: { success: true, deleted_id: args.task_id, message: `Tarea "${task.title}" eliminada exitosamente.` },
      };
    }

    default:
      return { result: { error: `Herramienta desconocida: ${toolName}` } };
  }
}

// Orquestador principal de Chat usando fetch nativo de Deno
export async function chatWithNora(
  userMessage: string,
  userId: string,
  history: Array<{ role: "user" | "model"; text: string }> = []
): Promise<{
  reply: string;
  suggestedSlots?: string[];
  actionRequired?: any;
  toolExecuted?: string;
}> {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "America/Santo_Domingo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const currentDateStr = new Intl.DateTimeFormat("es-DO", options).format(now);
  const currentIsoDate = now.toISOString().split("T")[0];

  const systemPrompt = `
Eres Nora, una asistente ejecutiva inteligente, empática y de alta precisión especializada en la gestión ágil de agenda y tareas.
Zona horaria del sistema: America/Santo_Domingo (UTC-4, hora local de República Dominicana).
Fecha y hora actual: ${currentDateStr} (ISO: ${currentIsoDate}).

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. CREACIÓN DE TAREAS Y RECORDATORIOS:
   - Cuando el usuario solicite crear, agendar o agregar tareas (por ejemplo: "crea una tarea de cumpleaños para el viernes", "anota ir al supermercado", "recuérdame visitar a Juana el sábado"), DEBES LLAMAR DIRECTAMENTE a la herramienta "crear_tarea" para CADA tarea que el usuario mencione.
   - Si el usuario no especifica una hora exacta para una tarea (ej. "el viernes"), puedes dejar due_time vacío (null) o poner una hora tentativa habitual (ej. "09:00", "10:00" o "15:00"), pero SIEMPRE debes ejecutar "crear_tarea" inmediatamente sin detenerte a preguntar.
   - Si el usuario pide crear múltiples tareas en un solo mensaje, emite una llamada a "crear_tarea" para CADA UNA de ellas en la misma respuesta.

2. GESTIÓN DE HORAS LIBRES / REUNIONES:
   - Solo debes llamar a "consultar_horas_libres" cuando el usuario pregunte explícitamente por su disponibilidad o cuándo tiene tiempo para una reunión o cita (por ejemplo: "¿qué horas tengo libres el viernes?", "¿a qué hora puedo reunirme con el cliente mañana?").

3. ELIMINACIÓN SEGURA:
   - Si el usuario pide borrar una tarea sin especificar confirmación, antes de borrarla pregunta: "¿Estás seguro de que deseas eliminar la tarea [Nombre]?" indicando que la acción es definitiva.

4. TONO Y FORMATO:
   - Profesional, conciso, cálido y enfocado en la productividad. Confirma siempre las tareas creadas con su título y fecha correspondiente.
`;

  // Construir historial de mensajes en formato Gemini
  const contents = [
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    tools: toolsDeclaration,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const resp = await fetch(`${GEMINI_API_URL}?key=${ENV.LLM_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google AI API Error [${resp.status}]: ${errText}`);
    }

    const data = await resp.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let replyText = "";
    const functionCalls: Array<{ name: string; args: any; id?: string }> = [];

    for (const part of parts) {
      if (part.text) {
        replyText += part.text;
      }
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
          id: part.functionCall.id || (part as any).id,
        });
      }
    }

    let suggestedSlots: string[] | undefined;
    let actionRequired: any = undefined;
    let toolExecuted: string | undefined;

    if (functionCalls.length > 0) {
      // Si alguna llamada es eliminar y no fue confirmada
      const deleteCall = functionCalls.find(
        (fc) => fc.name === "eliminar_tarea" && !userMessage.toLowerCase().includes("confirmo")
      );

      if (deleteCall) {
        actionRequired = {
          type: "confirm_delete",
          taskId: deleteCall.args.task_id,
          taskTitle: deleteCall.args.task_title || "esta tarea",
        };
        return {
          reply: `¿Estás seguro de que deseas eliminar la tarea "${actionRequired.taskTitle}"? Esta acción es definitiva e irreversible.`,
          actionRequired,
          toolExecuted: "confirm_pending",
        };
      }

      // Ejecutar TODAS las tools llamadas por el modelo (soporte para creación múltiple/batch)
      const functionResponseParts: any[] = [];
      const executedNames: string[] = [];
      const createdTasksList: string[] = [];

      for (const fc of functionCalls) {
        executedNames.push(fc.name);
        const toolOutput = await executeTool(fc.name, fc.args, userId);
        if (toolOutput.suggestedSlots) {
          suggestedSlots = toolOutput.suggestedSlots;
        }
        if (toolOutput.actionRequired) {
          actionRequired = toolOutput.actionRequired;
        }

        if (fc.name === "crear_tarea" && toolOutput.result?.task) {
          createdTasksList.push(
            `• **${fc.args.title}** para el ${fc.args.due_date}${fc.args.due_time ? ' a las ' + fc.args.due_time : ''}`
          );
        }

        const fr: any = {
          name: fc.name,
          response: toolOutput.result,
        };
        if (fc.id) {
          fr.id = fc.id;
        }
        functionResponseParts.push({ functionResponse: fr });
      }

      toolExecuted = executedNames.join(", ");

      // Enviar resultado acumulado de las tools a Gemini para respuesta conversacional
      const followUpPayload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          ...contents,
          candidate.content,
          {
            role: "user",
            parts: functionResponseParts,
          },
        ],
        tools: toolsDeclaration,
      };

      const followUpResp = await fetch(`${GEMINI_API_URL}?key=${ENV.LLM_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(followUpPayload),
      });

      if (followUpResp.ok) {
        const followUpData = await followUpResp.json();
        const followParts = followUpData.candidates?.[0]?.content?.parts || [];
        replyText = followParts.map((p: any) => p.text || "").join("");
      } else {
        if (createdTasksList.length > 0) {
          replyText = `¡Listo! He registrado las siguientes tareas en tu agenda:\n\n${createdTasksList.join("\n")}`;
        } else if (suggestedSlots && suggestedSlots.length > 0) {
          replyText = `He consultado tu agenda. Dispones de los siguientes horarios libres:\n` +
            suggestedSlots.map((s) => `• ${s}`).join("\n");
        }
      }

      return {
        reply: replyText || "Acción completada con éxito.",
        suggestedSlots,
        actionRequired,
        toolExecuted,
      };
    }

    return {
      reply: replyText || "¡Hola! Estoy lista para ayudarte con tu agenda y tareas. ¿Qué coordinamos hoy?",
      suggestedSlots,
      actionRequired,
    };
  } catch (err: any) {
    console.error("Error en chatWithNora:", err);
    return {
      reply: `Disculpa, hubo una dificultad al comunicarme con Google Gemini: ${err.message}.`,
    };
  }
}
