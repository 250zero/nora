-- ==============================================================================
-- Seeds Idempotentes para Nora (Evaluación y Pruebas)
-- ==============================================================================

-- Perfiles de prueba (Miembro Juan y Supervisor Ana)
INSERT INTO public.profiles (id, display_name, email, timezone)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Juan Pérez (Miembro)', 'juan@nora.com', 'America/Santo_Domingo'),
  ('a0000000-0000-0000-0000-000000000002', 'Ana Gómez (Supervisor)', 'ana@nora.com', 'America/Santo_Domingo')
ON CONFLICT (id) DO UPDATE 
SET display_name = EXCLUDED.display_name, email = EXCLUDED.email;

-- Tareas de prueba con fechas dinámicas
INSERT INTO public.tasks (id, owner_id, title, description, due_date, due_time, priority, status, responsible_name, source)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cobrarle factura pendiente a cliente Juan', 'Factura #1042 por servicios de consultoría', CURRENT_DATE, '10:00:00', 3, 1, 'Juan Pérez', 1),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Enviar cotización a Ana mañana temprano', 'Propuesta de rediseño de interfaz PWA', CURRENT_DATE + 1, '11:30:00', 2, 1, 'Ana Gómez', 2),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Revisar reporte de auditoría mensual', 'Validar accesos y registros de seguridad', CURRENT_DATE + 3, '16:00:00', 1, 1, 'Juan Pérez', 1)
ON CONFLICT (id) DO NOTHING;
