import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.ts";

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.warn("⚠️ SUPABASE_URL o SUPABASE_ANON_KEY no están configuradas.");
}

// Cliente base hacia Supabase Cloud
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Función para instanciar cliente con el token JWT de la petición
export function getSupabaseUserClient(authHeader?: string) {
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}
