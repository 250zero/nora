import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get('LLM_API_KEY')
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={api_key}'

# Step 1: Make tool call
payload1 = {
    'contents': [{'role': 'user', 'parts': [{'text': 'agrega una tarea llamada Comprar leche para mañana 2026-11-20'}]}],
    'tools': [{
        'functionDeclarations': [{
            'name': 'crear_tarea',
            'description': 'Crea una tarea',
            'parameters': {
                'type': 'OBJECT',
                'properties': {
                    'title': {'type': 'STRING'},
                    'due_date': {'type': 'STRING'}
                },
                'required': ['title', 'due_date']
            }
        }]
    }]
}

resp1 = requests.post(url, json=payload1, timeout=45)
print('RESP1:', resp1.status_code)
d1 = resp1.json()
cand = d1['candidates'][0]['content']
print('MODEL PARTS:', json.dumps(cand['parts'], indent=2))

# Step 2: Test functionResponse format
parts_response = []
for p in cand['parts']:
    if 'functionCall' in p:
        fc = p['functionCall']
        f_resp = {
            'functionResponse': {
                'name': fc['name'],
                'response': {'success': True, 'message': 'Tarea creada'}
            }
        }
        if 'id' in fc:
            f_resp['functionResponse']['id'] = fc['id']
        parts_response.append(f_resp)

print('\nTesting role: user with functionResponse...')
payload2_user = {
    'contents': [
        {'role': 'user', 'parts': [{'text': 'agrega una tarea llamada Comprar leche para mañana 2026-11-20'}]},
        cand,
        {'role': 'user', 'parts': parts_response}
    ],
    'tools': payload1['tools']
}
resp2_user = requests.post(url, json=payload2_user, timeout=45)
print('USER ROLE STATUS:', resp2_user.status_code)
if resp2_user.status_code == 200:
    print('USER ROLE ANSWER:', resp2_user.json()['candidates'][0]['content']['parts'][0]['text'])
else:
    print('USER ROLE ERROR:', resp2_user.text)
