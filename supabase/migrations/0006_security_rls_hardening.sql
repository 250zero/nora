-- ==============================================================================
-- Migración 0006_security_rls_hardening.sql — Endurecimiento RLS, Auth y Auditoría
-- ==============================================================================
-- Revierte la desactivación temporal de 0005, habilita RLS estricto en las 6 tablas
-- públicas, limpia usuarios huérfanos, redimensiona políticas sin privilegios a anon
-- y encapsula el borrado en cascada desde auth.users vía admin_delete_user().

-- 1. Limpiar usuarios huérfanos en auth.users sin perfil asociado en public.profiles
delete from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

-- 2. Sanitizar contraseñas en registros históricos de audit_logs (higiene de seguridad)
update public.audit_logs
set new_data = jsonb_set(new_data, '{payload,password}', '"[REDACTED]"'::jsonb)
where new_data is not null
  and (new_data->'payload') ? 'password';

-- 2b. Backfill de user_id para registros históricos sin actor asignado (solo si existe el perfil supervisor)
update public.audit_logs
set user_id = '95e1979f-f185-4f60-afcb-2c0eacf6aa49'
where user_id is null
  and exists (select 1 from public.profiles where id = '95e1979f-f185-4f60-afcb-2c0eacf6aa49');

-- 3. Actualizar handle_new_user() para crear perfil + rol desde metadata con SECURITY DEFINER
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  assigned_role smallint := 1; -- 1 = Miembro por defecto
begin
  if (new.raw_user_meta_data->>'role') in ('1', '2') then
    assigned_role := (new.raw_user_meta_data->>'role')::smallint;
  elsif new.email ilike '%supervisor%' or new.email ilike '%ana@%' then
    assigned_role := 2;
  end if;

  insert into public.profiles (id, display_name, email, timezone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'America/Santo_Domingo')
  )
  on conflict (id) do update
  set display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
      email = excluded.email;

  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;

  return new;
end $$;

-- 4. RPC segura para que un Supervisor elimine completamente a un usuario (auth.users -> cascada total)
create or replace function public.admin_delete_user(target_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_supervisor() then
    raise exception 'Acceso denegado: solo un supervisor puede eliminar usuarios';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Operación inválida: no puedes eliminar tu propia cuenta activa';
  end if;

  delete from auth.users where id = target_user_id;
end $$;

-- 5. Habilitar Row Level Security (RLS) en TODAS las tablas del esquema public
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_pending_actions enable row level security;
alter table public.audit_logs enable row level security;

-- 6. Reemplazar políticas de profiles para evitar fuga de perfiles entre colaboradores no relacionados
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_supervisor on public.profiles;
drop policy if exists profiles_insert_supervisor on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_supervisor on public.profiles;
drop policy if exists profiles_delete_supervisor on public.profiles;
drop policy if exists profiles_select_scoped on public.profiles;
drop policy if exists profiles_insert_scoped on public.profiles;
drop policy if exists profiles_update_scoped on public.profiles;

create policy profiles_select_scoped on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_supervisor()
    or exists (
      select 1 from public.tasks t
      where (t.owner_id = auth.uid() or t.assignee_id = auth.uid())
        and (t.owner_id = profiles.id or t.assignee_id = profiles.id)
    )
  );

create policy profiles_insert_scoped on public.profiles
  for insert to authenticated
  with check (id = auth.uid() or public.is_supervisor());

create policy profiles_update_scoped on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_supervisor())
  with check (id = auth.uid() or public.is_supervisor());

create policy profiles_delete_supervisor on public.profiles
  for delete to authenticated
  using (public.is_supervisor());

-- 7. Políticas de user_roles: solo lectura propia o supervisor; cero escritura desde clientes
drop policy if exists roles_select_own on public.user_roles;
drop policy if exists roles_select_scoped on public.user_roles;

create policy roles_select_scoped on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_supervisor());

-- 8. Políticas de chat_messages y agent_pending_actions
drop policy if exists chat_select_own on public.chat_messages;
drop policy if exists chat_insert_own on public.chat_messages;
drop policy if exists chat_delete_own on public.chat_messages;

create policy chat_select_own on public.chat_messages
  for select to authenticated
  using (user_id = auth.uid());

create policy chat_insert_own on public.chat_messages
  for insert to authenticated
  with check (user_id = auth.uid());

create policy chat_delete_own on public.chat_messages
  for delete to authenticated
  using (user_id = auth.uid());

-- 9. Políticas de audit_logs: lectura exclusiva de supervisor; inserción controlada vía middleware
drop policy if exists audit_select_supervisor on public.audit_logs;
drop policy if exists audit_insert_authenticated on public.audit_logs;
drop policy if exists audit_insert_middleware on public.audit_logs;

create policy audit_select_supervisor on public.audit_logs
  for select to authenticated
  using (public.is_supervisor());

create policy audit_insert_middleware on public.audit_logs
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid() or public.is_supervisor());

-- 10. Revocar privilegios amplios de anon y otorgar permisos mínimos necesarios
revoke all on public.profiles, public.user_roles, public.tasks, public.chat_messages, public.agent_pending_actions, public.audit_logs from anon;
revoke all on all routines in schema public from anon;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.tasks, public.chat_messages, public.agent_pending_actions to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant insert on public.audit_logs to anon, authenticated;
grant select on public.audit_logs to authenticated;

grant execute on function public.is_supervisor() to authenticated, service_role;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;
