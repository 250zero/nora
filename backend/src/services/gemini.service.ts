import { z } from "zod";
import { ENV } from "../config/env.ts";
import { getSupabaseUserClient, supabase } from "../config/supabase.ts";

export type DbClient = ReturnType<typeof getSupabaseUserClient>;

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

// --- Schemas Zod de validación para argumentos de herramientas ---

export const crearTareaArgsSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  due_date: z.string().optional().nullable(),
  due_time: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(3).optional().default(2),
  responsible_name: z.string().max(80).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const actualizarTareaArgsSchema = z.object({
  task_id: z.string().uuid().optional().nullable(),
  task_title: z.string().trim().optional().nullable(),
  responsible_name: z.string().max(80).optional().nullable(),
  title: z.string().trim().min(1).max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().optional().nullable(),
  due_time: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(3).optional().nullable(),
  status: z.number().int().min(1).max(3).optional().nullable(),
});

// --- Funciones auxiliares de normalización de fecha y hora (TZ America/Santo_Domingo) ---

export function getLocalIsoDate(referenceDate?: Date, timeZone = "America/Santo_Domingo"): string {
  const now = referenceDate || new Date();
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now);
}

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

export function resolveDate(
  dateStr?: string | null,
  referenceDate?: Date,
  timeZone = "America/Santo_Domingo"
): string {
  const todayIso = getLocalIsoDate(referenceDate, timeZone);

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

export function getUpcomingDaysTable(
  referenceDate?: Date,
  timeZone = "America/Santo_Domingo"
): string {
  const todayIso = getLocalIsoDate(referenceDate, timeZone);
  const [y, m, d] = todayIso.split("-").map(Number);
  const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const rows: string[] = [];

  for (let offset = 0; offset < 14; offset++) {
    const dt = new Date(Date.UTC(y, m - 1, d + offset, 12, 0, 0));
    const iso = dt.toISOString().split("T")[0];
    const dayName = dayNames[dt.getUTCDay()];
    const tag = offset === 0 ? " (HOY)" : offset === 1 ? " (MAÑANA)" : offset === 2 ? " (PASADO MAÑANA)" : "";
    rows.push(`${iso} = ${dayName}${tag}`);
  }
  return rows.join(" | ");
}

// --- Declaración de Tools para el payload REST de Gemini ---

const toolsDeclaration = [
  {
    functionDeclarations: [
      {
        name: "consultar_horas_libres",
        description:
          "Consulta los bloques de tiempo libres en la agenda de un usuario para una fecha específica (horario laboral de 08:00 a 18:00)",
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
              description:
                "Hora fija en formato HH:mm (24 horas, ej. '09:00', '17:00'). Si el usuario no especificó hora, asigna por defecto '09:00'.",
            },
            priority: {
              type: "NUMBER",
              description:
                "Prioridad: 1=Baja ('sin prisa', 'cuando puedas'), 2=Media (por defecto), 3=Alta ('urgente', 'ya', 'importante')",
            },
            responsible_name: {
              type: "STRING",
              description: "Nombre del responsable o persona involucrada si se menciona (ej. 'Juan', 'Ana')",
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
        description:
          "Lista las tareas reales del usuario (o del equipo si es supervisor) filtrando por fecha exacta, rango de fechas, estado o búsqueda",
        parameters: {
          type: "OBJECT",
          properties: {
            fecha: {
              type: "STRING",
              description: "Fecha específica en formato YYYY-MM-DD (opcional si usa desde/hasta)",
            },
            desde: {
              type: "STRING",
              description: "Fecha inicial de rango YYYY-MM-DD (ej. inicio de esta semana)",
            },
            hasta: {
              type: "STRING",
              description: "Fecha final de rango YYYY-MM-DD (ej. fin de esta semana)",
            },
            status: {
              type: "NUMBER",
              description: "Filtrar por estado: 1=pendiente, 2=en_progreso, 3=hecha. Omitir o usar 0 para ver abiertas (no hechas).",
            },
            busqueda: {
              type: "STRING",
              description: "Texto o nombre de persona para filtrar en título o responsable",
            },
            scope: {
              type: "STRING",
              description: "'mias' (por defecto) o 'equipo' (solo si el usuario es supervisor)",
            },
          },
        },
      },
      {
        name: "completar_tarea",
        description:
          "Marca una tarea existente como hecha/completada (status = 3). Si hay más de una coincidencia (ambigüedad), devuelve la lista para preguntar al usuario cuál.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "ID UUID de la tarea a completar si se conoce",
            },
            task_title: {
              type: "STRING",
              description: "Título o palabra clave de la tarea a completar (ej. 'cobrarle a Juan')",
            },
            responsible_name: {
              type: "STRING",
              description: "Nombre de la persona mencionada si busca por responsable (ej. 'Juan')",
            },
          },
        },
      },
      {
        name: "actualizar_tarea",
        description:
          "Actualiza datos de una tarea existente (título, fecha, hora, prioridad, descripción, responsable o estado)",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "ID UUID de la tarea a modificar si se conoce",
            },
            task_title: {
              type: "STRING",
              description: "Título o palabra clave actual de la tarea para localizarla si no se conoce el ID",
            },
            title: {
              type: "STRING",
              description: "Nuevo título de la tarea",
            },
            description: {
              type: "STRING",
              description: "Nueva descripción o notas",
            },
            due_date: {
              type: "STRING",
              description: "Nueva fecha en formato YYYY-MM-DD",
            },
            due_time: {
              type: "STRING",
              description: "Nueva hora en formato HH:mm (24h)",
            },
            priority: {
              type: "NUMBER",
              description: "Nueva prioridad: 1=Baja, 2=Media, 3=Alta",
            },
            status: {
              type: "NUMBER",
              description: "Nuevo estado: 1=Pendiente, 2=En Progreso, 3=Hecha",
            },
            responsible_name: {
              type: "STRING",
              description: "Nuevo responsable",
            },
          },
        },
      },
      {
        name: "reprogramar_tarea",
        description:
          "Mueve o reprograma la fecha u hora de una tarea existente del usuario cuando hay conflicto o cuando el usuario pide moverla a otro horario",
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
      {
        name: "eliminar_tarea",
        description:
          "Solicita eliminación de una tarea existente buscando por task_id o task_title. Nunca borra sin confirmación previa del usuario.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "ID UUID de la tarea a eliminar si se conoce",
            },
            task_title: {
              type: "STRING",
              description: "Título o palabra clave de la tarea a eliminar (ej. 'Ana', 'comprar al bravo')",
            },
            responsible_name: {
              type: "STRING",
              description: "Nombre del responsable si se mencionó (ej. 'Ana')",
            },
          },
        },
      },
    ],
  },
];

// --- Helper interno para buscar tareas candidatas y detectar ambigüedad (>1 coincidencia) ---

async function findMatchingTasks(
  db: DbClient,
  userId: string,
  opts: {
    taskId?: string | null;
    searchText?: string | null;
    responsibleName?: string | null;
    onlyOpen?: boolean;
    onlyOwned?: boolean;
  }
) {
  let query = db
    .from("tasks")
    .select("id, owner_id, assignee_id, title, due_date, due_time, priority, status, responsible_name")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (opts.onlyOwned) {
    query = query.eq("owner_id", userId);
  } else {
    query = query.or(`owner_id.eq.${userId},assignee_id.eq.${userId}`);
  }

  if (opts.onlyOpen) {
    query = query.neq("status", 3);
  }

  if (opts.taskId) {
    const { data, error } = await query.eq("id", opts.taskId).limit(1);
    return { tasks: data || [], error };
  }

  const term = (opts.searchText || opts.responsibleName || "").trim();
  if (term) {
    query = query.or(`title.ilike.%${term}%,responsible_name.ilike.%${term}%`);
  }

  const { data, error } = await query.limit(10);
  return { tasks: data || [], error };
}

async function checkSlotConflict(
  db: DbClient,
  userId: string,
  taskDate: string,
  dueTimeNorm: string,
  excludeTaskId?: string
) {
  const reqHour = getHour(dueTimeNorm);
  if (!taskDate || reqHour === null) return null;

  let q = db
    .from("tasks")
    .select("id, title, due_time, due_date, status")
    .or(`owner_id.eq.${userId},assignee_id.eq.${userId}`)
    .eq("due_date", taskDate)
    .neq("status", 3);

  if (excludeTaskId) {
    q = q.neq("id", excludeTaskId);
  }

  const { data: existingTasks } = await q;

  const conflictingTask = (existingTasks || []).find((t) => {
    const tHour = getHour(t.due_time);
    return tHour !== null && tHour === reqHour;
  });

  if (!conflictingTask) return null;

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
    return sh !== null && sh !== reqHour && !occupiedHours.has(sh);
  });

  const conflictTimeFmt = conflictingTask.due_time
    ? conflictingTask.due_time.substring(0, 5)
    : `${String(reqHour).padStart(2, "0")}:00`;

  return {
    conflictingTask,
    conflictTimeFmt,
    freeSlots,
  };
}

// --- Ejecución de Tools ---

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  db: DbClient = supabase,
  userTimeZone = "America/Santo_Domingo"
): Promise<{ result: any; suggestedSlots?: string[]; actionRequired?: any }> {
  switch (toolName) {
    case "consultar_horas_libres": {
      const fecha = resolveDate(args.fecha, undefined, userTimeZone);
      const { data: tasks, error } = await db
        .from("tasks")
        .select("due_time, title")
        .or(`owner_id.eq.${userId},assignee_id.eq.${userId}`)
        .eq("due_date", fecha)
        .neq("status", 3)
        .order("due_time", { ascending: true });

      if (error) {
        return { result: { error: error.message } };
      }

      const standardSlots = ["08:30", "10:00", "11:30", "14:00", "15:30", "16:45"];
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
      const parsed = crearTareaArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { result: { success: false, error: parsed.error.errors.map((e) => e.message).join(", ") } };
      }
      const valid = parsed.data;
      const taskDate = resolveDate(valid.due_date, undefined, userTimeZone);
      let finalDueTime = normalizeTime(valid.due_time);
      if (!finalDueTime && taskDate) {
        finalDueTime = "09:00:00";
      }

      if (taskDate && finalDueTime) {
        const conflict = await checkSlotConflict(db, userId, taskDate, finalDueTime);
        if (conflict) {
          return {
            result: {
              conflict: true,
              message: `ALERTA DE CONFLICTO: A las ${conflict.conflictTimeFmt} ya tienes agendada la tarea "${conflict.conflictingTask.title}". NO debes agendar la nueva tarea "${valid.title}" a esa misma hora. Debes preguntar al usuario a cuál de las horas disponibles prefiere moverla.`,
              conflicting_task_title: conflict.conflictingTask.title,
              conflicting_task_id: conflict.conflictingTask.id,
              conflicting_time: conflict.conflictTimeFmt,
              requested_title: valid.title,
              requested_time: conflict.conflictTimeFmt,
              due_date: taskDate,
              horarios_disponibles: conflict.freeSlots,
            },
            suggestedSlots: conflict.freeSlots.slice(0, 4),
          };
        }
      }

      const newTask = {
        owner_id: userId,
        title: valid.title,
        due_date: taskDate,
        due_time: finalDueTime,
        priority: valid.priority || 2,
        responsible_name: valid.responsible_name || null,
        description: valid.description || null,
        status: 1,
        source: 2, // 2 = Creada vía Asistente IA Nora
      };

      const { data, error } = await db.from("tasks").insert(newTask).select().single();

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      const formattedHour = data.due_time ? data.due_time.substring(0, 5) : "09:00";
      return {
        result: {
          success: true,
          task: data,
          message: `Tarea "${valid.title}" agendada exitosamente para el ${data.due_date} a las ${formattedHour}.`,
        },
      };
    }

    case "listar_tareas": {
      let query = db
        .from("tasks")
        .select("id, owner_id, assignee_id, title, due_date, due_time, priority, status, responsible_name")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("due_time", { ascending: true, nullsFirst: false });

      if (args.scope !== "equipo") {
        query = query.or(`owner_id.eq.${userId},assignee_id.eq.${userId}`);
      } else {
        const { data: isSup } = await db.rpc("is_supervisor");
        if (!isSup) {
          query = query.or(`owner_id.eq.${userId},assignee_id.eq.${userId}`);
        }
      }

      if (args.fecha) {
        query = query.eq("due_date", resolveDate(args.fecha, undefined, userTimeZone));
      } else {
        if (args.desde) {
          query = query.gte("due_date", resolveDate(args.desde, undefined, userTimeZone));
        }
        if (args.hasta) {
          query = query.lte("due_date", resolveDate(args.hasta, undefined, userTimeZone));
        }
      }

      if (typeof args.status === "number" && [1, 2, 3].includes(args.status)) {
        query = query.eq("status", args.status);
      } else if (args.status === 0 || args.status === "abiertas") {
        query = query.neq("status", 3);
      }

      if (args.busqueda && typeof args.busqueda === "string" && args.busqueda.trim()) {
        const q = args.busqueda.trim();
        query = query.or(`title.ilike.%${q}%,responsible_name.ilike.%${q}%`);
      }

      const { data, error } = await query.limit(40);
      if (error) {
        return { result: { error: error.message } };
      }

      return {
        result: {
          total: data?.length || 0,
          tareas: data || [],
          nota:
            (data?.length || 0) === 0
              ? "No hay tareas reales que coincidan en la base de datos. No inventes ninguna."
              : "Usa exclusivamente estas tareas reales para responder.",
        },
      };
    }

    case "completar_tarea": {
      const { tasks: matches, error } = await findMatchingTasks(db, userId, {
        taskId: args.task_id,
        searchText: args.task_title,
        responsibleName: args.responsible_name,
        onlyOpen: true,
      });

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      if (matches.length === 0) {
        return {
          result: {
            success: false,
            not_found: true,
            error: "No encontré ninguna tarea pendiente que coincida con esa descripción.",
          },
        };
      }

      if (matches.length > 1) {
        return {
          result: {
            success: false,
            ambiguous: true,
            matches: matches.map((t) => ({
              id: t.id,
              title: t.title,
              due_date: t.due_date,
              due_time: t.due_time ? t.due_time.substring(0, 5) : null,
            })),
            message:
              `Encontré ${matches.length} tareas pendientes que coinciden. NO marques ninguna todavía; pregunta al usuario exactamente cuál de ellas desea marcar como hecha indicando sus títulos y fechas.`,
          },
        };
      }

      const target = matches[0];
      const nowIso = new Date().toISOString();
      const { data: updated, error: updateErr } = await db
        .from("tasks")
        .update({ status: 3, completed_at: nowIso, updated_at: nowIso })
        .eq("id", target.id)
        .select()
        .single();

      if (updateErr) {
        return { result: { success: false, error: updateErr.message } };
      }

      return {
        result: {
          success: true,
          task: updated,
          message: `Tarea "${updated.title}" marcada como completada.`,
        },
      };
    }

    case "actualizar_tarea": {
      const parsed = actualizarTareaArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { result: { success: false, error: parsed.error.errors.map((e) => e.message).join(", ") } };
      }
      const valid = parsed.data;

      const { tasks: matches, error } = await findMatchingTasks(db, userId, {
        taskId: valid.task_id,
        searchText: valid.task_title,
        responsibleName: valid.task_title ? null : valid.responsible_name,
      });

      if (error) {
        return { result: { success: false, error: error.message } };
      }
      if (matches.length === 0) {
        return { result: { success: false, not_found: true, error: "No encontré la tarea a actualizar." } };
      }
      if (matches.length > 1) {
        return {
          result: {
            success: false,
            ambiguous: true,
            matches: matches.map((t) => ({
              id: t.id,
              title: t.title,
              due_date: t.due_date,
              due_time: t.due_time ? t.due_time.substring(0, 5) : null,
            })),
            message:
              `Encontré ${matches.length} tareas que coinciden. NO actualices ninguna todavía; pregunta al usuario cuál de ellas desea modificar.`,
          },
        };
      }

      const target = matches[0];
      const targetDate = valid.due_date
        ? resolveDate(valid.due_date, undefined, userTimeZone)
        : target.due_date;
      const targetTime = valid.due_time
        ? normalizeTime(valid.due_time)
        : target.due_time;

      if ((valid.due_date || valid.due_time) && targetDate && targetTime && (valid.status ?? target.status) !== 3) {
        const conflict = await checkSlotConflict(db, userId, targetDate, targetTime, target.id);
        if (conflict) {
          return {
            result: {
              conflict: true,
              message: `ALERTA DE CONFLICTO: A las ${conflict.conflictTimeFmt} ya tienes "${conflict.conflictingTask.title}". Pregunta al usuario a qué hora libre prefiere mover "${target.title}".`,
              conflicting_task_title: conflict.conflictingTask.title,
              conflicting_time: conflict.conflictTimeFmt,
              requested_title: valid.title || target.title,
              horarios_disponibles: conflict.freeSlots,
            },
            suggestedSlots: conflict.freeSlots.slice(0, 4),
          };
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (valid.title !== undefined && valid.title !== null) updates.title = valid.title;
      if (valid.description !== undefined) updates.description = valid.description;
      if (valid.due_date !== undefined && valid.due_date !== null) updates.due_date = targetDate;
      if (valid.due_time !== undefined && valid.due_time !== null) updates.due_time = targetTime;
      if (valid.priority !== undefined && valid.priority !== null) updates.priority = valid.priority;
      if (valid.responsible_name !== undefined && valid.task_title) updates.responsible_name = valid.responsible_name;
      if (valid.status !== undefined && valid.status !== null) {
        updates.status = valid.status;
        updates.completed_at = valid.status === 3 ? new Date().toISOString() : null;
      }

      const { data: updated, error: updErr } = await db
        .from("tasks")
        .update(updates)
        .eq("id", target.id)
        .select()
        .single();

      if (updErr) {
        return { result: { success: false, error: updErr.message } };
      }

      return {
        result: {
          success: true,
          task: updated,
          message: `Tarea "${updated.title}" actualizada correctamente.`,
        },
      };
    }

    case "reprogramar_tarea": {
      const { tasks: matches } = await findMatchingTasks(db, userId, {
        taskId: args.task_id,
        searchText: args.task_title,
        onlyOpen: false,
      });

      let targetTask: {
        id: string;
        title: string;
        due_date: string | null;
        due_time: string | null;
      } | null = matches[0] || null;
      if (!targetTask && !args.task_title) {
        const { data: latestTasks } = await db
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
            error: "No encontré ninguna tarea para reprogramar con ese nombre.",
          },
        };
      }

      const targetDate = args.new_date
        ? resolveDate(args.new_date, undefined, userTimeZone)
        : targetTask.due_date || getLocalIsoDate(undefined, userTimeZone);
      const formattedNewTime = normalizeTime(args.new_time) || "09:00:00";

      const conflict = await checkSlotConflict(db, userId, targetDate, formattedNewTime, targetTask.id);
      if (conflict) {
        return {
          result: {
            conflict: true,
            message: `ALERTA DE CONFLICTO: A las ${conflict.conflictTimeFmt} ya tienes agendada la tarea "${conflict.conflictingTask.title}". Pregunta a qué otro horario disponible prefiere mover "${targetTask.title}".`,
            conflicting_task_title: conflict.conflictingTask.title,
            conflicting_time: conflict.conflictTimeFmt,
            requested_title: targetTask.title,
            horarios_disponibles: conflict.freeSlots,
          },
          suggestedSlots: conflict.freeSlots.slice(0, 4),
        };
      }

      const { data: updated, error } = await db
        .from("tasks")
        .update({
          due_date: targetDate,
          due_time: formattedNewTime,
          updated_at: new Date().toISOString(),
        })
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
          message: `Tarea "${updated.title}" movida exitosamente para el ${updated.due_date} a las ${formattedHour}.`,
        },
      };
    }

    case "eliminar_tarea": {
      const confirmed = args.confirmed === true;

      const { tasks: matches, error: fetchErr } = await findMatchingTasks(db, userId, {
        taskId: args.task_id,
        searchText: args.task_title,
        responsibleName: args.responsible_name,
        onlyOwned: false,
      });

      if (fetchErr) {
        return { result: { success: false, error: fetchErr.message } };
      }
      if (matches.length === 0) {
        return {
          result: {
            success: false,
            not_found: true,
            error: "La tarea no existe, no coincide con ese nombre o ya fue eliminada.",
          },
        };
      }
      if (matches.length > 1) {
        return {
          result: {
            success: false,
            ambiguous: true,
            matches: matches.map((t) => ({
              id: t.id,
              title: t.title,
              due_date: t.due_date,
              due_time: t.due_time ? t.due_time.substring(0, 5) : null,
            })),
            message:
              `Encontré ${matches.length} tareas que coinciden. Pregunta al usuario exactamente cuál desea eliminar.`,
          },
        };
      }

      const task = matches[0];
      if (task.owner_id !== userId) {
        return {
          result: {
            success: false,
            error: `Acceso denegado: solo puedes eliminar las tareas que tú mismo has creado. La tarea "${task.title}" pertenece a otro usuario.`,
          },
        };
      }

      // RF-17 / Q8: Si aún no está confirmada por el botón, registrar pending_action y solicitar confirmación
      if (!confirmed) {
        const { data: pendingRow } = await db
          .from("agent_pending_actions")
          .insert({
            user_id: userId,
            task_id: task.id,
            action_type: 1, // 1 = eliminar_tarea
            status: 1,      // 1 = pendiente
          })
          .select("id")
          .maybeSingle();

        return {
          result: {
            requires_confirmation: true,
            task_id: task.id,
            task_title: task.title,
            pending_action_id: pendingRow?.id || null,
            message: `Solicita confirmación al usuario antes de eliminar la tarea "${task.title}".`,
          },
          actionRequired: {
            type: "confirm_delete",
            taskId: task.id,
            taskTitle: task.title,
            pendingActionId: pendingRow?.id || undefined,
          },
        };
      }

      // Confirmado explícitamente: marcar pending_action como confirmada antes de eliminar la tarea (por FK CASCADE)
      await db
        .from("agent_pending_actions")
        .update({ status: 2 })
        .eq("user_id", userId)
        .eq("task_id", task.id)
        .eq("status", 1);

      const { error } = await db.from("tasks").delete().eq("id", task.id).eq("owner_id", userId);

      if (error) {
        return { result: { success: false, error: error.message } };
      }

      return {
        result: {
          success: true,
          deleted_id: task.id,
          message: `Tarea "${task.title}" eliminada exitosamente.`,
        },
      };
    }

    default:
      return { result: { error: `Herramienta desconocida: ${toolName}` } };
  }
}

// --- Orquestador principal de Chat con Tool-Calling Iterativo (hasta 3 rondas) ---

export async function chatWithNora(
  userMessage: string,
  userId: string,
  history: Array<{ role: "user" | "model"; text: string }> = [],
  db: DbClient = supabase,
  userTimeZone = "America/Santo_Domingo"
): Promise<{
  reply: string;
  suggestedSlots?: string[];
  actionRequired?: any;
  toolExecuted?: string;
  mutatedTaskIds?: string[];
  actionsSummary?: Array<{ type: string; task_id: string; title: string; due_date?: string | null; due_time?: string | null }>;
}> {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: userTimeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const currentDateStr = new Intl.DateTimeFormat("es-DO", options).format(now);
  const currentIsoDate = getLocalIsoDate(now, userTimeZone);
  const calendarTable = getUpcomingDaysTable(now, userTimeZone);

  const systemPrompt = `
Eres Nora, una asistente ejecutiva inteligente, empática y de alta precisión especializada en la gestión ágil de agenda y tareas.
Zona horaria del usuario: ${userTimeZone}.
Fecha y hora actual local: ${currentDateStr} (Fecha ISO local: ${currentIsoDate}).
TABLA DE PRÓXIMOS 14 DÍAS (úsalos exactamente para fechas relativas):
${calendarTable}

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. DETECCIÓN Y RESOLUCIÓN OBLIGATORIA DE CONFLICTOS DE HORARIO (INNEGOCIABLE):
   - NUNCA confirmes ni dobles reservas sobre una misma hora si ya existe un compromiso agendado para ese horario.
   - Si al invocar "crear_tarea", "actualizar_tarea" o "reprogramar_tarea" la herramienta responde con { conflict: true }:
     * ESTÁ ESTRICTAMENTE PROHIBIDO decir que la tarea fue agendada en la hora solicitada.
     * DEBES avisar claramente: "A las [conflicting_time] ya tienes agendada la tarea '**[conflicting_task_title]**'".
     * DEBES PREGUNTAR: "¿A qué hora de las disponibles prefieres mover o agendar esta tarea (o reubicar la anterior)?".
     * Muestra la lista de horarios libres que retorna la herramienta en 'horarios_disponibles'.
   - RESOLUCIÓN DE CONFLICTO:
     * Cuando el usuario elija o responda con una hora disponible (ej: "a las 18:00", "Por favor agéndalo a las 18:00"): invoca "crear_tarea" con la nueva hora.
     * Si pide mover la tarea existente: invoca "reprogramar_tarea" y luego "crear_tarea" si corresponde.

2. CREACIÓN DE TAREAS Y RECORDATORIOS (MULTI-TAREA Y HORA FIJA):
   - Ante órdenes de creación ("crea...", "agenda...", "anota...", "recuérdame..."):
     * LLAMA DIRECTAMENTE a "crear_tarea" para CADA tarea solicitada (en paralelo si son varias en un mismo mensaje).
     * PRIORIDAD: 3 (Alta) si dice "urgente", "ya", "importante", "lo antes posible"; 1 (Baja) si dice "cuando puedas", "sin prisa"; 2 (Media) por defecto.
     * HORA FIJA POR DEFECTO (1 HORA): si no especifica hora, asigna "09:00" para la primera del día, "10:00" para la segunda, "11:00" para la tercera, etc.
     * NUNCA llames a "consultar_horas_libres" ante órdenes de creación.

3. CONSULTAS REALES SIN ALUCINAR (RF-15):
   - Cuando el usuario pregunte qué tiene pendiente o qué tareas existen ("¿qué tengo esta semana?", "¿tengo algo con Juan?"), llama OBLIGATORIAMENTE a "listar_tareas" con las fechas o búsqueda adecuadas.
   - Responde EXCLUSIVAMENTE con los datos devueltos por la herramienta. Si devuelve 0 tareas, di honestamente que no hay tareas pendientes.

4. MODIFICACIONES, COMPLETAR Y DESAMBIGUACIÓN (RF-16):
   - Para marcar hecha usa "completar_tarea". Para editar usa "actualizar_tarea".
   - Si la herramienta responde { ambiguous: true, matches: [...] }, NO actúes a ciegas: enumera las coincidencias con su fecha/hora y pregunta cuál específica desea modificar/completar/eliminar.

5. ELIMINACIÓN SEGURA (RF-17):
   - Si el usuario pide borrar/eliminar una tarea, invoca "eliminar_tarea" para localizarla. Cuando devuelva { requires_confirmation: true }, pregunta confirmación clara al usuario indicando que el botón de confirmación ya está disponible y la acción es irreversible.

6. CONSULTA DE HORAS LIBRES:
   - Llama a "consultar_horas_libres" solo ante preguntas directas de disponibilidad ("¿qué horas tengo libres el viernes?").
`;

  const contents: any[] = [
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  let suggestedSlots: string[] | undefined;
  let actionRequired: any = undefined;
  const executedNames: string[] = [];
  const summaryLines: string[] = [];
  const mutatedTaskIds: string[] = [];
  const actionsSummary: Array<{
    type: string;
    task_id: string;
    title: string;
    due_date?: string | null;
    due_time?: string | null;
  }> = [];
  let detectedConflict: any = null;
  let replyText = "";

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

  try {
    const MAX_ITERATIONS = 3;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const resp = await fetch(`${GEMINI_API_URL}?key=${ENV.LLM_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: toolsDeclaration,
        }),
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

      const textParts: string[] = [];
      const functionCalls: Array<{ name: string; args: any; id?: string }> = [];

      for (const part of parts) {
        if (part.text) textParts.push(part.text);
        if (part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            id: part.functionCall.id || (part as any).id,
          });
        }
      }

      if (functionCalls.length === 0) {
        replyText = textParts.join("");
        break;
      }

      const functionResponseParts: any[] = [];

      for (const fc of functionCalls) {
        executedNames.push(fc.name);

        if (fc.name === "crear_tarea") {
          const taskDate = resolveDate(fc.args.due_date || currentIsoDate, now, userTimeZone);
          fc.args.due_date = taskDate;
          if (!usedSlotsByDate.has(taskDate)) {
            usedSlotsByDate.set(taskDate, new Set());
          }
          const dateUsed = usedSlotsByDate.get(taskDate)!;

          if (!fc.args.due_time) {
            const availableSlot = defaultHourlySlots.find((s) => !dateUsed.has(s)) || "09:00:00";
            fc.args.due_time = availableSlot.substring(0, 5);
            dateUsed.add(availableSlot);
          } else {
            const normalized = normalizeTime(fc.args.due_time);
            if (normalized) dateUsed.add(normalized);
          }
        }

        const toolOutput = await executeTool(fc.name, fc.args, userId, db, userTimeZone);

        if (toolOutput.suggestedSlots) {
          suggestedSlots = toolOutput.suggestedSlots;
        }
        if (toolOutput.actionRequired) {
          actionRequired = toolOutput.actionRequired;
        }

        const res = toolOutput.result;
        if (res?.conflict) {
          detectedConflict = res;
        } else if (res?.task) {
          const t = res.task;
          mutatedTaskIds.push(t.id);
          const actionType =
            fc.name === "crear_tarea"
              ? "created"
              : fc.name === "completar_tarea"
              ? "completed"
              : "updated";
          actionsSummary.push({
            type: actionType,
            task_id: t.id,
            title: t.title,
            due_date: t.due_date,
            due_time: t.due_time,
          });
          const displayTime = t.due_time ? ` a las ${t.due_time.substring(0, 5)}` : "";
          summaryLines.push(`• **${t.title}** (${t.due_date || "Sin fecha"}${displayTime})`);
        } else if (res?.deleted_id) {
          mutatedTaskIds.push(res.deleted_id);
        }

        const fr: any = {
          name: fc.name,
          response: toolOutput.result,
        };
        if (fc.id) fr.id = fc.id;
        functionResponseParts.push({ functionResponse: fr });
      }

      // Agregar turno de modelo (con functionCalls) y respuesta de herramientas al contexto
      if (candidate?.content) {
        contents.push(candidate.content);
      }
      contents.push({
        role: "user",
        parts: functionResponseParts,
      });

      // Si requiere confirmación destructiva, devolvemos inmediatamente tras explicar sin seguir ejecutando herramientas
      if (actionRequired) {
        const confirmFollowUp = await fetch(`${GEMINI_API_URL}?key=${ENV.LLM_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: toolsDeclaration,
          }),
        });
        if (confirmFollowUp.ok) {
          const d = await confirmFollowUp.json();
          replyText = (d.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
        }
        if (!replyText) {
          replyText = `¿Estás seguro de que deseas eliminar definitivamente la tarea "**${actionRequired.taskTitle}**"? Confirma con los botones de abajo.`;
        }
        break;
      }
    }

    // Salvaguarda obligatoria ante conflicto de horario
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
      if (summaryLines.length > 0) {
        replyText = `¡Listo! He procesado ${summaryLines.length} tarea(s) en tu agenda:\n\n${summaryLines.join("\n")}`;
      } else if (suggestedSlots && suggestedSlots.length > 0) {
        replyText =
          `He consultado tu agenda. Dispones de los siguientes horarios libres:\n` +
          suggestedSlots.map((s) => `• ${s}`).join("\n");
      }
    }

    return {
      reply: replyText || "¡Hola! Estoy lista para ayudarte con tu agenda y tareas. ¿Qué coordinamos hoy?",
      suggestedSlots,
      actionRequired,
      toolExecuted: executedNames.length > 0 ? executedNames.join(", ") : undefined,
      mutatedTaskIds,
      actionsSummary,
    };
  } catch (err: any) {
    console.error("Error en chatWithNora:", err);
    throw err;
  }
}
