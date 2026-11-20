import { ENV } from "../config/env.ts";
import { supabase } from "../config/supabase.ts";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

// --- Funciones auxiliares de normalización de fecha y hora ---

export function normalizeTime(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const s = timeStr.trim().toLowerCase();

  // Coincidencia con formato HH:mm o HH:mm:ss (24h)
  const match24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const hh = match24[1].padStart(2, "0");
    const mm = match24[2];
    const ss = match24[3] || "00";
    return `${hh}:${mm}:${ss}`;
  }

  // Coincidencia con formato 12h: "5 pm", "5:00 pm", "5:30 am", "5am", etc.
  const match12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const mm = match12[2] || "00";
    const period = match12[3];
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${mm}:00`;
  }

  return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
}

export function getHour(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const norm = normalizeTime(timeStr);
  if (!norm) return null;
  const parts = norm.split(":");
  const h = parseInt(parts[0], 10);
  return isNaN(h) ? null : h;
}

export function resolveDate(dateStr?: string | null, referenceDate?: Date): string {
  const now = referenceDate || new Date();
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayIso = dtf.format(now); // "YYYY-MM-DD"

  if (!dateStr) return todayIso;

  const s = dateStr.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const [y, m, d] = todayIso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  if (s === "hoy") {
    return todayIso;
  }
  if (s === "mañana" || s === "manana") {
    target.setUTCDate(target.getUTCDate() + 1);
    return target.toISOString().split("T")[0];
  }
  if (s === "pasado mañana" || s === "pasado manana") {
    target.setUTCDate(target.getUTCDate() + 2);
    return target.toISOString().split("T")[0];
  }

  const daysOfWeek: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miércoles: 3,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sábado: 6,
    sabado: 6,
  };

  for (const [dayName, dayIndex] of Object.entries(daysOfWeek)) {
    if (s.includes(dayName)) {
      const currentDay = target.getUTCDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0) diff += 7;
      target.setUTCDate(target.getUTCDate() + diff);
      return target.toISOString().split("T")[0];
    }
  }

  return todayIso;
}

// Declaración de Tools para el payload REST de Gemini
const toolsDeclaration = [
  {
    functionDeclarations: [
      {
        name: "consultar_horas_libres",
        description: "Consulta los bloques de tiempo libres en la agenda de un usuario para una fecha específica (horario laboral de 08:00 a 18:00)",
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
              description: "Título o nombre descriptivo de la tarea o compromiso",
            },
            due_date: {
              type: "STRING",
              description: "Fecha de la tarea en formato estricto YYYY-MM-DD",
            },
            due_time: {
              type: "STRING",
              description: "Hora fija en formato HH:mm (24 horas, ej. '09:00', '17:00'). Si el usuario no especificó hora, asigna por defecto '09:00'.",
            },
            priority: {
              type: "NUMBER",
              description: "Prioridad: 1=Baja, 2=Media, 3=Alta (por defecto 2)",
            },
            responsible_name: {
              type: "STRING",
              description: "Nombre del responsable o persona involucrada si se menciona",
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
      {
        name: "reprogramar_tarea",
        description: "Mueve o reprograma la fecha u hora de una tarea existente del usuario cuando hay conflicto o cuando el usuario pide moverla a otro horario",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "ID UUID de la tarea a mover o reprogramar si se conoce",
            },
            task_title: {
              type: "STRING",
              description: "Título o nombre de la tarea a mover (ej. 'Hacer la compra al bravo')",
            },
            new_date: {
              type: "STRING",
              description: "Nueva fecha en formato YYYY-MM-DD (opcional si se mantiene en el mismo día)",
            },
            new_time: {
              type: "STRING",
              description: "Nueva hora en formato HH:mm (24 horas, ej. '18:00' o '16:00')",
            },
          },
          required: ["new_time"],
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
      const fecha = resolveDate(args.fecha);
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("due_time, duration_minutes, title")
        .eq("owner_id", userId)
        .eq("due_date", fecha)
        .neq("status", 3)
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
        (tasks || []).map((t) => getHour(t.due_time)).filter((h) => h !== null)
      );

      const freeSlots = standardSlots.filter((slot) => {
        const slotHour = getHour(slot);
        return slotHour !== null && !occupiedHours.has(slotHour);
      });

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
      const taskDate = resolveDate(args.due_date);
      let finalDueTime = normalizeTime(args.due_time);
      if (!finalDueTime && taskDate) {
        finalDueTime = "09:00:00"; // Hora fija por defecto: 9:00 AM
      }

      const reqHour = getHour(finalDueTime);

      // 1. Detección Proactiva de Conflicto de Horario
      if (taskDate && reqHour !== null) {
        const { data: existingTasks } = await supabase
          .from("tasks")
          .select("id, title, due_time, due_date, status")
          .eq("owner_id", userId)
          .eq("due_date", taskDate)
          .neq("status", 3); // Solo tareas activas (pendientes o en progreso)

        const conflictingTask = (existingTasks || []).find((t) => {
          const tHour = getHour(t.due_time);
          return tHour !== null && tHour === reqHour;
        });

        if (conflictingTask) {
          const standardHourlySlots = [
            "08:00",
            "09:00",
            "10:00",
            "11:00",
            "12:00",
            "14:00",
            "15:00",
            "16:00",
            "18:00",
            "19:00",
          ];
          const occupiedHours = new Set(
            (existingTasks || []).map((t) => getHour(t.due_time)).filter((h) => h !== null)
          );
          const freeSlots = standardHourlySlots.filter((slot) => {
            const sh = getHour(slot);
            return sh !== null && !occupiedHours.has(sh);
          });

          const conflictTimeFmt = conflictingTask.due_time
            ? conflictingTask.due_time.substring(0, 5)
            : `${String(reqHour).padStart(2, "0")}:00`;

          return {
            result: {
              conflict: true,
              message: `ALERTA DE CONFLICTO: A las ${conflictTimeFmt} ya tienes agendada la tarea "${conflictingTask.title}". NO debes agendar la nueva tarea "${args.title}" a esa misma hora. Debes preguntar al usuario a cuál de las horas disponibles prefiere moverla.`,
              conflicting_task_title: conflictingTask.title,
              conflicting_task_id: conflictingTask.id,
              conflicting_time: conflictTimeFmt,
              requested_title: args.title,
              requested_time: conflictTimeFmt,
              due_date: taskDate,
              horarios_disponibles: freeSlots,
            },
            suggestedSlots: freeSlots.slice(0, 4),
          };
        }
      }

      // 2. Si no hay conflicto, agendar normalmente
      const newTask = {
        owner_id: userId,
        title: args.title,
        due_date: taskDate,
        due_time: finalDueTime,
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

      const formattedHour = data.due_time ? data.due_time.substring(0, 5) : "09:00";
      return {
        result: {
          success: true,
          task: data,
          message: `Tarea "${args.title}" agendada exitosamente para el ${data.due_date} a las ${formattedHour}.`,
        },
      };
    }

    case "reprogramar_tarea": {
      let targetTask: any = null;

      if (args.task_id) {
        const { data } = await supabase
          .from("tasks")
          .select("id, title, due_date, due_time")
          .eq("id", args.task_id)
          .eq("owner_id", userId)
          .maybeSingle();
        targetTask = data;
      }

      if (!targetTask && args.task_title) {
        const { data: matched } = await supabase
          .from("tasks")
          .select("id, title, due_date, due_time")
          .eq("owner_id", userId)
          .ilike("title", `%${args.task_title}%`)
          .order("created_at", { ascending: false })
          .limit(1);
        targetTask = matched?.[0] || null;
      }

      if (!targetTask) {
        const { data: latestTasks } = await supabase
          .from("tasks")
          .select("id, title, due_date, due_time")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        targetTask = latestTasks?.[0] || null;
      }

      if (!targetTask) {
        return {
          result: {
            success: false,
            error: `No encontré ninguna tarea para reprogramar con ese nombre.`,
          },
        };
      }

      const formattedNewTime = normalizeTime(args.new_time) || "09:00:00";
      const updates: any = {
        due_time: formattedNewTime,
        updated_at: new Date().toISOString(),
      };
      if (args.new_date) {
        updates.due_date = resolveDate(args.new_date);
      }

      const { data: updated, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", targetTask.id)
        .select()
        .single();

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      const formattedHour = updated.due_time ? updated.due_time.substring(0, 5) : args.new_time;
      return {
        result: {
          success: true,
          task: updated,
          message: `Tarea "${updated.title}" movida exitosamente para las ${formattedHour}.`,
        },
      };
    }

    case "listar_tareas": {
      const fecha = resolveDate(args.fecha);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, due_time, priority, status")
        .eq("owner_id", userId)
        .eq("due_date", fecha)
        .order("due_time", { ascending: true });

      if (error) {
        return { result: { error: error.message } };
      }

      return {
        result: { fecha, total: data?.length || 0, tareas: data || [] },
      };
    }

    case "eliminar_tarea": {
      const { data: task, error: fetchErr } = await supabase
        .from("tasks")
        .select("id, owner_id, title")
        .eq("id", args.task_id)
        .single();

      if (fetchErr || !task) {
        return { result: { success: false, error: "La tarea no existe o ya fue eliminada." } };
      }

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
  
  // Fecha ISO estricta en zona horaria local de Santo Domingo (evita desfase UTC de madrugada)
  const doDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const currentIsoDate = doDateFormatter.format(now);

  const systemPrompt = `
Eres Nora, una asistente ejecutiva inteligente, empática y de alta precisión especializada en la gestión ágil de agenda y tareas.
Zona horaria del sistema: America/Santo_Domingo (UTC-4, hora local de República Dominicana).
Fecha y hora actual local: ${currentDateStr} (Fecha ISO local: ${currentIsoDate}).

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. DETECCIÓN Y RESOLUCIÓN OBLIGATORIA DE CONFLICTOS DE HORARIO (INNEGOCIABLE):
   - NUNCA confirmes ni dobles reservas sobre una misma hora si ya existe un compromiso agendado para ese horario.
   - Si al invocar "crear_tarea" la herramienta responde con { conflict: true }:
     * ESTÁ ESTRICTAMENTE PROHIBIDO decir que la tarea fue agendada en la hora solicitada.
     * DEBES avisar de forma clara e inmediata: "A las [conflicting_time] ya tienes agendada la tarea '**[conflicting_task_title]**'".
     * DEBES PREGUNTAR AL USUARIO: "¿A qué hora de las disponibles prefieres mover o agendar esta tarea (o reubicar la anterior)?".
     * Muestra la lista de horarios libres que retorna la herramienta en 'horarios_disponibles' (ejemplo: "Dispones de los siguientes horarios libres: 14:00, 15:00, 16:00, 18:00...").
   - RESOLUCIÓN DE CONFLICTO:
     * Cuando el usuario elija o responda con una de las horas disponibles (ej: "a las 18:00", "a las 6", "Por favor agéndalo a las 18:00" o "Prefiero a las 18:00"):
       - DEBES llamar a "crear_tarea" con el título de la nueva tarea pendiente, la fecha y la nueva hora elegida por el usuario.
     * Si el usuario pide explícitamente mover la tarea existente (ej: "mueve la compra al bravo a las 18:00"):
       - DEBES llamar a "reprogramar_tarea" para la tarea existente, y luego a "crear_tarea" para la nueva si corresponde.

2. CREACIÓN DE TAREAS Y RECORDATORIOS:
   - Cuando el usuario solicite crear, agendar o registrar tareas sin conflicto de hora:
     * DEBES LLAMAR DIRECTAMENTE a la herramienta "crear_tarea" para CADA tarea solicitada.
     * REGLA DE HORA FIJA POR DEFECTO (BLOQUE DE 1 HORA):
       - Cuando el usuario use expresiones relativas ("mañana", "pasado mañana", "el viernes", "el sábado", "el lunes") o no especifique una hora exacta:
         - NUNCA dejes due_time en null ni vacío.
         - Asigna OBLIGATORIAMENTE una hora fija en bloques de 1 hora.
         - La hora predeterminada estándar es las "09:00" (9:00 AM).
         - Si se agendan dos o más tareas para el mismo día sin hora explícita, asigna bloques consecutivos de 1 hora fija: la primera a las "09:00", la segunda a las "10:00", la tercera a las "11:00", la cuarta a las "14:00", etc.
     * NUNCA llames a "consultar_horas_libres" ante órdenes de creación ("crea...", "agenda...", "anota...", "recuérdame..."). Solo debes llamar a "crear_tarea".
     * Si el usuario pide crear múltiples tareas en un solo mensaje, emite una llamada a "crear_tarea" para CADA UNA de ellas en la misma respuesta en paralelo.

3. GESTIÓN DE HORAS LIBRES / CONSULTA DE DISPONIBILIDAD:
   - Solo debes llamar a "consultar_horas_libres" cuando el usuario formule una PREGUNTA directa sobre su disponibilidad o espacio libre (ejemplos: "¿qué horas tengo libres el viernes?", "¿a qué hora tengo espacio mañana?").

4. ELIMINACIÓN SEGURA:
   - Si el usuario pide borrar una tarea sin especificar confirmación, antes de borrarla pregunta: "¿Estás seguro de que deseas eliminar la tarea [Nombre]?" indicando que la acción es definitiva.
   - Solo el creador de la tarea tiene permitido eliminarla.

5. TONO Y FORMATO:
   - Profesional, conciso, cálido y enfocado en la productividad. Confirma siempre las tareas creadas con su título, fecha y hora fija asignada.
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
      let detectedConflict: any = null;

      // Control de horas fijas por defecto de 1 hora para evitar colisiones en la misma fecha
      const defaultHourlySlots = [
        "09:00:00",
        "10:00:00",
        "11:00:00",
        "14:00:00",
        "15:00:00",
        "16:00:00",
        "17:00:00",
      ];
      const usedSlotsByDate = new Map<string, Set<string>>();

      for (const fc of functionCalls) {
        executedNames.push(fc.name);

        if (fc.name === "crear_tarea") {
          const taskDate = resolveDate(fc.args.due_date || currentIsoDate);
          fc.args.due_date = taskDate;

          if (!usedSlotsByDate.has(taskDate)) {
            usedSlotsByDate.set(taskDate, new Set());
          }
          const dateUsed = usedSlotsByDate.get(taskDate)!;

          if (!fc.args.due_time) {
            // Asignar el siguiente bloque fijo de 1 hora disponible para este día
            const availableSlot = defaultHourlySlots.find((s) => !dateUsed.has(s)) || "09:00:00";
            fc.args.due_time = availableSlot.substring(0, 5); // "09:00"
            dateUsed.add(availableSlot);
          } else {
            const normalized = normalizeTime(fc.args.due_time);
            if (normalized) {
              dateUsed.add(normalized);
            }
          }
        }

        const toolOutput = await executeTool(fc.name, fc.args, userId);
        if (toolOutput.suggestedSlots) {
          suggestedSlots = toolOutput.suggestedSlots;
        }
        if (toolOutput.actionRequired) {
          actionRequired = toolOutput.actionRequired;
        }

        if (fc.name === "crear_tarea") {
          if (toolOutput.result?.conflict) {
            detectedConflict = toolOutput.result;
          } else if (toolOutput.result?.task) {
            const t = toolOutput.result.task;
            const displayTime = t.due_time ? ` a las ${t.due_time.substring(0, 5)}` : (fc.args.due_time ? ` a las ${fc.args.due_time}` : " a las 09:00");
            createdTasksList.push(
              `• **${fc.args.title}** para el ${fc.args.due_date}${displayTime}`
            );
          }
        } else if (fc.name === "reprogramar_tarea" && toolOutput.result?.task) {
          const t = toolOutput.result.task;
          const displayTime = t.due_time ? ` a las ${t.due_time.substring(0, 5)}` : "";
          createdTasksList.push(
            `• Tarea reprogramada: **${t.title}** para el ${t.due_date}${displayTime}`
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
      }

      // Salvaguarda obligatoria ante conflicto de horario:
      // Si hubo conflicto, Nora NUNCA debe decir que agendó la tarea a esa hora
      if (detectedConflict) {
        const replyLower = replyText.toLowerCase();
        const claimedScheduled =
          replyLower.includes("he agendado") ||
          replyLower.includes("agendada exitosamente") ||
          replyLower.includes("he registrado") ||
          replyLower.includes("he creado");

        if (!replyText || claimedScheduled) {
          const availableSlotsFormatted = (detectedConflict.horarios_disponibles || [])
            .map((h: string) => `• ${h}`)
            .join("\n");

          replyText =
            `A las ${detectedConflict.conflicting_time} ya tienes agendada la tarea "**${detectedConflict.conflicting_task_title}**".\n\n` +
            `¿A qué hora de las disponibles prefieres agendar "**${detectedConflict.requested_title}**" (o mover la existente)?\n\n` +
            `Horarios disponibles:\n${availableSlotsFormatted}`;
        }
      } else if (!replyText) {
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
