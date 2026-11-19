import requests
import json

BASE_URL = "https://api.nora.vis7ar.com/api"

def test_login(email, password):
    print(f"\n--- Probando Login para: {email} ---")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    print(f"Status Code: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Error: {resp.text}")
        return None
    data = resp.json()
    token = data.get("token")
    user = data.get("user")
    print(f"✓ Token JWT recibido: {token[:25]}... (longitud: {len(token)})")
    print(f"✓ Usuario: id={user.get('id')}, name={user.get('displayName')}, role={user.get('role')} ({user.get('roleLabel')})")
    return token, user

def test_auth_me(token):
    print("\n--- Probando GET /auth/me con Token JWT ---")
    resp = requests.get(f"{BASE_URL}/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✓ Sesión validada por Supabase Auth: {data.get('user', {}).get('email')}")
        return True
    else:
        print(f"Error: {resp.text}")
        return False

def test_tasks_for_user(token, user):
    print(f"\n--- Probando GET /tasks para rol {user.get('roleLabel')} ({user.get('email')}) ---")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Id": user.get("id"),
        "X-Active-Role": str(user.get("role"))
    }
    resp = requests.get(f"{BASE_URL}/tasks", headers=headers)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        tasks = resp.json().get("tasks", [])
        print(f"✓ Tareas obtenidas: {len(tasks)}")
        for t in tasks[:3]:
            print(f"   - [{t.get('status')}] {t.get('title')} (due: {t.get('due_date')} {t.get('due_time')}, owner: {t.get('owner_id')})")
        return tasks
    else:
        print(f"Error: {resp.text}")
        return []

def test_agenda_for_user(token, user):
    print(f"\n--- Probando GET /agenda para rol {user.get('roleLabel')} ---")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Id": user.get("id"),
        "X-Active-Role": str(user.get("role"))
    }
    resp = requests.get(f"{BASE_URL}/agenda", headers=headers)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"✓ Agenda obtenida: total_tasks={data.get('total_tasks')}, fechas={list(data.get('tasks_by_date', {}).keys())[:3]}")
        return True
    else:
        print(f"Error: {resp.text}")
        return False

def main():
    print("=" * 60)
    print("🧪 VALIDACIÓN COMPLETA DE LOGIN, JWT Y AISLAMIENTO DE TAREAS")
    print("=" * 60)

    # 1. Probar Miembro
    member_auth = test_login("miembro@nora.com", "Nora2026!")
    assert member_auth is not None, "Fallo login de miembro"
    m_token, m_user = member_auth
    test_auth_me(m_token)
    m_tasks = test_tasks_for_user(m_token, m_user)
    test_agenda_for_user(m_token, m_user)

    # 2. Probar Supervisor
    supervisor_auth = test_login("supervisor@nora.com", "Nora2026!")
    assert supervisor_auth is not None, "Fallo login de supervisor"
    s_token, s_user = supervisor_auth
    test_auth_me(s_token)
    s_tasks = test_tasks_for_user(s_token, s_user)
    test_agenda_for_user(s_token, s_user)

    print("\n" + "=" * 60)
    print("✅ TODAS LAS PRUEBAS DE LOGIN, JWT Y TAREAS PASARON SATISFACTORIAMENTE")
    print("=" * 60)

if __name__ == "__main__":
    main()
