import { GoogleGenerativeAI, type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { ENV } from "../config/env.ts";
import { supabase } from "../config/supabase.ts";

const genAI = new GoogleGenerativeAI(ENV.LLM_API_KEY || "dummy-key");

// Definición de Tools para Gemini Function Calling
const consultarHorasLibresTool: FunctionDeclaration = {
  name: "consultar_horas_libres",
  description: "Consulta los bloques de tiempo libres en la agenda de un usuario para una fecha específica (horario de 08:00 a 18:00)",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fecha: {
        type: SchemaType.STRING,
        description: "Fecha en formato YYYY-MM-DD para consultar disponibilidad",
      },
      duracion_minutos: {
        type: SchemaType.NUMBER,
        description: "Duración estimada en minutos de la actividad (por defecto 60)",
      },
    },
    required: ["fecha"],
  },
};

const crearTareaTool: FunctionDeclaration = {
  name: "crear_tarea",
  description: "Crea una nueva tarea o compromiso en la agenda del usuario",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "Título o nombre descriptivo de la tarea o reunión",
      },
      due_date: {
        type: SchemaType.STRING,
        description: "Fecha de vencimiento en formato YYYY-MM-DD",
      },
      due_time: {
        type: SchemaType.STRING,
        description: "Hora en formato HH:mm (24 horas, ej. 09:30 o 15:00)",
      },
      priority: {
        type: SchemaType.NUMBER,
        description: "Prioridad: 1=Baja, 2=Media, 3=Alta (por defecto 2)",
      },
      responsible_name: {
        type: SchemaType.STRING,
        description: "Nombre del responsable o persona con quien es el compromiso",
      },
      description: {
        type: SchemaType.STRING,
        description: "Detalles o notas adicionales sobre la tarea",
      },
    },
    required: ["title", "due_date"],
  },
};

const listarTareasTool: FunctionDeclaration = {
  name: "listar_tareas",
  description: "Lista las tareas o compromisos del usuario para una fecha o rango",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fecha: {
        type: SchemaType.STRING,
        description: "Fecha específica en formato YYYY-MM-DD",
      },
    },
    required: ["fecha"],
  },
};

const eliminarTareaTool: FunctionDeclaration = {
  name: "eliminar_tarea",
  description: "Elimina una tarea existente por su ID",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      task_id: {
        type: SchemaType.STRING,
        description: "ID UUID de la tarea a eliminar",
      },
      task_title: {
        type: SchemaType.STRING,
        description: "Título de la tarea a eliminar para confirmar",
      },
    },
    required: ["task_id"],
  },
};

// Implementaciones de ejecución de cada Tool
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<{ result: any; suggestedSlots?: string[]; actionRequired?: any }> {
  switch (toolName) {
    case "consultar_horas_libres": {
      const fecha = args.fecha;
      // Consultar tareas existentes para esa fecha y usuario
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("due_time, duration_minutes, title")
        .eq("owner_id", userId)
        .eq("due_date", fecha)
        .order("due_time", { ascending: true });

      if (error) {
        return { result: { error: error.message } };
      }

      // Horas base de oficina: 08:00, 09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00
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
        source: 2, // 2 = Creada vía IA Nora
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
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", args.task_id)
        .eq("owner_id", userId);

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      return {
        result: { success: true, deleted_id: args.task_id, message: "Tarea eliminada exitosamente." },
      };
    }

    default:
      return { result: { error: `Herramienta desconocida: ${toolName}` } };
  }
}

// Orquestador principal de Chat con Gemini
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
  // Construir contexto temporal en America/Santo_Domingo
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

  const systemInstruction = `
Eres Nora, una asistente ejecutiva inteligente, empática y de alta precisión especializada en la gestión de agenda personal y de equipo.
Zona horaria del sistema: America/Santo_Domingo (UTC-4, hora local de República Dominicana).
Fecha y hora actual: ${currentDateStr} (ISO: ${currentIsoDate}).

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. GESTIÓN DE HORAS LIBRES:
   - Cuando el usuario solicite agendar una reunión, cita o tarea pero NO especifique una hora exacta (por ejemplo: "agenda una reunión con el cliente para mañana" o "pon una cita el viernes"), NUNCA asumas una hora inventada.
   - Debes llamar inmediatamente a la herramienta "consultar_horas_libres" pasando la fecha respectiva.
   - Al recibir los horarios libres, indícaselos al usuario en tu respuesta de manera muy clara para que elija uno.
2. CREACIÓN CON HORA EXACTA:
   - Si el usuario indica o confirma una hora exacta (por ejemplo: "el jueves a las 10:00 AM"), llama directamente a "crear_tarea" con los datos correspondientes.
3. ELIMINACIÓN SEGURA:
   - Si el usuario pide borrar una tarea sin especificar confirmación, antes de borrarla pregunta: "¿Estás seguro de que deseas eliminar la tarea [Nombre]?" indicando que la acción es definitiva.
4. TONO:
   - Profesional, conciso, cálido y enfocado en la productividad.
`;

  const model = genAI.getGenerativeModel({
    model: "gemini-3.8-flash",
    systemInstruction,
    tools: [
      {
        functionDeclarations: [
          consultarHorasLibresTool,
          crearTareaTool,
          listarTareasTool,
          eliminarTareaTool,
        ],
      },
    ],
  });

  try {
    // Iniciar chat con historial reciente
    const chat = model.startChat({
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const functionCalls = response.functionCalls();

    let suggestedSlots: string[] | undefined;
    let actionRequired: any = undefined;
    let toolExecuted: string | undefined;

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      toolExecuted = call.name;

      // Si es eliminar y no fue confirmado por el usuario en el mensaje
      if (call.name === "eliminar_tarea" && !userMessage.toLowerCase().includes("confirmo")) {
        actionRequired = {
          type: "confirm_delete",
          taskId: (call.args as any)?.task_id,
          taskTitle: (call.args as any)?.task_title || "esta tarea",
        };
        return {
          reply: `¿Estás seguro de que deseas eliminar la tarea "${actionRequired.taskTitle}"? Esta acción no se puede deshacer.`,
          actionRequired,
          toolExecuted: "confirm_pending",
        };
      }

      // Ejecutar la tool
      const toolOutput = await executeTool(call.name, call.args as Record<string, any>, userId);
      suggestedSlots = toolOutput.suggestedSlots;
      actionRequired = toolOutput.actionRequired;

      // Devolver el resultado de la función al modelo para la respuesta final en lenguaje natural
      const followUp = await chat.sendMessage([
        {
          functionResponse: {
            name: call.name,
            response: toolOutput.result,
          },
        },
      ]);

      const finalReply = followUp.response.text();
      return {
        reply: finalReply,
        suggestedSlots,
        actionRequired,
        toolExecuted,
      };
    }

    return {
      reply: response.text(),
      suggestedSlots,
      actionRequired,
    };
  } catch (err: any) {
    console.error("Error en llamada a Gemini API:", err);
    return {
      reply: `Lo siento, ocurrió un inconveniente al comunicarme con mi servicio de inteligencia artificial: ${err.message || "Error desconocido"}. Por favor verifica la clave o intenta nuevamente.`,
    };
  }
}
