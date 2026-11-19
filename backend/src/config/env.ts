import { load } from "@std/dotenv";

// Cargar variables de .env si existe localmente
try {
  await load({ export: true, envPath: "../.env" });
} catch {
  // En producción o contenedor las variables vienen directo de Deno.env
}

export const ENV = {
  PORT: Number(Deno.env.get("PORT") || "3000"),
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
  DATABASE_URL: Deno.env.get("DATABASE_URL") || "",
  SUPABASE_DB_PASSWORD: Deno.env.get("SUPABASE_DB_PASSWORD") || "",
  LLM_PROVIDER: Deno.env.get("LLM_PROVIDER") || "gemini",
  LLM_API_KEY: Deno.env.get("LLM_API_KEY") || "",
  NODE_ENV: Deno.env.get("NODE_ENV") || "development",
};
