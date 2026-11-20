import requests

BASE_URL = "https://api.nora.vis7ar.com/api"

def main():
    print("=" * 60)
    print("🔒 VALIDACIÓN DE SEGURIDAD: BORRADO EXCLUSIVO POR EL CREADOR")
    print("=" * 60)

    # 1. Login Miembro (Juan)
    resp_m = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "miembro@nora.com",
        "password": "Nora2026!"
    })
    token_m = resp_m.json()["token"]
    user_m = resp_m.json()["user"]
    print(f"✓ Usuario A (Miembro): {user_m['displayName']} ({user_m['id']})")

    # 2. Login Supervisor (Ana)
    resp_s = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "supervisor@nora.com",
        "password": "Nora2026!"
    })
    token_s = resp_s.json()["token"]
    user_s = resp_s.json()["user"]
    print(f"✓ Usuario B (Supervisor): {user_s['displayName']} ({user_s['id']})")

    # 3. Usuario A crea una tarea de prueba
    print("\n--- Paso 1: Usuario A crea una tarea propia ---")
    create_resp = requests.post(f"{BASE_URL}/tasks", json={
        "title": "Tarea de prueba de seguridad",
        "description": "Esta tarea pertenece exclusivamente a Usuario A",
        "due_date": "2026-11-25",
        "priority": 2
    }, headers={
        "Authorization": f"Bearer {token_m}",
        "X-User-Id": user_m["id"],
        "X-Active-Role": "1"
    })
    task_id = create_resp.json()["task"]["id"]
    print(f"✓ Tarea creada con id: {task_id}")

    # 4. Usuario B intenta borrar la tarea de Usuario A -> DEBE SER RECHAZADO (403)
    print("\n--- Paso 2: Usuario B intenta borrar la tarea de Usuario A ---")
    del_forbidden = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers={
        "Authorization": f"Bearer {token_s}",
        "X-User-Id": user_s["id"],
        "X-Active-Role": "2"
    })
    print(f"Status Code: {del_forbidden.status_code}")
    print(f"Respuesta: {del_forbidden.json()}")
    assert del_forbidden.status_code == 403, "¡FALLO DE SEGURIDAD! Usuario B pudo borrar la tarea de Usuario A"
    print("✓ RECHAZADO CORRECTAMENTE: El usuario ajeno no puede borrar la tarea (403 Forbidden).")

    # 5. Usuario A borra su propia tarea -> DEBE SER PERMITIDO (200)
    print("\n--- Paso 3: Usuario A borra su propia tarea ---")
    del_allowed = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers={
        "Authorization": f"Bearer {token_m}",
        "X-User-Id": user_m["id"],
        "X-Active-Role": "1"
    })
    print(f"Status Code: {del_allowed.status_code}")
    print(f"Respuesta: {del_allowed.json()}")
    assert del_allowed.status_code == 200, "Fallo al borrar tarea por el propio creador"
    print("✓ PERMITIDO CORRECTAMENTE: El creador pudo borrar su propia tarea exitosamente (200 OK).")

    print("\n" + "=" * 60)
    print("✅ REGLA DE NEGOCIO VALIDADA Y BLINDADA EN PRODUCCIÓN")
    print("=" * 60)

if __name__ == "__main__":
    main()
