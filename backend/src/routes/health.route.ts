import { Hono, type Context } from "hono";

export const healthRouter = new Hono();

healthRouter.get("/", (c: Context) => {
  return c.json({
    status: "ok",
    service: "nora-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    environment: Deno.env.get("DENO_ENV") || "production",
  });
});
