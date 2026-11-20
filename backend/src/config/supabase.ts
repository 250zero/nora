import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { ENV } from "./env.ts";

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.warn("⚠️ SUPABASE_URL o SUPABASE_ANON_KEY no están configuradas.");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cliente base anon (Auth login/register y escritura pública controlada en audit_logs)
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Función para instanciar cliente con el token JWT de la petición (enforza RLS real en Postgres)
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

// Cliente scoped al JWT del request Hono
export function getSupabaseForRequest(c: Context) {
  return getSupabaseUserClient(c.req.header("Authorization"));
}

// Decodifica el claim `sub` del JWT Bearer (PostgREST valida la firma en cada consulta)
export function extractUserIdFromJwt(authHeader?: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (typeof payload.sub === "string" && UUID_REGEX.test(payload.sub)) {
      return payload.sub;
    }
  } catch {
    return null;
  }
  return null;
}

// Obtiene el UUID del usuario desde contexto Hono, JWT o header X-User-Id validado
export function extractUserIdFromRequest(c: Context): string | null {
  const ctxUserId = c.get("auditUserId") as string | undefined;
  if (ctxUserId && UUID_REGEX.test(ctxUserId)) {
    return ctxUserId;
  }

  const jwtUserId = extractUserIdFromJwt(c.req.header("Authorization"));
  if (jwtUserId) {
    return jwtUserId;
  }

  const headerId = c.req.header("X-User-Id");
  if (headerId && UUID_REGEX.test(headerId)) {
    return headerId;
  }

  return null;
}
