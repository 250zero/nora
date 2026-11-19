-- ==============================================================================
-- Seeds Idempotentes para Nora (Evaluación y Pruebas)
-- Inserta usuarios en auth.users (que dispara la creación automática de profiles)
-- y crea tareas iniciales de prueba.
-- ==============================================================================

-- 1. Usuarios en auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES 
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'juan@nora.com',
    crypt('Nora2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Juan Pérez (Miembro)"}',
    now(),
    now()
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ana@nora.com',
    crypt('Nora2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Ana Gómez (Supervisor)"}',
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE 
SET raw_user_meta_data = EXCLUDED.raw_user_meta_data;

-- 2. Asegurar Perfiles en public.profiles
INSERT INTO public.profiles (id, display_name, email, timezone)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Juan Pérez (Miembro)', 'juan@nora.com', 'America/Santo_Domingo'),
  ('a0000000-0000-0000-0000-000000000002', 'Ana Gómez (Supervisor)', 'ana@nora.com', 'America/Santo_Domingo')
ON CONFLICT (id) DO UPDATE 
SET display_name = EXCLUDED.display_name, email = EXCLUDED.email;

-- 3. Tareas iniciales de prueba
INSERT INTO public.tasks (id, owner_id, title, description, due_date, due_time, priority, status, responsible_name, source)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cobrarle factura pendiente a cliente Juan', 'Factura #1042 por servicios de consultoría', CURRENT_DATE, '10:00:00', 3, 1, 'Juan Pérez', 1),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Enviar cotización a Ana mañana temprano', 'Propuesta de rediseño de interfaz PWA', CURRENT_DATE + 1, '11:30:00', 2, 1, 'Ana Gómez', 2),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Revisar reporte de auditoría mensual', 'Validar accesos y registros de seguridad', CURRENT_DATE + 3, '16:00:00', 1, 1, 'Juan Pérez', 1)
ON CONFLICT (id) DO NOTHING;
