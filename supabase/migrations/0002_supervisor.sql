-- ==============================================================================
-- Migración 0002_supervisor.sql — Roles RBAC y Gestión de Usuarios
-- ==============================================================================

-- 1. USER_ROLES (5FN, sin autoescalada)
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role    smallint not null check (role in (1,2)), -- 1 = Miembro, 2 = Supervisor
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
create policy roles_select_own on public.user_roles for select to authenticated 
  using (user_id = auth.uid());

-- 2. FUNCIÓN IS_SUPERVISOR (SECURITY DEFINER para evitar recursión RLS)
create or replace function public.is_supervisor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles 
    where user_id = auth.uid() and role = 2
  );
$$;

-- 3. POLÍTICAS RLS DE TAREAS PARA SUPERVISOR
drop policy if exists tasks_select_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;

create policy tasks_select on public.tasks for select to authenticated
  using (owner_id = auth.uid() or assignee_id = auth.uid() or public.is_supervisor());

create policy tasks_insert on public.tasks for insert to authenticated
  with check (owner_id = auth.uid() and (assignee_id is null or assignee_id = auth.uid() or public.is_supervisor()));

create policy tasks_update on public.tasks for update to authenticated
  using (owner_id = auth.uid() or assignee_id = auth.uid() or public.is_supervisor())
  with check (owner_id = auth.uid() or assignee_id = auth.uid() or public.is_supervisor());

create policy tasks_delete on public.tasks for delete to authenticated
  using (owner_id = auth.uid() or public.is_supervisor());

-- 4. GUARDA: Solo el supervisor reasigna a terceros; el asignado solo cambia estado
create or replace function public.tg_tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.assignee_id is distinct from old.assignee_id and not public.is_supervisor()
     and new.assignee_id is distinct from auth.uid() and new.assignee_id is not null then
    raise exception 'Solo un supervisor puede reasignar tareas a otros colaboradores';
  end if;
  if old.owner_id <> auth.uid() and not public.is_supervisor()
     and (new.title, new.description, new.due_date, new.due_time, new.priority, new.responsible_name, new.assignee_id)
         is distinct from (old.title, old.description, old.due_date, old.due_time, old.priority, old.responsible_name, old.assignee_id) then
    raise exception 'El colaborador asignado únicamente puede actualizar el estado de la tarea';
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_guard on public.tasks;
create trigger trg_tasks_guard before update on public.tasks
for each row execute function public.tg_tasks_guard();

-- 5. RLS DE GESTIÓN DE USUARIOS (CRUD para Supervisor)
create policy profiles_select_supervisor on public.profiles for select to authenticated 
  using (public.is_supervisor());

create policy profiles_delete_supervisor on public.profiles for delete to authenticated 
  using (public.is_supervisor());

-- 6. RLS DE AUDITORÍA (Solo lectura para Supervisor)
drop policy if exists audit_select_supervisor on public.audit_logs;
create policy audit_select_supervisor on public.audit_logs for select to authenticated 
  using (public.is_supervisor());

-- 7. ASIGNAR ROL INICIAL A USUARIOS SEED
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 1), -- Juan Pérez: Miembro
  ('a0000000-0000-0000-0000-000000000002', 2)  -- Ana Gómez: Supervisor
ON CONFLICT (user_id, role) DO NOTHING;
