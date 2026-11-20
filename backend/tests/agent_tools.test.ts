import assert from "node:assert/strict";

// Garantiza ejecución aislada en entornos CI sin .env
if (!Deno.env.get("SUPABASE_URL")) {
  Deno.env.set("SUPABASE_URL", "https://unit-test-placeholder.supabase.co");
}
if (!Deno.env.get("SUPABASE_ANON_KEY")) {
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key-placeholder");
}

const {
  actualizarTareaArgsSchema,
  crearTareaArgsSchema,
  getHour,
  getUpcomingDaysTable,
  normalizeTime,
  resolveDate,
} = await import("../src/services/gemini.service.ts");

Deno.test("RF-19: resolveDate resuelve hoy, mañana y pasado mañana en America/Santo_Domingo", () => {
  // 2026-11-19 15:00 hora RD (19:00 UTC)
  const ref = new Date("2026-11-19T19:00:00Z");
  assert.equal(resolveDate("hoy", ref), "2026-11-19");
  assert.equal(resolveDate("mañana", ref), "2026-11-20");
  assert.equal(resolveDate("pasado mañana", ref), "2026-11-21");
});

Deno.test("RF-19: resolveDate resuelve correctamente cerca de medianoche RD (23:55 y 00:05)", () => {
  // 23:55 del 19-nov en Santo Domingo = 03:55 UTC del 20-nov
  const beforeMidnightRd = new Date("2026-11-20T03:55:00Z");
  assert.equal(resolveDate("hoy", beforeMidnightRd), "2026-11-19");
  assert.equal(resolveDate("mañana", beforeMidnightRd), "2026-11-20");

  // 00:05 del 20-nov en Santo Domingo = 04:05 UTC del 20-nov
  const afterMidnightRd = new Date("2026-11-20T04:05:00Z");
  assert.equal(resolveDate("hoy", afterMidnightRd), "2026-11-20");
  assert.equal(resolveDate("mañana", afterMidnightRd), "2026-11-21");
});

Deno.test("RF-19 / Q4: resolveDate mueve 'el viernes' al próximo viernes (+7) si hoy es viernes", () => {
  // Jueves 19-nov-2026 -> "el viernes" = 20-nov-2026
  const thursday = new Date("2026-11-19T16:00:00Z");
  assert.equal(resolveDate("el viernes", thursday), "2026-11-20");

  // Viernes 20-nov-2026 -> "el viernes" = próximo viernes 27-nov-2026
  const friday = new Date("2026-11-20T16:00:00Z");
  assert.equal(resolveDate("el viernes", friday), "2026-11-27");
});

Deno.test("Horario fijo: normalizeTime y getHour convierten 12h/24h correctamente", () => {
  assert.equal(normalizeTime("5 pm"), "17:00:00");
  assert.equal(normalizeTime("5:30 PM"), "17:30:00");
  assert.equal(normalizeTime("12:15 am"), "00:15:00");
  assert.equal(normalizeTime("09:00"), "09:00:00");
  assert.equal(getHour("5 pm"), 17);
  assert.equal(getHour("09:00:00"), 9);
});

Deno.test("RF-14: validación Zod de crearTareaArgsSchema y actualizarTareaArgsSchema", () => {
  const validCreate = crearTareaArgsSchema.safeParse({
    title: "Cobrarle a Juan",
    due_date: "2026-11-20",
    priority: 3,
  });
  assert.equal(validCreate.success, true);

  const emptyTitle = crearTareaArgsSchema.safeParse({
    title: "   ",
    due_date: "2026-11-20",
  });
  assert.equal(emptyTitle.success, false);

  const badPriority = crearTareaArgsSchema.safeParse({
    title: "Cotización",
    priority: 9,
  });
  assert.equal(badPriority.success, false);

  const badUuidUpdate = actualizarTareaArgsSchema.safeParse({
    task_id: "no-es-uuid",
    title: "Nuevo título",
  });
  assert.equal(badUuidUpdate.success, false);
});

Deno.test("RF-19: getUpcomingDaysTable genera tabla exacta de 14 días en RD", () => {
  const beforeMidnightRd = new Date("2026-11-20T03:55:00Z"); // 23:55 del 19-nov en RD
  const table = getUpcomingDaysTable(beforeMidnightRd);
  const entries = table.split(" | ");
  assert.equal(entries.length, 14);
  assert.equal(entries[0].includes("2026-11-19 = jueves (HOY)"), true);
  assert.equal(entries[1].includes("2026-11-20 = viernes (MAÑANA)"), true);
});
