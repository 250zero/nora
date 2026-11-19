-- ==============================================================================
-- Migración 0004_auto_confirm_email.sql — Auto-confirmación de email para pruebas
-- ==============================================================================

-- 1. Trigger para auto-confirmar usuarios en auth.users
create or replace function public.auto_confirm_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;

drop trigger if exists trg_auto_confirm_user on auth.users;
create trigger trg_auto_confirm_user before insert on auth.users
for each row execute function public.auto_confirm_user();

-- 2. Confirmar los usuarios que ya existan y no estén confirmados
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
