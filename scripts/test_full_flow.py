import requests
import json
import time
from dotenv import dotenv_values

v = dotenv_values('.env')
key = v['LLM_API_KEY']
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={key}'

system_prompt = """Eres Nora, asistente ejecutiva inteligente de agenda y tareas.
Zona horaria: America/Santo_Domingo. Fecha actual: jueves 19 de noviembre de 2026.
Viernes es 2026-11-20. Sábado es 2026-11-21. Domingo es 2026-11-22.

REGLAS:
1. CREACIÓN DE TAREAS: Cuando el usuario pida crear, agendar o agregar tareas, llama a 'crear_tarea' para CADA tarea solicitada. Si son varias, llama a 'crear_tarea' para cada una.
2. CONSULTA DE HORAS: Solo llama a 'consultar_horas_libres' cuando el usuario pregunte explícitamente por su disponibilidad o qué horas tiene libres.
"""

payload1 = {
    'systemInstruction': {'parts': [{'text': system_prompt}]},
    'contents': [{'role': 'user', 'parts': [{'text': 'crea una tarea de cumpleanos para el viernes, otra de ir a visitar a juana el sabado y el viernes de hacer la compra con maria'}]}],
    'tools': [{
        'functionDeclarations': [{
            'name': 'crear_tarea',
            'description': 'Crea una nueva tarea',
            'parameters': {
                'type': 'OBJECT',
                'properties': {
                    'title': {'type': 'STRING'},
                    'due_date': {'type': 'STRING'},
                    'due_time': {'type': 'STRING'}
                },
                'required': ['title', 'due_date']
            }
        }]
    }]
}

t0 = time.time()
r1 = requests.post(url, json=payload1, timeout=10)
print(f'Paso 1 completado en {time.time()-t0:.2f}s (status {r1.status_code})')
cand = r1.json()['candidates'][0]['content']

tool_resp_parts = []
for p in cand['parts']:
    if 'functionCall' in p:
        fc = p['functionCall']
        print(f" -> Ejecutando tool: {fc['name']} - {fc['args']}")
        fr = {
            'functionResponse': {
                'name': fc['name'],
                'response': {
                    'success': True,
                    'message': f"Tarea '{fc['args']['title']}' creada para {fc['args']['due_date']}"
                }
            }
        }
        if 'id' in fc:
            fr['functionResponse']['id'] = fc['id']
        tool_resp_parts.append(fr)

payload2 = {
    'systemInstruction': {'parts': [{'text': system_prompt}]},
    'contents': [
        {'role': 'user', 'parts': [{'text': 'crea una tarea de cumpleanos para el viernes, otra de ir a visitar a juana el sabado y el viernes de hacer la compra con maria'}]},
        cand,
        {'role': 'user', 'parts': tool_resp_parts}
    ],
    'tools': payload1['tools']
}

t1 = time.time()
r2 = requests.post(url, json=payload2, timeout=10)
print(f'Paso 2 completado en {time.time()-t1:.2f}s (status {r2.status_code})')
reply = r2.json()['candidates'][0]['content']['parts'][0]['text']
print('\nRESPUESTA FINAL DE NORA:')
print(reply)
