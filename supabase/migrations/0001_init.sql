-- ==============================================================================
-- Migración 0001_init.sql — Esquema Base Nora (Optimizado para Cero Sobrecarga)
-- 5FN, RLS estricto, Enums smallint, ip_address tipo inet (7-19 bytes)
-- y auditoría desacoplada en capa de aplicación (0 triggers DML)
-- ==============================================================================

create extension if not exists pg_trgm;

-- 1. PROFILES (Vinculado a auth.users con cascada estricta y tipos optimizados)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  varchar(80) not null check (char_length(display_name) >= 1),
  email         varchar(255),
  timezone      varchar(50) not null default 'America/Santo_Domingo',
  created_at    timestamptz not null default now()
);

-- 2. TASKS (Entidad central de tareas)
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  assignee_id      uuid references public.profiles(id) on delete cascade,
  title            varchar(200) not null check (char_length(btrim(title)) >= 1),
  description      text check (char_length(description) <= 2000),
  due_date         date,
  due_time         time,
  priority         smallint not null default 2 check (priority in (1,2,3)), -- 1=baja, 2=media, 3=alta
  status           smallint not null default 1 check (status in (1,2,3)),   -- 1=pendiente, 2=en_progreso, 3=hecha
  responsible_name varchar(80),
  source           smallint not null default 1 check (source in (1,2)),     -- 1=manual, 2=asistente_ia
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ix_tasks_owner_status_due on public.tasks (owner_id, status, due_date, due_time);
create index if not exists ix_tasks_assignee_status on public.tasks (assignee_id, status, due_date);
create index if not exists ix_tasks_title_trgm on public.tasks using gin (title gin_trgm_ops);

-- 3. CHAT_MESSAGES (Historial de conversación del usuario con el asistente IA)
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        smallint not null check (role in (1,2)), -- 1=user, 2=assistant
  content     text not null check (char_length(content) between 1 and 4000),
  actions     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ix_chat_user_created on public.chat_messages (user_id, created_at desc);

-- 4. AGENT_PENDING_ACTIONS (Acciones destructivas pendientes de confirmación)
create table if not exists public.agent_pending_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  action_type  smallint not null check (action_type in (1,2)), -- 1=eliminar_tarea, 2=eliminar_usuario
  status       smallint not null default 1 check (status in (1,2,3,4)), -- 1=pendiente, 2=confirmada, 3=cancelada, 4=expirada
  expires_at   timestamptz not null default now() + interval '10 minutes',
  created_at   timestamptz not null default now()
);

create index if not exists ix_pending_user_status on public.agent_pending_actions (user_id, status);

-- 5. AUDIT_LOGS (Auditoría transaccional optimizada: INET nativo de 7-19 bytes en vez de TEXT)
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  table_name  varchar(63) not null,
  record_id   uuid,
  action      smallint not null check (action in (1,2,3,4)), -- 1=INSERT, 2=UPDATE, 3=DELETE, 4=SELECT
  old_data    jsonb,
  new_data    jsonb,
  ip_address  inet,              -- Optimización: 7 bytes (IPv4) o 19 bytes (IPv6) con validación binaria
  user_agent  varchar(500),      -- Acotado a 500 chars para evitar desbordes y TOAST
  created_at  timestamptz not null default now()
);

create index if not exists ix_audit_logs_user_table on public.audit_logs (user_id, table_name, created_at desc);
create index if not exists ix_audit_logs_created on public.audit_logs (created_at desc);

-- 6. TRIGGERS DE NEGOCIO (Exclusivamente timestamps y perfil de nuevo usuario)
create or replace function public.tg_tasks_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 3 and (tg_op = 'INSERT' or old.status <> 3) then 
    new.completed_at := now(); 
  end if;
  if new.status <> 3 then 
    new.completed_at := null; 
  end if;
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner_id es inmutable';
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before insert or update on public.tasks
for each row execute function public.tg_tasks_touch();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id, 
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 7. RLS Y SEGURIDAD
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_pending_actions enable row level security;
alter table public.audit_logs enable row level security;

-- Políticas de Profiles
create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Políticas de Tasks
create policy tasks_select_own on public.tasks for select to authenticated 
  using (owner_id = auth.uid() or assignee_id = auth.uid());
create policy tasks_insert_own on public.tasks for insert to authenticated 
  with check (owner_id = auth.uid());
create policy tasks_update_own on public.tasks for update to authenticated 
  using (owner_id = auth.uid() or assignee_id = auth.uid()) 
  with check (owner_id = auth.uid() or assignee_id = auth.uid());
create policy tasks_delete_own on public.tasks for delete to authenticated 
  using (owner_id = auth.uid());

-- Políticas de Chat
create policy chat_select_own on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy chat_insert_own on public.chat_messages for insert to authenticated with check (user_id = auth.uid());

-- Políticas de Pending Actions
create policy pending_all_own on public.agent_pending_actions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Hardening
revoke all on public.tasks, public.chat_messages, public.agent_pending_actions, public.profiles, public.audit_logs from anon;
