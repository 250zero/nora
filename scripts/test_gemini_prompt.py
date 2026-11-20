import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get('LLM_API_KEY')
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={api_key}'

system_prompt = """Eres Nora, una asistente ejecutiva inteligente y ágil para gestión de agenda y tareas.
Zona horaria: America/Santo_Domingo (UTC-4).
Fecha actual: jueves, 19 de noviembre de 2026 (ISO: 2026-11-19).
Viernes es 2026-11-20. Sábado es 2026-11-21. Domingo es 2026-11-22.

REGLAS FUNDAMENTALES:
1. CREACIÓN DE TAREAS Y RECORDATORIOS:
   - Cuando el usuario solicite crear, agregar o agendar una o varias tareas (ej. "crea una tarea de...", "agrega...", "anota..."), DEBES LLAMAR DIRECTAMENTE A "crear_tarea" para cada tarea identificada.
   - Si el usuario no especificó una hora concreta para la tarea, puedes asignar una hora tentativa por defecto (ej. 09:00, 10:00 o 15:00) o dejar due_time vacío según corresponda, pero SIEMPRE crea la tarea.
   - Si el usuario menciona varias tareas en el mismo mensaje, llama a "crear_tarea" para CADA UNA de ellas en la misma respuesta.

2. CONSULTA DE DISPONIBILIDAD:
   - Solo consulta horas libres ("consultar_horas_libres") cuando el usuario pregunte explícitamente por su disponibilidad o cuándo tiene tiempo libre (ej. "¿a qué hora puedo reunirme mañana?", "¿qué horas tengo libres el viernes?").

3. CONFIRMACIÓN CLARA:
   - Responde confirmando cada tarea agendada con su título, fecha y hora asignada de forma amigable y concisa.
"""

payload = {
    'systemInstruction': {'parts': [{'text': system_prompt}]},
    'contents': [{'role': 'user', 'parts': [{'text': 'crea una tarea de cumpleanos para el viernes, otra de ir a visitar a juana el sabado y el viernes de hacer la compra con maria'}]}],
    'generationConfig': {
        'thinkingConfig': {
            'thinkingBudget': 0
        }
    },
    'tools': [{
        'functionDeclarations': [
            {
                'name': 'consultar_horas_libres',
                'description': 'Consulta los bloques de tiempo libres en la agenda',
                'parameters': {
                    'type': 'OBJECT',
                    'properties': {'fecha': {'type': 'STRING'}},
                    'required': ['fecha']
                }
            },
            {
                'name': 'crear_tarea',
                'description': 'Crea una nueva tarea o compromiso en la agenda del usuario',
                'parameters': {
                    'type': 'OBJECT',
                    'properties': {
                        'title': {'type': 'STRING', 'description': 'Título o nombre de la tarea'},
                        'due_date': {'type': 'STRING', 'description': 'Fecha YYYY-MM-DD'},
                        'due_time': {'type': 'STRING', 'description': 'Hora HH:mm opcional'},
                        'priority': {'type': 'NUMBER', 'description': '1=Baja, 2=Media, 3=Alta'},
                        'responsible_name': {'type': 'STRING'},
                        'description': {'type': 'STRING'}
                    },
                    'required': ['title', 'due_date']
                }
            }
        ]
    }]
}

start = time.time()
resp = requests.post(url, json=payload, timeout=30)
dur = time.time() - start
print(f'STATUS: {resp.status_code} in {dur:.2f}s')
data = resp.json()
candidate = data.get('candidates', [{}])[0]
parts = candidate.get('content', {}).get('parts', [])
print('PARTS COUNT:', len(parts))
for i, p in enumerate(parts):
    if 'functionCall' in p:
        print(f"Tool Call {i+1}:", p['functionCall']['name'], p['functionCall']['args'])
    elif 'text' in p:
        print("Text:", p['text'][:100])
