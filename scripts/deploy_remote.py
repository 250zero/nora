import os
import sys
import posixpath
import paramiko

HOST = "159.203.103.8"
USER = "root"
PASSWORD = os.environ.get("VISAR_SSH_PASS", "Adalberto123")
REMOTE_BASE = "/var/www/nora.vis7ar.com"

def sftp_mkdir_p(sftp, remote_directory):
    dirs = []
    dir_path = remote_directory
    while len(dir_path) > 1:
        dirs.append(dir_path)
        dir_path, _ = posixpath.split(dir_path)
    if len(dir_path) == 1 and not dirs:
        dirs.append(dir_path)
    while len(dirs):
        curr_dir = dirs.pop()
        try:
            sftp.stat(curr_dir)
        except IOError:
            sftp.mkdir(curr_dir)

def upload_directory(sftp, local_dir, remote_dir):
    sftp_mkdir_p(sftp, remote_dir)
    for root, dirs, files in os.walk(local_dir):
        # Evitar subir node_modules locales si existieran
        if "node_modules" in root or ".git" in root or ".cache" in root:
            continue
        rel_path = os.path.relpath(root, local_dir).replace("\\", "/")
        current_remote = remote_dir if rel_path == "." else posixpath.join(remote_dir, rel_path)
        sftp_mkdir_p(sftp, current_remote)
        for f in files:
            local_file = os.path.join(root, f)
            remote_file = posixpath.join(current_remote, f)
            sftp.put(local_file, remote_file)

def run_cmd(client, cmd):
    print(f"\n[EXEC] {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out)
    if err:
        print(f"[ERR] {err}")
    return out

def main():
    print("=" * 60)
    print(f"🚀 Desplegando Nora en Visar ({USER}@{HOST})...")
    print("=" * 60)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=22, username=USER, password=PASSWORD, timeout=15)
    sftp = client.open_sftp()

    # 1. Crear directorios base
    print("\n[1/6] Creando directorios remotos...")
    run_cmd(client, f"mkdir -p {REMOTE_BASE}/dist/nora/browser {REMOTE_BASE}/backend {REMOTE_BASE}/deploy")

    # 2. Subir estáticos Frontend Angular PWA
    print("\n[2/6] Subiendo Frontend Angular PWA compilado...")
    pwa_dist = os.path.abspath("pwa/dist/nora/browser")
    if not os.path.exists(pwa_dist):
        print(f"ERROR: {pwa_dist} no existe. Por favor compila con npm run build.")
        sys.exit(1)
    upload_directory(sftp, pwa_dist, f"{REMOTE_BASE}/dist/nora/browser")
    print("✓ Frontend PWA subido exitosamente.")

    # 3. Subir Backend Deno
    print("\n[3/6] Subiendo Backend Deno...")
    backend_dir = os.path.abspath("backend")
    upload_directory(sftp, backend_dir, f"{REMOTE_BASE}/backend")
    
    # Subir archivo .env al backend
    env_file = os.path.abspath(".env")
    if os.path.exists(env_file):
        sftp.put(env_file, f"{REMOTE_BASE}/backend/.env")
        print("✓ Archivo .env transferido al backend.")
    print("✓ Backend Deno subido exitosamente.")

    # 4. Subir y Actualizar servicio systemd
    print("\n[4/6] Configurando servicio systemd nora-backend...")
    service_local = os.path.abspath("deploy/nora-backend.service")
    sftp.put(service_local, "/etc/systemd/system/nora-backend.service")
    run_cmd(client, "systemctl daemon-reload && systemctl enable nora-backend && systemctl restart nora-backend")

    # 5. Recargar Nginx
    print("\n[5/6] Verificando y recargando Nginx...")
    run_cmd(client, "nginx -t && systemctl reload nginx")

    # 6. Comprobación de Salud en Vivo
    print("\n[6/6] Comprobando salud de los servicios...")
    run_cmd(client, "sleep 2 && systemctl is-active nora-backend")
    run_cmd(client, "curl -s http://127.0.0.1:3001/api/health")
    run_cmd(client, "curl -sI https://nora.vis7ar.com | head -n 5")
    run_cmd(client, "curl -s https://api.nora.vis7ar.com/api/health")

    sftp.close()
    client.close()
    print("\n" + "=" * 60)
    print("🎉 Despliegue completado con éxito!")
    print("   PWA Frontend: https://nora.vis7ar.com")
    print("   API Backend:  https://api.nora.vis7ar.com")
    print("=" * 60)

if __name__ == "__main__":
    main()
