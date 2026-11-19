-- ==============================================================================
-- Migración 0003_auth_users_roles.sql — Sincronización automática de roles en Auth
-- ==============================================================================

-- 1. Actualizar handle_new_user para que garantice profile y user_roles
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  assigned_role smallint := 1; -- 1 = Miembro por defecto
begin
  -- Si el email o metadata indica supervisor, asignar rol 2
  if new.email ilike '%supervisor%' or new.email ilike '%ana@%' then
    assigned_role := 2;
  end if;

  -- 1. Crear o actualizar perfil
  insert into public.profiles (id, display_name, email, timezone)
  values (
    new.id, 
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
    new.email,
    'America/Santo_Domingo'
  )
  on conflict (id) do update
  set display_name = coalesce(nullif(new.raw_user_meta_data->>'display_name',''), profiles.display_name),
      email = excluded.email;

  -- 2. Crear o actualizar rol en user_roles
  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;

  return new;
end $$;

-- 2. Política para que anon/authenticated puedan invocar funciones de login o backend
grant usage on schema public to anon, authenticated, service_role;
grant all on public.profiles to authenticated, service_role;
grant all on public.user_roles to authenticated, service_role;
