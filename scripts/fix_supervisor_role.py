import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('159.203.103.8', port=22, username='root', password='Adalberto123', timeout=15)

script_content = """
import { supabase } from "./src/config/supabase.ts";

console.log("Actualizando rol de supervisor@nora.com con Supabase Client...");
const { error: err1 } = await supabase
  .from("user_roles")
  .upsert({ user_id: "95e1979f-f185-4f60-afcb-2c0eacf6aa49", role: 2 });
if (err1) console.error("Error al actualizar supervisor@nora.com:", err1);

const { error: err2 } = await supabase
  .from("user_roles")
  .upsert({ user_id: "a0000000-0000-0000-0000-000000000002", role: 2 });
if (err2) console.error("Error al actualizar demo supervisor:", err2);

console.log("Verificando roles...");
const { data: roles } = await supabase
  .from("user_roles")
  .select("user_id, role");
console.log("ROLES:", roles);

// Insertar un par de tareas para el miembro y el supervisor si la tabla está vacía
const { data: tasks } = await supabase.from("tasks").select("id").limit(1);
if (!tasks || tasks.length === 0) {
  console.log("Insertando tareas de prueba...");
  const today = new Date().toISOString().split("T")[0];
  await supabase.from("tasks").insert([
    {
      owner_id: "a686ba65-f80e-41f8-988c-0d0a56016630",
      title: "Revisar entregable semanal de sprint",
      description: "Revisión técnica de historias de usuario",
      due_date: today,
      due_time: "10:00:00",
      priority: 2,
      status: 1,
      source: 1,
    },
    {
      owner_id: "a686ba65-f80e-41f8-988c-0d0a56016630",
      title: "Actualizar reporte de métricas PWA",
      description: "Verificar Lighthouse y PWA offline",
      due_date: today,
      due_time: "15:30:00",
      priority: 1,
      status: 1,
      source: 1,
    },
    {
      owner_id: "95e1979f-f185-4f60-afcb-2c0eacf6aa49",
      title: "Aprobación de arquitectura de referencia",
      description: "Validar directrices de 5FN y Onion",
      due_date: today,
      due_time: "11:00:00",
      priority: 3,
      status: 1,
      source: 1,
    },
  ]);
  console.log("Tareas creadas!");
} else {
  console.log("Ya existen", tasks.length, "tareas.");
}
"""

sftp = client.open_sftp()
with sftp.file('/var/www/nora.vis7ar.com/backend/fix_roles.ts', 'w') as f:
    f.write(script_content)
sftp.close()

stdin, stdout, stderr = client.exec_command("cd /var/www/nora.vis7ar.com/backend && /root/.deno/bin/deno run --allow-net --allow-env --env=.env fix_roles.ts")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
